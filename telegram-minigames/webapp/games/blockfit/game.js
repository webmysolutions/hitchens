/* Block Fit — 1010!-style: drag pieces onto a 10x10 board, clear full lines. */
(function () {
'use strict';
MG.register('blockfit', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var N = 10;

  /* ---- derived hues from the theme accent ---- */
  function baseHue(hex) {
    try {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var r = parseInt(h.substr(0, 2), 16) / 255, gg = parseInt(h.substr(2, 2), 16) / 255, b = parseInt(h.substr(4, 2), 16) / 255;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn, hu = 0;
      if (d > 0) {
        if (mx === r) hu = ((gg - b) / d) % 6; else if (mx === gg) hu = (b - r) / d + 2; else hu = (r - gg) / d + 4;
        hu *= 60; if (hu < 0) hu += 360;
      }
      return hu;
    } catch (e) { return 210; }
  }
  var HUE = baseHue(C.accent);
  var PAL = [];
  for (var pi = 0; pi < 6; pi++) PAL.push('hsl(' + Math.round(HUE + pi * 57) % 360 + ',62%,58%)');

  /* ---- shapes: dot, lines 2-5 (h+v), squares, corners, T, S ---- */
  var SHAPES = [[[0, 0]]];
  for (var L = 2; L <= 5; L++) {
    var hh = [], vv = [];
    for (var i = 0; i < L; i++) { hh.push([i, 0]); vv.push([0, i]); }
    SHAPES.push(hh); SHAPES.push(vv);
  }
  SHAPES.push([[0, 0], [1, 0], [0, 1], [1, 1]]);                                   // 2x2
  SHAPES.push([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]); // 3x3
  SHAPES.push([[0, 0], [1, 0], [0, 1]]);                                           // corners (small L, 4 rot)
  SHAPES.push([[0, 0], [1, 0], [1, 1]]);
  SHAPES.push([[0, 0], [0, 1], [1, 1]]);
  SHAPES.push([[1, 0], [0, 1], [1, 1]]);
  SHAPES.push([[0, 0], [1, 0], [2, 0], [1, 1]]);                                   // T
  SHAPES.push([[1, 0], [2, 0], [0, 1], [1, 1]]);                                   // S
  function dims(s) {
    var w = 0, h = 0;
    for (var i = 0; i < s.length; i++) { if (s[i][0] + 1 > w) w = s[i][0] + 1; if (s[i][1] + 1 > h) h = s[i][1] + 1; }
    return { w: w, h: h };
  }

  var board, tray, score, over, flashes, fits;
  var drag = null; // {slot, item, fx, fy}
  var raf = 0, paused = false;
  var cell, ox, oy, trayY, trayH, slotW, mini;

  function layout() {
    trayH = Math.max(92, Math.round(cv.H * 0.2));
    cell = Math.floor(Math.min((cv.W - 12) / N, (cv.H - trayH - 26) / N));
    ox = Math.floor((cv.W - cell * N) / 2);
    oy = 10;
    trayY = oy + cell * N + 8;
    trayH = cv.H - trayY - 6;
    slotW = cv.W / 3;
    mini = Math.max(6, Math.floor(Math.min(slotW / 6.5, trayH / 6.5)));
  }
  cv.onResize = function () { layout(); };

  function newTray() {
    tray = [];
    for (var i = 0; i < 3; i++) tray.push({ s: (Math.random() * SHAPES.length) | 0, c: 1 + ((Math.random() * 6) | 0) });
  }

  function reset() {
    board = [];
    for (var i = 0; i < N * N; i++) board.push(0);
    score = 0; over = false; flashes = [];
    newTray();
    var s = api.load();
    if (s && s.b && s.b.length === N * N && s.t && s.t.length === 3) {
      board = s.b; score = s.sc | 0;
      tray = [];
      for (var j = 0; j < 3; j++) {
        var it = s.t[j];
        tray.push(it && SHAPES[it.s] ? { s: it.s, c: it.c } : null);
      }
      if (!tray[0] && !tray[1] && !tray[2]) newTray();
    }
    api.score(score);
    updateFits();
  }

  function saveState() { api.save({ b: board, t: tray, sc: score }); }

  function canPlace(shape, gx, gy) {
    for (var i = 0; i < shape.length; i++) {
      var x = gx + shape[i][0], y = gy + shape[i][1];
      if (x < 0 || y < 0 || x >= N || y >= N || board[y * N + x]) return false;
    }
    return true;
  }
  function fitsSomewhere(shape) {
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (canPlace(shape, x, y)) return true;
    return false;
  }
  function updateFits() {
    fits = [];
    for (var i = 0; i < 3; i++) fits.push(tray[i] ? fitsSomewhere(SHAPES[tray[i].s]) : false);
  }

  function place(slot, gx, gy) {
    var item = tray[slot], shape = SHAPES[item.s];
    for (var i = 0; i < shape.length; i++) board[(gy + shape[i][1]) * N + gx + shape[i][0]] = item.c;
    score += shape.length;
    tray[slot] = null;

    // find full rows and columns simultaneously
    var lines = [], x, y, full;
    for (y = 0; y < N; y++) {
      full = true;
      for (x = 0; x < N; x++) if (!board[y * N + x]) { full = false; break; }
      if (full) lines.push({ row: y });
    }
    for (x = 0; x < N; x++) {
      full = true;
      for (y = 0; y < N; y++) if (!board[y * N + x]) { full = false; break; }
      if (full) lines.push({ col: x });
    }
    var k = lines.length;
    if (k > 0) {
      score += 10 * k * k; // combo multiplier for multi-line clears
      var now = performance.now();
      for (var li = 0; li < k; li++) {
        for (var c2 = 0; c2 < N; c2++) {
          x = lines[li].row !== undefined ? c2 : lines[li].col;
          y = lines[li].row !== undefined ? lines[li].row : c2;
          if (board[y * N + x]) {
            if (!api.lowEnd || flashes.length < 40) flashes.push({ x: x, y: y, c: board[y * N + x], t0: now });
            board[y * N + x] = 0;
          }
        }
      }
      api.haptic(k > 1 ? 'success' : 'medium');
    } else {
      api.haptic('light');
    }
    api.score(score);
    if (!tray[0] && !tray[1] && !tray[2]) newTray();
    updateFits();
    if (!fits[0] && !fits[1] && !fits[2]) {
      over = true;
      api.save(null); // clear persisted state on game over
      api.haptic('error');
      api.gameOver(score);
      return;
    }
    saveState();
  }

  /* ---- input ---- */
  var LIFT = 64; // ghost floats above the finger
  function pt(e) {
    var t = e.touches && e.touches.length ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    var r = cv.canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function ghostCell() {
    if (!drag) return null;
    var d = dims(SHAPES[drag.item.s]);
    var px = drag.fx - d.w * cell / 2;
    var py = drag.fy - LIFT - d.h * cell;
    var gx = Math.round((px - ox) / cell), gy = Math.round((py - oy) / cell);
    if (gx < -1 || gy < -1 || gx > N || gy > N) return null;
    gx = Math.max(0, Math.min(N - d.w, gx));
    gy = Math.max(0, Math.min(N - d.h, gy));
    return { gx: gx, gy: gy, ok: canPlace(SHAPES[drag.item.s], gx, gy) };
  }
  function onDown(e) {
    if (over) return;
    var p = pt(e);
    if (p.y >= trayY - 4) {
      var slot = Math.min(2, Math.max(0, (p.x / slotW) | 0));
      if (tray[slot]) {
        drag = { slot: slot, item: tray[slot], fx: p.x, fy: p.y };
        if (e.cancelable) e.preventDefault();
      }
    }
  }
  function onMove(e) {
    if (!drag) return;
    var p = pt(e);
    drag.fx = p.x; drag.fy = p.y;
    if (e.cancelable) e.preventDefault();
  }
  function onUp(e) {
    if (!drag) return;
    var p = pt(e);
    drag.fx = p.x; drag.fy = p.y;
    var gc = ghostCell();
    var slot = drag.slot;
    drag = null;
    if (gc && gc.ok) place(slot, gc.gx, gc.gy);
  }
  cv.canvas.addEventListener('touchstart', onDown, { passive: false });
  cv.canvas.addEventListener('touchmove', onMove, { passive: false });
  cv.canvas.addEventListener('touchend', onUp);
  cv.canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  /* ---- drawing ---- */
  function drawCell(px, py, sz, col, alpha) {
    g.globalAlpha = alpha;
    g.fillStyle = PAL[(col - 1) % 6];
    g.fillRect(px + 1, py + 1, sz - 2, sz - 2);
    g.globalAlpha = alpha * 0.25;
    g.fillStyle = '#fff';
    g.fillRect(px + 1, py + 1, sz - 2, 3);
    g.globalAlpha = 1;
  }
  function drawShape(shape, col, px, py, sz, alpha) {
    for (var i = 0; i < shape.length; i++) drawCell(px + shape[i][0] * sz, py + shape[i][1] * sz, sz, col, alpha);
  }
  function draw() {
    var now = performance.now();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // board
    g.fillStyle = C.panel;
    g.fillRect(ox - 3, oy - 3, cell * N + 6, cell * N + 6);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var v = board[y * N + x];
      if (v) drawCell(ox + x * cell, oy + y * cell, cell, v, 1);
      else { g.fillStyle = C.panel2; g.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2); }
    }
    // line-clear flash
    for (var f = flashes.length - 1; f >= 0; f--) {
      var fl = flashes[f], t = (now - fl.t0) / 320;
      if (t >= 1) { flashes.splice(f, 1); continue; }
      drawCell(ox + fl.x * cell, oy + fl.y * cell, cell, fl.c, 1 - t);
      g.globalAlpha = (1 - t) * 0.8;
      g.fillStyle = '#fff';
      g.fillRect(ox + fl.x * cell + 1, oy + fl.y * cell + 1, cell - 2, cell - 2);
      g.globalAlpha = 1;
    }
    // ghost preview
    if (drag) {
      var gc = ghostCell();
      if (gc) {
        var sh = SHAPES[drag.item.s];
        if (gc.ok) drawShape(sh, drag.item.c, ox + gc.gx * cell, oy + gc.gy * cell, cell, 0.45);
        else {
          g.globalAlpha = 0.3; g.fillStyle = C.bad;
          for (var i2 = 0; i2 < sh.length; i2++) g.fillRect(ox + (gc.gx + sh[i2][0]) * cell + 1, oy + (gc.gy + sh[i2][1]) * cell + 1, cell - 2, cell - 2);
          g.globalAlpha = 1;
        }
      }
    }
    // tray
    g.fillStyle = C.panel;
    g.fillRect(0, trayY, cv.W, trayH + 6);
    for (var s = 0; s < 3; s++) {
      var it = tray[s];
      if (!it || (drag && drag.slot === s)) continue;
      var d = dims(SHAPES[it.s]);
      var px = s * slotW + (slotW - d.w * mini) / 2;
      var py = trayY + (trayH - d.h * mini) / 2;
      drawShape(SHAPES[it.s], it.c, px, py, mini, fits[s] ? 1 : 0.3);
    }
    // dragged piece follows the finger, lifted so it stays visible
    if (drag) {
      var dd = dims(SHAPES[drag.item.s]);
      drawShape(SHAPES[drag.item.s], drag.item.c, drag.fx - dd.w * cell / 2, drag.fy - LIFT - dd.h * cell, cell, 0.95);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    draw();
  }

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('touchstart', onDown);
      cv.canvas.removeEventListener('touchmove', onMove);
      cv.canvas.removeEventListener('touchend', onUp);
      cv.canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
