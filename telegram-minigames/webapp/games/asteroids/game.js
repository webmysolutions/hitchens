/* Asteroids — drag to fly, autofire; big rocks split into smaller. */
(function () {
'use strict';
MG.register('asteroids', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var raf = 0, last = 0, paused = false;
  var started, over, score, elapsed;
  var ship, rocks, bullets, parts, star;
  var fireAcc, spawnAcc, spawnEvery, starAcc, shieldT;
  var keys = {};
  var VAL = { 3: 20, 2: 50, 1: 100 };
  var RAD = { 3: 32, 2: 20, 1: 11 };
  var MAXR = api.lowEnd ? 8 : 14;
  var MAXP = api.lowEnd ? 16 : 50;

  function mkRock(size, x, y, vx, vy) {
    var n = 8, verts = [];
    for (var i = 0; i < n; i++) verts.push(0.72 + Math.random() * 0.4);
    return { size: size, r: RAD[size], x: x, y: y, vx: vx, vy: vy,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2, verts: verts };
  }

  function spawnEdge() {
    if (rocks.length >= MAXR) return;
    var side = (Math.random() * 4) | 0, x, y;
    if (side === 0) { x = -40; y = Math.random() * cv.H; }
    else if (side === 1) { x = cv.W + 40; y = Math.random() * cv.H; }
    else if (side === 2) { x = Math.random() * cv.W; y = -40; }
    else { x = Math.random() * cv.W; y = cv.H + 40; }
    var ang = Math.atan2(cv.H / 2 - y, cv.W / 2 - x) + (Math.random() - 0.5) * 1.2;
    var sp = 35 + Math.random() * 50 + Math.min(60, elapsed / 1500);
    rocks.push(mkRock(3, x, y, Math.cos(ang) * sp, Math.sin(ang) * sp));
  }

  function reset() {
    score = 0; elapsed = 0;
    started = false; over = false;
    ship = { x: cv.W / 2, y: cv.H * 0.7, tx: cv.W / 2, ty: cv.H * 0.7, ang: -Math.PI / 2 };
    rocks = []; bullets = []; parts = [];
    star = null;
    fireAcc = 0; spawnAcc = 0; spawnEvery = 3200; starAcc = 0; shieldT = 0;
    api.score(0);
    for (var i = 0; i < 3; i++) spawnEdge();
  }

  function boom(x, y, col, n) {
    if (api.lowEnd) n = Math.min(4, n);
    for (var i = 0; i < n && parts.length < MAXP; i++) {
      var a = Math.random() * 6.283, s = 30 + Math.random() * 110;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 420, col: col });
    }
  }

  function breakRock(idx) {
    var r = rocks[idx];
    rocks.splice(idx, 1);
    score += VAL[r.size];
    api.score(score);
    api.haptic('light');
    boom(r.x, r.y, C.muted, 4 + r.size * 2);
    if (r.size > 1) {
      for (var k = 0; k < 2; k++) {
        var a = Math.random() * 6.283, sp = 50 + Math.random() * 60;
        rocks.push(mkRock(r.size - 1, r.x, r.y, r.vx * 0.4 + Math.cos(a) * sp, r.vy * 0.4 + Math.sin(a) * sp));
      }
    }
  }

  function update(dt) {
    var s = dt / 1000;
    elapsed += dt;
    spawnEvery = Math.max(1100, 3200 - elapsed / 30);

    // keyboard steering moves the target point
    var kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0);
    var ky = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
    if (kx || ky) {
      ship.tx += kx * 330 * s;
      ship.ty += ky * 330 * s;
    }
    ship.tx = Math.max(16, Math.min(cv.W - 16, ship.tx));
    ship.ty = Math.max(16, Math.min(cv.H - 16, ship.ty));
    var ox = ship.x, oy = ship.y;
    var e = Math.min(1, s * 7);
    ship.x += (ship.tx - ship.x) * e;
    ship.y += (ship.ty - ship.y) * e;
    var mvx = ship.x - ox, mvy = ship.y - oy;
    var target = (mvx * mvx + mvy * mvy > 0.16) ? Math.atan2(mvy, mvx) : -Math.PI / 2;
    var da = target - ship.ang;
    while (da > Math.PI) da -= 6.283;
    while (da < -Math.PI) da += 6.283;
    ship.ang += da * Math.min(1, s * 10);

    if (shieldT > 0) shieldT -= dt;

    // autofire
    fireAcc += dt;
    if (fireAcc >= 300) {
      fireAcc = 0;
      bullets.push({ x: ship.x + Math.cos(ship.ang) * 14, y: ship.y + Math.sin(ship.ang) * 14,
        vx: Math.cos(ship.ang) * 430, vy: Math.sin(ship.ang) * 430, t: 1100 });
    }

    // spawn rocks / star
    spawnAcc += dt;
    if (spawnAcc >= spawnEvery) { spawnAcc = 0; spawnEdge(); }
    starAcc += dt;
    if (!star && starAcc >= 14000) {
      starAcc = 0;
      star = { x: 40 + Math.random() * (cv.W - 80), y: 60 + Math.random() * (cv.H - 120), t: 8000 };
    }
    if (star) {
      star.t -= dt;
      if (star.t <= 0) star = null;
      else {
        var dx = star.x - ship.x, dy = star.y - ship.y;
        if (dx * dx + dy * dy < 26 * 26) {
          star = null;
          shieldT = 5000;
          api.haptic('success');
        }
      }
    }

    // rocks
    var i, r;
    for (i = rocks.length - 1; i >= 0; i--) {
      r = rocks[i];
      r.x += r.vx * s; r.y += r.vy * s; r.rot += r.vr * s;
      if (r.x < -r.r - 50) r.x = cv.W + r.r + 40;
      else if (r.x > cv.W + r.r + 50) r.x = -r.r - 40;
      if (r.y < -r.r - 50) r.y = cv.H + r.r + 40;
      else if (r.y > cv.H + r.r + 50) r.y = -r.r - 40;
      // ship collision
      var ddx = r.x - ship.x, ddy = r.y - ship.y;
      var rr = r.r + 10;
      if (ddx * ddx + ddy * ddy < rr * rr) {
        if (shieldT > 0) { breakRock(i); continue; }
        over = true;
        boom(ship.x, ship.y, C.bad, 16);
        api.haptic('error');
        api.gameOver(score);
        return;
      }
    }

    // bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      b.t -= dt;
      b.x += b.vx * s; b.y += b.vy * s;
      if (b.t <= 0 || b.x < -10 || b.x > cv.W + 10 || b.y < -10 || b.y > cv.H + 10) {
        bullets.splice(i, 1); continue;
      }
      for (var j = rocks.length - 1; j >= 0; j--) {
        r = rocks[j];
        var ex = b.x - r.x, ey = b.y - r.y;
        if (ex * ex + ey * ey < r.r * r.r) {
          bullets.splice(i, 1);
          breakRock(j);
          break;
        }
      }
    }

    // particles
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t -= dt;
      if (p.t <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * s; p.y += p.vy * s;
    }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    var i;
    // rocks
    g.lineWidth = 2;
    for (i = 0; i < rocks.length; i++) {
      var r = rocks[i];
      g.save();
      g.translate(r.x, r.y);
      g.rotate(r.rot);
      g.beginPath();
      for (var k = 0; k < r.verts.length; k++) {
        var a = k / r.verts.length * 6.283;
        var rr = r.r * r.verts[k];
        if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = C.panel;
      g.fill();
      g.strokeStyle = C.muted;
      g.stroke();
      g.restore();
    }
    // star power-up
    if (star) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '26px sans-serif';
      g.globalAlpha = star.t < 2000 ? (((star.t / 200) | 0) % 2 ? 0.3 : 1) : 1;
      g.fillText('⭐', star.x, star.y);
      g.globalAlpha = 1;
    }
    // bullets
    g.fillStyle = C.accent;
    for (i = 0; i < bullets.length; i++) {
      g.beginPath();
      g.arc(bullets[i].x, bullets[i].y, 3, 0, 6.283);
      g.fill();
    }
    // particles
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      g.globalAlpha = Math.max(0, p.t / 420);
      g.fillStyle = p.col;
      g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    g.globalAlpha = 1;
    // ship
    if (!over) {
      g.save();
      g.translate(ship.x, ship.y);
      g.rotate(ship.ang + Math.PI / 2);
      g.fillStyle = C.accent;
      g.beginPath();
      g.moveTo(0, -14);
      g.lineTo(-10, 12);
      g.lineTo(0, 7);
      g.lineTo(10, 12);
      g.closePath();
      g.fill();
      g.restore();
      if (shieldT > 0) {
        g.strokeStyle = C.good;
        g.lineWidth = 2;
        g.globalAlpha = shieldT < 1200 ? (((shieldT / 150) | 0) % 2 ? 0.25 : 0.9) : 0.9;
        g.beginPath();
        g.arc(ship.x, ship.y, 22, 0, 6.283);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Тяни палец — корабль летит за ним' : 'Drag anywhere — the ship follows', cv.W / 2, cv.H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last);
    last = ts;
    if (started && !over) update(dt);
    draw();
  }

  // input: drag anywhere sets the ship target
  function pt(e) {
    var t = e.touches ? e.touches[0] : e;
    var rc = container.getBoundingClientRect();
    return { x: t.clientX - rc.left, y: t.clientY - rc.top };
  }
  var dragging = false;
  function onDown(e) {
    if (over) return;
    if (!started) started = true;
    dragging = true;
    var p = pt(e);
    ship.tx = p.x; ship.ty = p.y;
    if (e.cancelable) e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    var p = pt(e);
    ship.tx = p.x; ship.ty = p.y;
    if (e.cancelable) e.preventDefault();
  }
  function onUp() { dragging = false; }
  container.addEventListener('touchstart', onDown, { passive: false });
  container.addEventListener('touchmove', onMove, { passive: false });
  container.addEventListener('touchend', onUp);
  container.addEventListener('mousedown', onDown);
  container.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  function onKey(e) {
    var d = e.type === 'keydown';
    if (e.key === ' ' && d) { started = true; e.preventDefault(); return; }
    if (/^(Arrow(Left|Right|Up|Down)|[wasd])$/.test(e.key)) {
      keys[e.key] = d;
      if (d) started = true;
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  cv.onResize = function () {
    ship.tx = Math.min(ship.tx, cv.W - 16);
    ship.ty = Math.min(ship.ty, cv.H - 16);
    draw();
  };

  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('mouseup', onUp);
      container.removeEventListener('touchstart', onDown);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onUp);
      container.removeEventListener('mousedown', onDown);
      container.removeEventListener('mousemove', onMove);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
