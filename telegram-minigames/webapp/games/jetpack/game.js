/* Jetpack — hold to thrust, dodge zappers & missiles, grab coins. MG contract. */
(function () {
'use strict';
MG.register('jetpack', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var LOW = api.lowEnd;

  // ---- derived shades ----
  function rgbOf(col) {
    if (col.charAt(0) === '#') {
      var h = col.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var v = parseInt(h.slice(0, 6), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var m = /(\d+)[^\d]+(\d+)[^\d]+(\d+)/.exec(col);
    return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function mix(a, b, t) {
    var A = rgbOf(a), B = rgbOf(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  var floorCol = mix(C.panel, C.text, 0.08);
  var wallStripe = mix(C.panel2, C.bg, 0.3);
  var coinCol = mix(C.accent, C.text, 0.25);
  var coinDark = mix(C.accent, C.bg, 0.25);
  var zapGlow = mix(C.bad, C.bg, 0.45);
  var packCol = mix(C.panel2, C.text, 0.2);
  var flameA = C.accent, flameB = C.bad;

  // ---- state ----
  var PX, FLOOR, CEIL = 8, R = 13;
  var y, vy, dist, spd;
  var coins = 0, meters = 0, score = 0, lastScore = -1, nextMile = 500;
  var started = false, alive = true, paused = false;
  var raf = 0, last = 0, t = 0;

  // ---- pools ----
  var CN = 48, cs = [], i0;
  for (i0 = 0; i0 < CN; i0++) cs.push({ x: 0, y: 0, on: false });
  var cIdx = 0, nextCoinX = 0;
  var ZN = 5, zs = [];
  for (i0 = 0; i0 < ZN; i0++) zs.push({ x: 0, y: 0, hl: 60, ang: 0, rot: 0, on: false });
  var zIdx = 0, nextZapX = 0;
  var MN = 3, ms = [];
  for (i0 = 0; i0 < MN; i0++) ms.push({ st: 0, x: 0, y: 0, t: 0 }); // st: 0 off, 1 warn, 2 fly
  var nextMisX = 0;
  var FN = LOW ? 10 : 28, fs = [];
  for (i0 = 0; i0 < FN; i0++) fs.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  var fIdx = 0;

  function reset() {
    PX = cv.W * 0.25;
    FLOOR = cv.H - 24;
    y = FLOOR - R; vy = 0; dist = 0; spd = 250;
    coins = 0; meters = 0; score = 0; lastScore = -1; nextMile = 500;
    started = false; alive = true; t = 0;
    nextCoinX = 500; nextZapX = 900; nextMisX = 2200;
    for (var i = 0; i < CN; i++) cs[i].on = false;
    for (i = 0; i < ZN; i++) zs[i].on = false;
    for (i = 0; i < MN; i++) ms[i].st = 0;
    for (i = 0; i < FN; i++) fs[i].life = 0;
    api.score(0);
  }

  // ---- input ----
  var hold = false;
  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    hold = true;
    if (!started && alive) started = true;
  }
  function onUp() { hold = false; }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      if (e.type === 'keydown') { hold = true; if (!started && alive) started = true; }
      else hold = false;
      e.preventDefault();
    }
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function die() {
    alive = false;
    api.haptic('error');
    api.gameOver(score);
  }

  function spawn() {
    var W = cv.W, ahead = dist + W * 1.6;
    while (nextCoinX < ahead) {
      var kind = (Math.random() * 3) | 0;
      var n = 5 + ((Math.random() * 4) | 0);
      var by = 60 + Math.random() * (FLOOR - 150);
      for (var k = 0; k < n; k++) {
        var c = cs[cIdx]; cIdx = (cIdx + 1) % CN;
        c.x = nextCoinX + k * 34;
        c.y = kind === 0 ? by : kind === 1 ? by + Math.sin(k * 0.8) * 50 : by + k * 22;
        if (c.y > FLOOR - 20) c.y = FLOOR - 20;
        c.on = true;
      }
      nextCoinX += n * 34 + 320 + Math.random() * 480;
    }
    while (nextZapX < ahead) {
      var z = zs[zIdx]; zIdx = (zIdx + 1) % ZN;
      var typ = (Math.random() * 4) | 0;
      z.hl = 45 + Math.random() * 45;
      z.ang = typ === 0 ? 0 : typ === 1 ? Math.PI / 2 : Math.PI / 4;
      z.rot = typ === 3 ? (Math.random() < 0.5 ? 1.4 : -1.4) : 0;
      z.y = z.hl + 30 + Math.random() * (FLOOR - 2 * (z.hl + 30));
      z.x = nextZapX;
      z.on = true;
      nextZapX += Math.max(360, 750 - dist * 0.01) + Math.random() * 450;
    }
    if (dist > nextMisX) {
      for (var mi = 0; mi < MN; mi++) {
        if (ms[mi].st === 0) {
          ms[mi].st = 1; ms[mi].t = 0; ms[mi].y = y;
          break;
        }
      }
      nextMisX = dist + 1100 + Math.random() * 1300;
    }
  }

  function segDist2(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var tt = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
    var qx = ax + dx * tt - px, qy = ay + dy * tt - py;
    return qx * qx + qy * qy;
  }

  function update(dt) {
    spd = Math.min(600, 250 + dist * 0.012);
    dist += spd * dt;
    vy += (hold ? -3400 : 0) * dt + 1900 * dt;
    if (vy > 850) vy = 850;
    if (vy < -620) vy = -620;
    y += vy * dt;
    if (y > FLOOR - R) { y = FLOOR - R; vy = 0; }
    if (y < CEIL + R) { y = CEIL + R; vy = 0; }
    spawn();
    var i, dx, dy;
    // flame particles
    if (hold) {
      for (i = 0; i < (LOW ? 1 : 2); i++) {
        var f = fs[fIdx]; fIdx = (fIdx + 1) % FN;
        f.x = PX - 10; f.y = y + 10;
        f.vx = -120 - Math.random() * 80;
        f.vy = 120 + Math.random() * 120;
        f.life = 0.35 + Math.random() * 0.15;
      }
    }
    for (i = 0; i < FN; i++) {
      var q = fs[i];
      if (q.life > 0) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    }
    // coins
    for (i = 0; i < CN; i++) {
      var c = cs[i];
      if (!c.on) continue;
      dx = c.x - dist;
      if (dx < -PX - 30) { c.on = false; continue; }
      dy = c.y - y;
      if (dx * dx + dy * dy < 26 * 26) {
        c.on = false; coins++;
        if (coins % 10 === 0) api.haptic('light');
      }
    }
    // zappers
    for (i = 0; i < ZN; i++) {
      var z = zs[i];
      if (!z.on) continue;
      dx = z.x - dist;
      if (dx < -PX - z.hl - 40) { z.on = false; continue; }
      if (z.rot) z.ang += z.rot * dt;
      if (dx > -z.hl - 40 && dx < z.hl + 40) {
        var ca = Math.cos(z.ang) * z.hl, sa = Math.sin(z.ang) * z.hl;
        if (segDist2(0, y, dx - ca, z.y - sa, dx + ca, z.y + sa) < (R + 6) * (R + 6)) { die(); return; }
      }
    }
    // missiles
    for (i = 0; i < MN; i++) {
      var mm = ms[i];
      if (mm.st === 1) {
        mm.t += dt;
        mm.y += (y - mm.y) * Math.min(1, dt * 6); // track player while warning
        if (mm.t > 1.1) { mm.st = 2; mm.x = cv.W + 30; api.haptic('medium'); }
      } else if (mm.st === 2) {
        mm.x -= (spd * 0.9 + 520) * dt;
        if (mm.x < -40) { mm.st = 0; continue; }
        dx = mm.x - PX; dy = mm.y - y;
        if (dx * dx + dy * dy < (R + 10) * (R + 10)) { die(); return; }
      }
    }
    meters = (dist / 10) | 0;
    score = meters + coins * 5;
    if (score !== lastScore) { lastScore = score; api.score(score); }
    if (meters >= nextMile) { api.haptic('light'); nextMile += 500; }
  }

  function draw() {
    var W = cv.W, H = cv.H, i;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    // background stripes (parallax lab wall)
    if (!LOW) {
      g.fillStyle = wallStripe;
      var off = (dist * 0.4) % 220;
      for (i = -1; i < W / 220 + 1; i++) g.fillRect(i * 220 - off, 0, 26, H);
    }
    // floor / ceiling
    g.fillStyle = floorCol;
    g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillRect(0, 0, W, CEIL);
    g.strokeStyle = wallStripe;
    g.lineWidth = 2;
    g.setLineDash([26, 18]);
    g.lineDashOffset = dist % 44;
    g.beginPath();
    g.moveTo(0, FLOOR + 8); g.lineTo(W, FLOOR + 8);
    g.stroke();
    g.setLineDash([]);
    // coins
    for (i = 0; i < CN; i++) {
      var c = cs[i];
      if (!c.on) continue;
      var cx = c.x - dist + PX;
      if (cx < -20 || cx > W + 20) continue;
      g.fillStyle = coinCol;
      g.beginPath();
      g.arc(cx, c.y, 10, 0, 6.29);
      g.fill();
      g.strokeStyle = coinDark;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(cx, c.y, 6, 0, 6.29);
      g.stroke();
    }
    // zappers
    for (i = 0; i < ZN; i++) {
      var z = zs[i];
      if (!z.on) continue;
      var zx = z.x - dist + PX;
      if (zx < -z.hl - 30 || zx > W + z.hl + 30) continue;
      var ca = Math.cos(z.ang) * z.hl, sa = Math.sin(z.ang) * z.hl;
      g.strokeStyle = zapGlow;
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(zx - ca, z.y - sa); g.lineTo(zx + ca, z.y + sa);
      g.stroke();
      g.strokeStyle = C.bad;
      g.lineWidth = 3;
      g.setLineDash([8, 6]);
      g.lineDashOffset = t * 40;
      g.beginPath();
      g.moveTo(zx - ca, z.y - sa); g.lineTo(zx + ca, z.y + sa);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = C.text;
      g.beginPath();
      g.arc(zx - ca, z.y - sa, 5, 0, 6.29);
      g.arc(zx + ca, z.y + sa, 5, 0, 6.29);
      g.fill();
    }
    // missiles
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (i = 0; i < MN; i++) {
      var mm = ms[i];
      if (mm.st === 1) {
        if ((mm.t * 6 | 0) % 2 === 0) {
          g.font = '26px sans-serif';
          g.fillText('⚠', W - 24, mm.y);
        }
      } else if (mm.st === 2) {
        g.fillStyle = C.bad;
        g.beginPath();
        g.moveTo(mm.x - 14, mm.y - 6);
        g.lineTo(mm.x + 10, mm.y - 6);
        g.lineTo(mm.x + 18, mm.y);
        g.lineTo(mm.x + 10, mm.y + 6);
        g.lineTo(mm.x - 14, mm.y + 6);
        g.closePath();
        g.fill();
        g.fillStyle = flameA;
        g.beginPath();
        g.arc(mm.x - 17, mm.y, 4 + Math.random() * 3, 0, 6.29);
        g.fill();
      }
    }
    // flame
    for (i = 0; i < FN; i++) {
      var f = fs[i];
      if (f.life <= 0) continue;
      g.globalAlpha = f.life * 2.2;
      g.fillStyle = f.life > 0.22 ? flameA : flameB;
      g.beginPath();
      g.arc(f.x, f.y, 2 + (0.5 - f.life) * 9, 0, 6.29);
      g.fill();
    }
    g.globalAlpha = 1;
    // player
    g.save();
    g.translate(PX, y);
    g.rotate(Math.max(-0.18, Math.min(0.18, vy * 0.0003)));
    g.fillStyle = packCol;        // jetpack
    g.fillRect(-15, -8, 8, 18);
    g.fillStyle = C.text;         // body
    g.beginPath();
    g.arc(0, -8, 6, 0, 6.29);     // head
    g.fill();
    g.fillRect(-6, -3, 12, 15);   // torso
    g.fillStyle = C.accent;       // visor
    g.fillRect(1, -11, 6, 5);
    g.restore();
    // HUD
    if (started) {
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.textAlign = 'left';
      g.fillText('🪙 ' + coins + '   ' + meters + (api.lang === 'ru' ? ' м' : ' m'), 12, 20);
    }
    // start overlay
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2 - 14);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Держи, чтобы лететь вверх' : 'Hold to fly up', W / 2, H / 2 + 14);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last) / 1000;
    last = ts;
    t += dt;
    if (started && alive) update(dt);
    draw();
  }

  cv.onResize = function () {
    PX = cv.W * 0.25;
    FLOOR = cv.H - 24;
    if (y > FLOOR - R) y = FLOOR - R;
    draw();
  };
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
