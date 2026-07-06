/* Match-3 — swap gems, chain cascades, 30 moves. Canvas. */
(function () {
'use strict';
MG.register('match3', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var low = api.lowEnd;

  var COLS = 7, ROWS = 9, N = COLS * ROWS, TYPES = 6;
  var EMO = ['💎', '🔷', '🔶', '💜', '💚', '❤️'];
  var MOVES = 30;

  var grid = new Array(N);
  var offY = new Float32Array(N); // px above resting spot (falling)
  var cell = 0, ox = 0, oy = 0, top = 34, fallV = 1;
  var sprites = null, sprCell = 0;

  var state = 'idle'; // idle | swap | back | clear | fall | over
  var moves = MOVES, score = 0, chain = 0, sel = -1;
  var anim = { a: -1, b: -1, t: 0, dur: 140 };
  var marks = null, clearT = 0, clearDur = 180;
  var msg = '', msgT = 0;
  var raf = 0, last = 0, paused = false, dirty = true;
  var pDown = null;

  /* ---- layout & sprites ---- */
  function makeSprites() {
    if (sprCell === cell && sprites) return;
    sprCell = cell;
    sprites = [];
    for (var t = 0; t < TYPES; t++) {
      var c = document.createElement('canvas');
      var s = Math.max(8, Math.round(cell * cv.dpr));
      c.width = c.height = s;
      var x = c.getContext('2d');
      x.font = Math.floor(s * 0.72) + 'px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(EMO[t], s / 2, s / 2 + s * 0.04);
      sprites.push(c);
    }
  }
  function layout() {
    var old = cell;
    cell = Math.floor(Math.min(cv.W / COLS, (cv.H - top - 8) / ROWS));
    ox = Math.floor((cv.W - cell * COLS) / 2);
    oy = top + Math.floor((cv.H - top - 8 - cell * ROWS) / 2);
    fallV = cell / (low ? 55 : 75); // px per ms
    if (old && old !== cell) {
      var k = cell / old;
      for (var i = 0; i < N; i++) offY[i] *= k;
    }
    makeSprites();
    dirty = true;
  }
  cv.onResize = function () { layout(); };

  /* ---- board logic ---- */
  function matchAtIdx(i) {
    var t = grid[i];
    if (t < 0) return false;
    var c = i % COLS, r = (i / COLS) | 0, n, k;
    n = 1;
    for (k = c - 1; k >= 0 && grid[r * COLS + k] === t; k--) n++;
    for (k = c + 1; k < COLS && grid[r * COLS + k] === t; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (k = r - 1; k >= 0 && grid[k * COLS + c] === t; k--) n++;
    for (k = r + 1; k < ROWS && grid[k * COLS + c] === t; k++) n++;
    return n >= 3;
  }
  function findMatches() {
    var m = null, c, r, i, t, k;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS - 2; c++) {
      i = r * COLS + c;
      t = grid[i];
      if (t >= 0 && grid[i + 1] === t && grid[i + 2] === t) {
        if (!m) m = new Array(N);
        for (k = c; k < COLS && grid[r * COLS + k] === t; k++) m[r * COLS + k] = true;
        c = k - 1;
      }
    }
    for (c = 0; c < COLS; c++) for (r = 0; r < ROWS - 2; r++) {
      i = r * COLS + c;
      t = grid[i];
      if (t >= 0 && grid[i + COLS] === t && grid[i + 2 * COLS] === t) {
        if (!m) m = new Array(N);
        for (k = r; k < ROWS && grid[k * COLS + c] === t; k++) m[k * COLS + c] = true;
        r = k - 1;
      }
    }
    return m;
  }
  function swapMakesMatch(a, b) {
    var t = grid[a]; grid[a] = grid[b]; grid[b] = t;
    var ok = matchAtIdx(a) || matchAtIdx(b);
    grid[b] = grid[a]; grid[a] = t;
    return ok;
  }
  function hasMove() {
    for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
      var i = r * COLS + c;
      if (c < COLS - 1 && swapMakesMatch(i, i + 1)) return true;
      if (r < ROWS - 1 && swapMakesMatch(i, i + COLS)) return true;
    }
    return false;
  }
  function fillBoard() {
    do {
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var i = r * COLS + c, t;
        do { t = (Math.random() * TYPES) | 0; }
        while ((c >= 2 && grid[i - 1] === t && grid[i - 2] === t) ||
               (r >= 2 && grid[i - COLS] === t && grid[i - 2 * COLS] === t));
        grid[i] = t;
      }
    } while (!hasMove());
    for (var k = 0; k < N; k++) offY[k] = 0;
  }

  /* ---- state machine ---- */
  function trySwap(a, b) {
    if (state !== 'idle' || moves <= 0) return;
    anim.a = a; anim.b = b; anim.t = 0;
    anim.dur = low ? 90 : 140;
    state = 'swap';
    dirty = true;
  }
  function startClear(m) {
    marks = m;
    clearT = 0;
    clearDur = low ? 70 : 180;
    var count = 0;
    for (var i = 0; i < N; i++) if (m[i]) count++;
    score += count * 10 * chain;
    api.score(score);
    if (chain === 1) api.haptic('light');
    else if (chain === 3) api.haptic('medium');
    if (chain > 1) { msg = 'x' + chain; msgT = 800; }
    state = 'clear';
  }
  function finishClear() {
    for (var i = 0; i < N; i++) if (marks[i]) grid[i] = -1;
    marks = null;
    for (var c = 0; c < COLS; c++) {
      var wr = ROWS - 1;
      for (var r = ROWS - 1; r >= 0; r--) {
        var i2 = r * COLS + c;
        if (grid[i2] >= 0) {
          if (wr !== r) {
            var j = wr * COLS + c;
            grid[j] = grid[i2];
            grid[i2] = -1;
            offY[j] = (wr - r) * cell;
          }
          wr--;
        }
      }
      var n = wr + 1; // empty rows 0..wr get new gems, all fall n cells
      for (var r2 = wr; r2 >= 0; r2--) {
        var i3 = r2 * COLS + c;
        grid[i3] = (Math.random() * TYPES) | 0;
        offY[i3] = n * cell;
      }
    }
    state = 'fall';
  }
  function afterFall() {
    var m = findMatches();
    if (m) { chain++; startClear(m); return; }
    chain = 0;
    if (moves <= 0) {
      state = 'over';
      api.gameOver(score);
      return;
    }
    if (!hasMove()) {
      fillBoard();
      msg = api.lang === 'ru' ? 'Перемешано' : 'Shuffled';
      msgT = 900;
    }
    state = 'idle';
  }

  /* ---- input ---- */
  function toXY(e) {
    var rect = cv.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function cellAt(x, y) {
    var c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
  }
  function onPD(e) {
    if (paused || state !== 'idle' || moves <= 0) return;
    var p = toXY(e);
    var i = cellAt(p.x, p.y);
    if (i < 0) return;
    pDown = { i: i, x: p.x, y: p.y };
    e.preventDefault();
  }
  function onPM(e) {
    if (!pDown || paused || state !== 'idle') return;
    var p = toXY(e);
    var dx = p.x - pDown.x, dy = p.y - pDown.y;
    var th = cell * 0.35;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    var i = pDown.i, c = i % COLS, r = (i / COLS) | 0;
    pDown = null;
    sel = -1;
    if (Math.abs(dx) > Math.abs(dy)) c += dx > 0 ? 1 : -1;
    else r += dy > 0 ? 1 : -1;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    trySwap(i, r * COLS + c);
  }
  function onPU() {
    if (!pDown) return;
    var i = pDown.i;
    pDown = null;
    if (paused || state !== 'idle') return;
    if (sel < 0) sel = i;
    else if (sel === i) sel = -1;
    else {
      var dc = Math.abs(sel % COLS - i % COLS);
      var dr = Math.abs(((sel / COLS) | 0) - ((i / COLS) | 0));
      if (dc + dr === 1) { trySwap(sel, i); sel = -1; }
      else sel = i;
    }
    dirty = true;
  }
  cv.canvas.style.touchAction = 'none';
  cv.canvas.addEventListener('pointerdown', onPD);
  window.addEventListener('pointermove', onPM);
  window.addEventListener('pointerup', onPU);

  /* ---- drawing ---- */
  function gemXY(i) {
    return { x: ox + (i % COLS) * cell, y: oy + ((i / COLS) | 0) * cell - offY[i] };
  }
  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.font = 'bold 15px sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = C.text;
    g.fillText(api.t('moves') + ': ' + moves, ox + 4, top / 2 + 3);
    if (msgT > 0) {
      g.fillStyle = C.accent;
      g.textAlign = 'right';
      g.fillText(msg, ox + cell * COLS - 4, top / 2 + 3);
    }
    g.fillStyle = C.panel;
    g.fillRect(ox, oy, cell * COLS, cell * ROWS);
    if (sel >= 0) {
      var sx = ox + (sel % COLS) * cell, sy = oy + ((sel / COLS) | 0) * cell;
      g.fillStyle = C.panel2;
      g.fillRect(sx, sy, cell, cell);
      g.strokeStyle = C.accent;
      g.lineWidth = 2;
      g.strokeRect(sx + 1, sy + 1, cell - 2, cell - 2);
    }
    g.save();
    g.beginPath();
    g.rect(ox, oy, cell * COLS, cell * ROWS);
    g.clip();
    var swapping = state === 'swap' || state === 'back';
    var i, t, p;
    for (i = 0; i < N; i++) {
      t = grid[i];
      if (t < 0) continue;
      if (swapping && (i === anim.a || i === anim.b)) continue;
      var q = gemXY(i);
      if (marks && marks[i] && state === 'clear') {
        var s2 = cell * Math.max(0, 1 - clearT / clearDur);
        if (s2 > 1) g.drawImage(sprites[t], q.x + (cell - s2) / 2, q.y + (cell - s2) / 2, s2, s2);
      } else {
        g.drawImage(sprites[t], q.x, q.y, cell, cell);
      }
    }
    if (swapping) {
      p = Math.min(1, anim.t / anim.dur);
      var A = gemXY(anim.a), B = gemXY(anim.b);
      var pa = state === 'swap' ? p : 1 - p; // swap: a→b; back: b→a
      g.drawImage(sprites[grid[anim.a]], A.x + (B.x - A.x) * pa, A.y + (B.y - A.y) * pa, cell, cell);
      g.drawImage(sprites[grid[anim.b]], B.x + (A.x - B.x) * pa, B.y + (A.y - B.y) * pa, cell, cell);
    }
    g.restore();
  }

  /* ---- loop ---- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(80, ts - last);
    last = ts;
    if (msgT > 0) { msgT -= dt; dirty = true; }
    if (state === 'swap' || state === 'back') {
      anim.t += dt;
      dirty = true;
      if (anim.t >= anim.dur) {
        if (state === 'swap') {
          var t2 = grid[anim.a]; grid[anim.a] = grid[anim.b]; grid[anim.b] = t2;
          var m = findMatches();
          if (m) { moves--; chain = 1; startClear(m); }
          else {
            // illegal swap: revert grid, animate gems back
            grid[anim.b] = grid[anim.a]; grid[anim.a] = t2;
            anim.t = 0;
            state = 'back';
          }
        } else {
          state = 'idle';
        }
      }
    } else if (state === 'clear') {
      clearT += dt;
      dirty = true;
      if (clearT >= clearDur) finishClear();
    } else if (state === 'fall') {
      var done = true, step = fallV * dt;
      for (var i = 0; i < N; i++) {
        if (offY[i] > 0) {
          offY[i] -= step;
          if (offY[i] < 0) offY[i] = 0;
          if (offY[i] > 0) done = false;
        }
      }
      dirty = true;
      if (done) afterFall();
    }
    if (dirty) { draw(); dirty = false; }
  }

  layout();
  fillBoard();
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('pointerdown', onPD);
      window.removeEventListener('pointermove', onPM);
      window.removeEventListener('pointerup', onPU);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
