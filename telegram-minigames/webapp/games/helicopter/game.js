/* Copter Cave — hold to rise, release to fall. MG contract. */
(function () {
'use strict';
MG.register('helicopter', function (container, api) {
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
  var wallCol = mix(C.panel2, C.accent, 0.15);
  var wallEdge = mix(C.accent, C.bg, 0.2);
  var blockCol = mix(C.bad, C.panel, 0.25);
  var bodyShade = mix(C.accent, C.bg, 0.35);
  var smokeCol = mix(C.muted, C.bg, 0.4);

  // ---- state ----
  var y, vy, dist, vx;
  var started = false, alive = true, paused = false;
  var raf = 0, last = 0, t = 0;
  var meters = 0, lastMeters = -1, nextMile = 500;
  var CX; // copter screen x

  // ---- cave shape: smooth summed sines, gap narrows with distance ----
  function caveC(x) {
    return 0.5 + 0.17 * Math.sin(x * 0.0011) + 0.11 * Math.sin(x * 0.0027 + 1.7) + 0.05 * Math.sin(x * 0.0059 + 0.6);
  }
  function caveGap(x) {
    var k = Math.min(1, x / 18000);
    return 0.68 - 0.4 * k; // fraction of H: 0.68 -> 0.28
  }
  function topAt(x) {
    var H = cv.H, gap = caveGap(x) * H * 0.5;
    var c = caveC(x) * H;
    if (c < gap + 8) c = gap + 8;
    if (c > H - gap - 8) c = H - gap - 8;
    return c - gap;
  }
  function botAt(x) {
    var H = cv.H, gap = caveGap(x) * H * 0.5;
    var c = caveC(x) * H;
    if (c < gap + 8) c = gap + 8;
    if (c > H - gap - 8) c = H - gap - 8;
    return c + gap;
  }

  // ---- pools ----
  var BN = 5, blocks = [], bi;
  for (bi = 0; bi < BN; bi++) blocks.push({ x: 0, y: 0, w: 26, h: 60, on: false });
  var bIdx = 0, nextBlockX = 0;
  var PN = LOW ? 8 : 24, parts = [];
  for (bi = 0; bi < PN; bi++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  var pIdx = 0;

  function reset() {
    y = cv.H * 0.5; vy = 0; dist = 0; vx = 220;
    started = false; alive = true; t = 0;
    meters = 0; lastMeters = -1; nextMile = 500;
    nextBlockX = 1000;
    for (var i = 0; i < BN; i++) blocks[i].on = false;
    for (i = 0; i < PN; i++) parts[i].life = 0;
    CX = cv.W * 0.28;
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
    api.gameOver(meters);
  }

  function update(dt) {
    vx = Math.min(480, 220 + dist * 0.009);
    dist += vx * dt;
    vy += (hold ? -1900 : 1500) * dt;
    if (vy > 520) vy = 520;
    if (vy < -520) vy = -520;
    y += vy * dt;
    // spawn blocks in the gap
    while (nextBlockX < dist + cv.W * 1.5) {
      var b = blocks[bIdx]; bIdx = (bIdx + 1) % BN;
      var tp = topAt(nextBlockX), bt = botAt(nextBlockX);
      var gapH = bt - tp;
      b.h = gapH * (0.3 + Math.random() * 0.15);
      b.w = 26;
      b.x = nextBlockX;
      b.y = tp + Math.random() * (gapH - b.h);
      b.on = true;
      nextBlockX += 750 + Math.random() * 650;
    }
    // exhaust smoke
    if (hold) {
      var p = parts[pIdx]; pIdx = (pIdx + 1) % PN;
      p.x = CX - 20; p.y = y + 6;
      p.vx = -60 - Math.random() * 40;
      p.vy = 30 + Math.random() * 40;
      p.life = 0.6;
    }
    for (var i = 0; i < PN; i++) {
      var q = parts[i];
      if (q.life > 0) {
        q.life -= dt;
        q.x += (q.vx - vx * 0.4) * dt;
        q.y += q.vy * dt;
      }
    }
    // collisions: cave walls (sample nose / center / tail)
    for (i = -1; i <= 1; i++) {
      var wx = dist + i * 15;
      if (y - 10 < topAt(wx) || y + 10 > botAt(wx)) { die(); return; }
    }
    // blocks (copter world x = dist)
    for (i = 0; i < BN; i++) {
      var bb = blocks[i];
      if (!bb.on) continue;
      var dx = bb.x - dist;
      if (dx < -CX - 60) { bb.on = false; continue; }
      if (dx > -bb.w / 2 - 17 && dx < bb.w / 2 + 17 &&
          y + 10 > bb.y && y - 10 < bb.y + bb.h) { die(); return; }
    }
    meters = (dist / 10) | 0;
    if (meters !== lastMeters) { lastMeters = meters; api.score(meters); }
    if (meters >= nextMile) { api.haptic('light'); nextMile += 500; }
  }

  function draw() {
    var W = cv.W, H = cv.H, i, x;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    var camX = dist - CX;
    // cave walls
    g.fillStyle = wallCol;
    g.beginPath();
    g.moveTo(-6, -6);
    for (x = -6; x <= W + 24; x += 18) g.lineTo(x, topAt(camX + x));
    g.lineTo(W + 6, -6);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-6, H + 6);
    for (x = -6; x <= W + 24; x += 18) g.lineTo(x, botAt(camX + x));
    g.lineTo(W + 6, H + 6);
    g.closePath();
    g.fill();
    // wall edges
    g.strokeStyle = wallEdge;
    g.lineWidth = 2;
    g.beginPath();
    for (x = -6; x <= W + 24; x += 18) {
      var ty = topAt(camX + x);
      if (x === -6) g.moveTo(x, ty); else g.lineTo(x, ty);
    }
    g.stroke();
    g.beginPath();
    for (x = -6; x <= W + 24; x += 18) {
      var by = botAt(camX + x);
      if (x === -6) g.moveTo(x, by); else g.lineTo(x, by);
    }
    g.stroke();
    // blocks
    g.fillStyle = blockCol;
    g.strokeStyle = C.bad;
    for (i = 0; i < BN; i++) {
      var b = blocks[i];
      if (!b.on) continue;
      var bx = b.x - camX;
      if (bx < -40 || bx > W + 40) continue;
      g.fillRect(bx - b.w / 2, b.y, b.w, b.h);
      g.strokeRect(bx - b.w / 2, b.y, b.w, b.h);
    }
    // smoke
    for (i = 0; i < PN; i++) {
      var p = parts[i];
      if (p.life <= 0) continue;
      g.globalAlpha = p.life;
      g.fillStyle = smokeCol;
      g.beginPath();
      g.arc(p.x, p.y, 3 + (0.6 - p.life) * 6, 0, 6.29);
      g.fill();
    }
    g.globalAlpha = 1;
    // copter
    g.save();
    g.translate(CX, y);
    g.rotate(Math.max(-0.25, Math.min(0.25, vy * 0.0006)));
    g.fillStyle = bodyShade;   // tail
    g.fillRect(-24, -3, 16, 5);
    g.fillRect(-26, -9, 4, 8);
    g.fillStyle = C.accent;    // body
    g.beginPath();
    g.ellipse(0, 0, 13, 9, 0, 0, 6.29);
    g.fill();
    g.fillStyle = C.text;      // window
    g.beginPath();
    g.arc(5, -2, 4, 0, 6.29);
    g.fill();
    g.strokeStyle = C.text;    // rotor (spinning)
    g.lineWidth = 2;
    var rw = 20 * Math.abs(Math.cos(t * 26)) + 4;
    g.beginPath();
    g.moveTo(-rw, -12); g.lineTo(rw, -12);
    g.moveTo(0, -12); g.lineTo(0, -9);
    g.stroke();
    g.strokeStyle = bodyShade; // skids
    g.beginPath();
    g.moveTo(-8, 11); g.lineTo(10, 11);
    g.stroke();
    g.restore();
    // start overlay
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2 - 14);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Держи — вверх, отпусти — вниз' : 'Hold to rise, release to fall', W / 2, H / 2 + 14);
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

  cv.onResize = function () { CX = cv.W * 0.28; draw(); };
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
