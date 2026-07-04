/* Ballz — BBTAN-style brick breaker. Drag to aim, release to fire the volley. */
(function () {
'use strict';
MG.register('ballz', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var COLS = 7, R = 7, SPEED = 0.72, TAU = Math.PI * 2;
  var raf = 0, last = 0, paused = false, over = false, started = false;
  var cell = 0, topY = 6, lineY = 0, rows = 0;
  var bricks = [], grid = [], pickups = [], balls = [], parts = [];
  var round = 1, total = 1, pend = 0, launchX = 0, firstLand = -1;
  var state = 'aim', ff = false, dropT = 0, fireT = 0, fired = 0;
  var aiming = false, aimAng = -1, p0x = 0, p0y = 0;

  function hexHue(hex) {
    var m = /([0-9a-f]{6})/i.exec(hex || '');
    if (!m) return 210;
    var n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, gr = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(r, gr, b), mn = Math.min(r, gr, b), d = mx - mn, h = 0;
    if (d) { h = mx === r ? ((gr - b) / d + 6) % 6 : mx === gr ? (b - r) / d + 2 : (r - gr) / d + 4; h *= 60; }
    return h;
  }
  var hue0 = hexHue(C.accent);
  function bCol(hp) { return 'hsl(' + (((hue0 + 180 + hp * 16) % 360) | 0) + ',60%,50%)'; }

  var MAXP = api.lowEnd ? 14 : 40;
  for (var i0 = 0; i0 < MAXP; i0++) parts.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, col: '' });
  function boom(x, y, col) {
    var n = api.lowEnd ? 4 : 8;
    for (var i = 0; i < MAXP && n > 0; i++) {
      var p = parts[i];
      if (p.life > 0) continue;
      p.life = 380; p.x = x; p.y = y; p.col = col;
      p.vx = (Math.random() - 0.5) * 0.5; p.vy = (Math.random() - 0.5) * 0.5;
      n--;
    }
  }

  function layout() {
    cell = cv.W / COLS;
    lineY = cv.H - 72;
    rows = Math.max(6, Math.floor((lineY - topY) / cell));
    rebuildGrid();
  }
  cv.onResize = function () { layout(); };

  function rebuildGrid() {
    var need = COLS * rows, i;
    grid.length = need;
    for (i = 0; i < need; i++) grid[i] = null;
    for (i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (b.r >= 0 && b.r < rows) grid[b.r * COLS + b.c] = b;
    }
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function spawnRow() {
    var free = [], c, i;
    for (c = 0; c < COLS; c++) free.push(c);
    shuffle(free);
    var n = 2 + ((Math.random() * 4) | 0);
    for (i = 0; i < n; i++) bricks.push({ c: free.pop(), r: 0, hp: Math.random() < 0.15 ? round * 2 : round });
    if (free.length && Math.random() < 0.65) pickups.push({ c: free.pop(), r: 0 });
    rebuildGrid();
  }

  function reset() {
    bricks.length = 0; pickups.length = 0;
    round = 1; total = 1; pend = 0; firstLand = -1;
    launchX = cv.W / 2;
    state = 'aim'; ff = false; dropT = 0; over = false; started = false;
    api.score(round);
    spawnRow();
  }

  function brickAt(px, py) {
    if (py < topY) return null;
    var c = (px / cell) | 0, r = ((py - topY) / cell) | 0;
    if (c < 0 || c >= COLS || r < 0 || r >= rows) return null;
    return grid[r * COLS + c] || null;
  }

  function hitBrick(b) {
    b.hp--;
    if (b.hp <= 0) {
      grid[b.r * COLS + b.c] = null;
      var i = bricks.indexOf(b);
      if (i >= 0) bricks.splice(i, 1);
      boom(b.c * cell + cell / 2, topY + b.r * cell + cell / 2, bCol(round));
    }
  }

  function fire(a) {
    while (balls.length < total) balls.push({ x: 0, y: 0, vx: 0, vy: 0, on: false });
    var vx = Math.cos(a), vy = -Math.sin(a), i;
    for (i = 0; i < total; i++) {
      var b = balls[i];
      b.on = false; b.vx = vx; b.vy = vy; b.x = launchX; b.y = lineY - R;
    }
    fired = 0; fireT = 0; state = 'fly'; ff = false; firstLand = -1;
    api.haptic('light');
  }

  function moveBall(b, s) {
    var nx = b.x + b.vx * s, ny = b.y + b.vy * s, i;
    if (nx < R) { nx = R; b.vx = -b.vx; }
    else if (nx > cv.W - R) { nx = cv.W - R; b.vx = -b.vx; }
    if (ny < topY + R) { ny = topY + R; b.vy = -b.vy; }
    if (ny > lineY - R && b.vy > 0) {
      b.on = false; b.y = lineY - R;
      b.x = Math.max(R, Math.min(cv.W - R, nx));
      if (firstLand < 0) firstLand = b.x;
      return;
    }
    var hb = brickAt(nx + (b.vx > 0 ? R : -R), b.y);
    if (hb) { hitBrick(hb); b.vx = -b.vx; nx = b.x; }
    var vb = brickAt(nx, ny + (b.vy > 0 ? R : -R));
    if (vb) { if (vb !== hb) hitBrick(vb); b.vy = -b.vy; ny = b.y; }
    b.x = nx; b.y = ny;
    for (i = pickups.length - 1; i >= 0; i--) {
      var p = pickups[i];
      var dx = b.x - (p.c * cell + cell / 2), dy = b.y - (topY + p.r * cell + cell / 2);
      if (dx * dx + dy * dy < 380) { pickups.splice(i, 1); pend++; api.haptic('light'); }
    }
  }

  function stepBalls(d) {
    var dist = SPEED * d, live = 0, i;
    for (i = 0; i < fired; i++) {
      var b = balls[i];
      if (!b.on) continue;
      var rem = dist;
      while (rem > 0 && b.on) { var s = Math.min(6, rem); rem -= s; moveBall(b, s); }
      if (b.on) live++;
    }
    if (state === 'fly' && fired >= total && live === 0) endVolley();
  }

  function endVolley() {
    total += pend; pend = 0;
    if (firstLand >= 0) launchX = firstLand;
    var i;
    for (i = 0; i < bricks.length; i++) {
      bricks[i].r++;
      if (bricks[i].r >= rows - 1) {
        over = true; rebuildGrid();
        api.haptic('error'); api.gameOver(round);
        return;
      }
    }
    for (i = pickups.length - 1; i >= 0; i--) {
      pickups[i].r++;
      if (pickups[i].r >= rows - 1) { total++; pickups.splice(i, 1); }
    }
    round++;
    api.score(round);
    api.haptic('light');
    spawnRow();
    dropT = 200; state = 'aim'; ff = false;
  }

  function pd(e) {
    if (over) return;
    started = true;
    if (state === 'fly') { ff = !ff; return; }
    if (state === 'aim') { aiming = true; p0x = e.clientX; p0y = e.clientY; aimAng = -1; }
  }
  function pm(e) {
    if (!aiming || over) return;
    var dx = p0x - e.clientX, dy = p0y - e.clientY;
    if (dy < -14) aimAng = Math.min(Math.PI - 0.16, Math.max(0.16, Math.atan2(-dy, dx)));
    else aimAng = -1;
  }
  function pu() {
    if (!aiming) return;
    aiming = false;
    if (aimAng > 0 && state === 'aim' && !over) { var a = aimAng; aimAng = -1; fire(a); }
    else aimAng = -1;
  }
  function onKey(e) {
    if (over) return;
    var k = e.key;
    started = true;
    if (state === 'aim') {
      if (k === 'ArrowLeft' || k === 'a') { aimAng = Math.min(Math.PI - 0.16, (aimAng < 0 ? Math.PI / 2 : aimAng) + 0.07); e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd') { aimAng = Math.max(0.16, (aimAng < 0 ? Math.PI / 2 : aimAng) - 0.07); e.preventDefault(); }
      else if (k === ' ' || k === 'ArrowUp' || k === 'w') { if (aimAng > 0) { var a = aimAng; aimAng = -1; fire(a); } e.preventDefault(); }
    } else if (state === 'fly' && k === ' ') { ff = !ff; e.preventDefault(); }
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', pd);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu);
  window.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', onKey);

  function overlay() {
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, 0, cv.W, cv.H);
    g.fillStyle = C.text;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 18px sans-serif';
    g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
    g.font = '13px sans-serif';
    g.fillStyle = C.muted;
    g.fillText(api.lang === 'ru' ? 'Тяни вниз, чтобы прицелиться' : 'Drag down to aim', cv.W / 2, cv.H / 2 + 26);
  }

  function draw() {
    var W = cv.W, H = cv.H, i, b;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    var doff = dropT > 0 ? -cell * (dropT / 200) : 0;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold ' + ((cell * 0.36) | 0) + 'px sans-serif';
    for (i = 0; i < bricks.length; i++) {
      b = bricks[i];
      var x = b.c * cell, y = topY + b.r * cell + doff;
      g.fillStyle = bCol(b.hp);
      g.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      g.fillStyle = C.text;
      g.fillText(b.hp, x + cell / 2, y + cell / 2 + 1);
    }
    for (i = 0; i < pickups.length; i++) {
      var p = pickups[i], px = p.c * cell + cell / 2, py = topY + p.r * cell + cell / 2 + doff;
      g.strokeStyle = C.good; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, 10, 0, TAU); g.stroke();
      g.fillStyle = C.good;
      g.beginPath(); g.arc(px, py, 4, 0, TAU); g.fill();
    }
    g.strokeStyle = C.muted; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, lineY); g.lineTo(W, lineY); g.stroke();
    for (i = 0; i < MAXP; i++) {
      var q = parts[i];
      if (q.life <= 0) continue;
      g.globalAlpha = q.life / 380;
      g.fillStyle = q.col;
      g.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    g.globalAlpha = 1;
    if (state === 'aim' && aimAng > 0 && !over) {
      var tx = launchX, ty = lineY - R, tvx = Math.cos(aimAng), tvy = -Math.sin(aimAng), bounced = 0;
      g.fillStyle = C.text;
      for (i = 0; i < 34; i++) {
        tx += tvx * 15; ty += tvy * 15;
        if (tx < R) { tx = R; tvx = -tvx; bounced++; }
        else if (tx > W - R) { tx = W - R; tvx = -tvx; bounced++; }
        if (bounced > 1 || ty < topY + R || brickAt(tx, ty)) break;
        g.beginPath(); g.arc(tx, ty, 2.5, 0, TAU); g.fill();
      }
    }
    g.fillStyle = C.text;
    if (state === 'aim') {
      g.beginPath(); g.arc(launchX, lineY - R, R, 0, TAU); g.fill();
    } else {
      for (i = 0; i < fired; i++) {
        b = balls[i];
        if (b.on) { g.beginPath(); g.arc(b.x, b.y, R, 0, TAU); g.fill(); }
      }
      if (firstLand >= 0) {
        g.fillStyle = C.accent;
        g.beginPath(); g.arc(firstLand, lineY - R, R, 0, TAU); g.fill();
      }
    }
    g.font = 'bold 13px sans-serif';
    g.fillStyle = C.muted;
    g.fillText('x' + (total + pend), Math.min(W - 26, Math.max(26, launchX)), lineY + 18);
    if (ff && state === 'fly') g.fillText('⏩ 2x', W - 36, lineY + 18);
    if (!started && !over) overlay();
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last || 16);
    last = ts;
    if (dropT > 0) dropT = Math.max(0, dropT - dt);
    for (var i = 0; i < MAXP; i++) {
      var p = parts[i];
      if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    if (!over && started && state === 'fly') {
      var d = dt * (ff ? 2 : 1);
      fireT -= d;
      while (fired < total && fireT <= 0) { balls[fired].on = true; fired++; fireT += 70; }
      stepBalls(d);
    }
    draw();
  }

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
