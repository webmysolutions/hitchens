/* Paper Glider — hold to pull up, release to dive. MG contract. */
(function () {
'use strict';
MG.register('paperplane', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var LOW = api.lowEnd;

  // ---- derived shades (from api.colors only) ----
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
  var hillFar = mix(C.good, C.bg, 0.78);
  var hillNear = mix(C.good, C.bg, 0.62);
  var groundCol = mix(C.good, C.bg, 0.45);
  var groundDark = mix(C.good, C.bg, 0.6);
  var planeShade = mix(C.text, C.bg, 0.45);
  var upCol = mix(C.accent, C.bg, 0.25);
  var trailCol = mix(C.text, C.bg, 0.65);

  // ---- state ----
  var p = { x: 0, y: 0, a: 0, s: 0 };      // world pos (y<0 = above ground), angle, speed
  var camX = 0, camY = 0;
  var started = false, alive = true, paused = false;
  var raf = 0, last = 0, t = 0;
  var meters = 0, stars = 0, score = 0, lastScore = -1, nextMile = 500;

  // ---- pools ----
  var UPN = 6, ups = [], ui;
  for (ui = 0; ui < UPN; ui++) ups.push({ x: 0, w: 90, h: 0, on: false });
  var upIdx = 0, nextUpX = 0;
  var STN = 8, sts = [];
  for (ui = 0; ui < STN; ui++) sts.push({ x: 0, y: 0, on: false });
  var stIdx = 0, nextStX = 0;
  var TRN = LOW ? 0 : 22;
  var trX = new Float32Array(TRN || 1), trY = new Float32Array(TRN || 1);
  var trI = 0, trAcc = 0, trCnt = 0;

  function reset() {
    p.x = 0; p.y = -(cv.H * 0.35 + 220); p.a = 0.12; p.s = 300;
    camX = 0; camY = p.y;
    started = false; alive = true; t = 0;
    meters = 0; stars = 0; score = 0; lastScore = -1; nextMile = 500;
    nextUpX = 500; nextStX = 350;
    for (var i = 0; i < UPN; i++) ups[i].on = false;
    for (i = 0; i < STN; i++) sts[i].on = false;
    trI = 0; trCnt = 0;
    api.score(0);
  }

  // ---- input: hold = pull up, release = dive ----
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

  // ---- spawning (round-robin pools) ----
  function spawn() {
    var ahead = camX + cv.W * 2;
    while (nextUpX < ahead) {
      var u = ups[upIdx]; upIdx = (upIdx + 1) % UPN;
      u.x = nextUpX; u.w = 80 + Math.random() * 50;
      u.h = cv.H * (0.7 + Math.random() * 0.7);
      u.on = true;
      nextUpX += 600 + Math.random() * 700;
    }
    while (nextStX < ahead) {
      var s = sts[stIdx]; stIdx = (stIdx + 1) % STN;
      s.x = nextStX;
      s.y = -(cv.H * 0.15 + Math.random() * cv.H * 1.15);
      s.on = true;
      nextStX += 380 + Math.random() * 520;
    }
  }

  // ---- physics ----
  function update(dt) {
    if (hold) { p.a -= 2.4 * dt; if (p.a < -0.85) p.a = -0.85; }
    else { p.a += 1.6 * dt; if (p.a > 1.15) p.a = 1.15; }
    // trade altitude for speed: gravity component along heading, quadratic drag
    p.s += (860 * Math.sin(p.a) - 0.0016 * p.s * p.s - (hold ? 70 : 0)) * dt;
    if (p.s < 55) p.s = 55;
    p.x += Math.cos(p.a) * p.s * dt;
    p.y += Math.sin(p.a) * p.s * dt;
    // stall sink when slow
    var sink = 1 - Math.min(1, p.s / 250);
    if (sink > 0) p.y += sink * 170 * dt;
    // updraft lift
    for (var i = 0; i < UPN; i++) {
      var u = ups[i];
      if (u.on && p.x > u.x && p.x < u.x + u.w && p.y > -u.h && p.y < 0) {
        p.y -= 190 * dt;
        if (p.a > -0.2) p.a -= 0.5 * dt;
      }
    }
    // stars
    for (i = 0; i < STN; i++) {
      var s = sts[i];
      if (!s.on) continue;
      var dx = s.x - p.x, dy = s.y - p.y;
      if (dx * dx + dy * dy < 30 * 30) {
        s.on = false; stars++; api.haptic('light');
      }
    }
    meters = (p.x / 10) | 0;
    if (meters >= nextMile) { api.haptic('medium'); nextMile += 500; }
    score = meters + stars * 25;
    if (score !== lastScore) { lastScore = score; api.score(score); }
    // trail
    if (TRN) {
      trAcc += dt;
      if (trAcc > 0.05) {
        trAcc = 0;
        trX[trI] = p.x; trY[trI] = p.y;
        trI = (trI + 1) % TRN;
        if (trCnt < TRN) trCnt++;
      }
    }
    spawn();
    // camera
    camX = p.x - cv.W * 0.32;
    camY = Math.min(p.y, -cv.H * 0.35);
    // ground contact
    if (p.y >= -4) {
      p.y = -4; alive = false;
      api.haptic('error');
      api.gameOver(score);
    }
  }

  function sy(wy) { return wy - camY + cv.H * 0.42; }

  // ---- drawing ----
  function hills(f, amp, col, lift) {
    var gy = sy(0) * f + cv.H * (1 - f);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-4, cv.H + 4);
    for (var x = -4; x <= cv.W + 24; x += 24) {
      var wx = camX * f + x;
      var y = gy - lift - amp * (Math.sin(wx * 0.004) + 0.6 * Math.sin(wx * 0.0093 + 2) + 1.6) * 0.5;
      g.lineTo(x, y);
    }
    g.lineTo(cv.W + 4, cv.H + 4);
    g.closePath();
    g.fill();
  }

  function draw() {
    var W = cv.W, H = cv.H;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    if (!LOW) {
      hills(0.25, H * 0.16, hillFar, H * 0.02);
      hills(0.5, H * 0.11, hillNear, 0);
    }
    // launch hill at origin
    var gY = sy(0);
    var hx = -camX;
    if (hx > -300) {
      g.fillStyle = hillNear;
      g.beginPath();
      g.moveTo(hx - 600, gY);
      g.lineTo(hx - 60, gY - (H * 0.35 + 200));
      g.lineTo(hx + 60, gY);
      g.closePath();
      g.fill();
    }
    // ground
    if (gY < H + 10) {
      g.fillStyle = groundCol;
      g.fillRect(0, gY, W, H - gY + 4);
      g.strokeStyle = groundDark;
      g.lineWidth = 2;
      g.setLineDash([14, 22]);
      g.lineDashOffset = camX % 36;
      g.beginPath();
      g.moveTo(0, gY + 10);
      g.lineTo(W, gY + 10);
      g.stroke();
      g.setLineDash([]);
    }
    // updrafts: rising dashed arrows
    g.strokeStyle = upCol;
    g.lineWidth = 3;
    var i, k;
    for (i = 0; i < UPN; i++) {
      var u = ups[i];
      if (!u.on) continue;
      var ux = u.x - camX;
      if (ux + u.w < -20 || ux > W + 20) continue;
      var top = sy(-u.h), bot = Math.min(sy(0), H);
      if (bot < 0 || top > H) continue;
      if (top < -20) top = -20;
      g.setLineDash([12, 16]);
      g.lineDashOffset = (t * 90) % 28;
      g.beginPath();
      for (k = 0; k < 3; k++) {
        var lx = ux + u.w * (0.2 + 0.3 * k);
        g.moveTo(lx, bot);
        g.lineTo(lx, top + 14);
      }
      g.stroke();
      g.setLineDash([]);
      // arrow heads
      g.beginPath();
      for (k = 0; k < 3; k++) {
        var ax = ux + u.w * (0.2 + 0.3 * k);
        g.moveTo(ax - 6, top + 20);
        g.lineTo(ax, top + 10);
        g.lineTo(ax + 6, top + 20);
      }
      g.stroke();
    }
    // stars
    g.font = '24px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (i = 0; i < STN; i++) {
      var s = sts[i];
      if (!s.on) continue;
      var sx = s.x - camX;
      if (sx < -30 || sx > W + 30) continue;
      g.fillText('⭐', sx, sy(s.y) + Math.sin(t * 3 + i) * 3);
    }
    // trail
    if (TRN && trCnt > 2) {
      g.strokeStyle = trailCol;
      g.lineWidth = 1.5;
      g.beginPath();
      for (k = 0; k < trCnt; k++) {
        var j = (trI + TRN - trCnt + k) % TRN;
        var tx = trX[j] - camX, ty = sy(trY[j]);
        if (k === 0) g.moveTo(tx, ty); else g.lineTo(tx, ty);
      }
      g.stroke();
    }
    // plane
    var px = p.x - camX, py = sy(p.y);
    g.save();
    g.translate(px, py);
    g.rotate(p.a);
    g.fillStyle = C.text;
    g.beginPath();
    g.moveTo(16, 0);
    g.lineTo(-12, -8);
    g.lineTo(-7, 0);
    g.lineTo(-12, 8);
    g.closePath();
    g.fill();
    g.strokeStyle = planeShade;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(16, 0);
    g.lineTo(-9, 0);
    g.stroke();
    g.restore();
    // HUD: stars
    if (started) {
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.textAlign = 'left';
      g.fillText('⭐ ' + stars + '   ' + meters + (api.lang === 'ru' ? ' м' : ' m'), 12, 20);
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
      g.fillText(api.lang === 'ru' ? 'Держи — вверх, отпусти — пикируй' : 'Hold to pull up, release to dive', W / 2, H / 2 + 14);
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

  cv.onResize = function () { draw(); };
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
