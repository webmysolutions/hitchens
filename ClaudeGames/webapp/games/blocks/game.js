/* Blocks — Tetris-like falling blocks. MG game contract. */
(function () {
'use strict';
MG.register('blocks', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var COLS = 10, ROWS = 18, BTN_H = 68;
  // I, J, L, O, S, T, Z — colors from api.colors + small fixed palette
  var PAL = [C.accent, '#35c4cf', '#e6a23c', '#e8d44d', C.good, '#9b59d0', C.bad];
  var SHAPES = [
    [0x0F00, 0x2222, 0x00F0, 0x4444], // I
    [0x44C0, 0x8E00, 0x6440, 0x0E20], // J
    [0x4460, 0x0E80, 0xC440, 0x2E00], // L
    [0xCC00, 0xCC00, 0xCC00, 0xCC00], // O
    [0x06C0, 0x8C40, 0x6C00, 0x4620], // S
    [0x0E40, 0x4C40, 0x4E00, 0x4640], // T
    [0x0C60, 0x4C80, 0xC600, 0x2640]  // Z
  ];
  var KICKS = [0, -1, 1, -2, 2];

  var grid = new Array(COLS * ROWS);
  var cell, ox, oy;
  var cur = { t: 0, r: 0, x: 3, y: -1 };
  var nextT, bag = [];
  var score, lines, level, fallMs, acc;
  var alive, started, paused = false;
  var raf = 0, last = 0;

  function layout() {
    cell = Math.floor(Math.min((cv.W - 12) / COLS, (cv.H - BTN_H - 12) / ROWS));
    ox = Math.floor((cv.W - cell * COLS) / 2);
    oy = Math.floor((cv.H - BTN_H - cell * ROWS) / 2);
  }
  cv.onResize = function () { layout(); draw(); };

  function nextType() {
    if (!bag.length) {
      bag = [0, 1, 2, 3, 4, 5, 6];
      for (var i = 6; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
    }
    return bag.pop();
  }

  function occ(mask, r, c) { return mask & (0x8000 >> (r * 4 + c)); }

  function fits(t, rot, px, py) {
    var mask = SHAPES[t][rot];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      if (!occ(mask, r, c)) continue;
      var x = px + c, y = py + r;
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && grid[y * COLS + x]) return false;
    }
    return true;
  }

  function spawn() {
    cur.t = nextT;
    nextT = nextType();
    cur.r = 0;
    cur.x = 3;
    cur.y = -1;
    if (!fits(cur.t, cur.r, cur.x, cur.y)) {
      alive = false;
      api.haptic('error');
      api.gameOver(score);
    }
  }

  function reset() {
    for (var i = 0; i < COLS * ROWS; i++) grid[i] = 0;
    score = 0; lines = 0; level = 1;
    fallMs = 800; acc = 0;
    alive = true; started = false;
    bag.length = 0;
    nextT = nextType();
    api.score(0);
    spawn();
  }

  function setSpeed() { fallMs = Math.max(80, 800 - (level - 1) * 70); }

  function clearLines() {
    var n = 0;
    for (var y = ROWS - 1; y >= 0; y--) {
      var full = true;
      for (var x = 0; x < COLS; x++) if (!grid[y * COLS + x]) { full = false; break; }
      if (full) {
        n++;
        for (var yy = y; yy > 0; yy--)
          for (var x2 = 0; x2 < COLS; x2++) grid[yy * COLS + x2] = grid[(yy - 1) * COLS + x2];
        for (var x3 = 0; x3 < COLS; x3++) grid[x3] = 0;
        y++;
      }
    }
    return n;
  }

  function lock() {
    var mask = SHAPES[cur.t][cur.r], topOut = false;
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      if (!occ(mask, r, c)) continue;
      var y = cur.y + r;
      if (y < 0) { topOut = true; continue; }
      grid[y * COLS + cur.x + c] = cur.t + 1;
    }
    if (topOut) {
      alive = false;
      api.haptic('error');
      api.gameOver(score);
      return;
    }
    var n = clearLines();
    if (n) {
      score += [0, 100, 300, 500, 800][n] * level;
      lines += n;
      var nl = 1 + ((lines / 10) | 0);
      if (nl > level) { level = nl; setSpeed(); api.haptic('success'); }
      else api.haptic(n === 4 ? 'success' : 'light');
      api.score(score);
    }
    spawn();
  }

  function move(dx) {
    if (fits(cur.t, cur.r, cur.x + dx, cur.y)) { cur.x += dx; return true; }
    return false;
  }

  function rotate() {
    var nr = (cur.r + 1) & 3;
    for (var i = 0; i < KICKS.length; i++) {
      if (fits(cur.t, nr, cur.x + KICKS[i], cur.y)) {
        cur.r = nr; cur.x += KICKS[i];
        api.haptic('light');
        return;
      }
    }
  }

  function softDrop() {
    if (fits(cur.t, cur.r, cur.x, cur.y + 1)) { cur.y++; acc = 0; }
    else lock();
  }

  function hardDrop() {
    while (fits(cur.t, cur.r, cur.x, cur.y + 1)) cur.y++;
    acc = 0;
    api.haptic('medium');
    lock();
  }

  function ghostY() {
    var y = cur.y;
    while (fits(cur.t, cur.r, cur.x, y + 1)) y++;
    return y;
  }

  function act(fn) {
    if (!alive || paused) return;
    if (!started) { started = true; return; }
    fn();
  }

  // on-screen buttons
  var row = document.createElement('div');
  row.style.cssText = 'position:absolute;left:8px;right:8px;bottom:8px;height:' + (BTN_H - 12) +
    'px;display:flex;gap:8px;z-index:5;';
  function mkBtn(label, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;border:none;border-radius:12px;font-size:24px;line-height:1;' +
      'background:' + C.panel2 + ';color:' + C.text + ';touch-action:manipulation;' +
      'box-shadow:inset 0 0 0 1px ' + C.panel + ';';
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); act(fn); });
    row.appendChild(b);
  }
  mkBtn('◀', function () { move(-1); });
  mkBtn('↺', rotate);
  mkBtn('▶', function () { move(1); });
  mkBtn('▼', hardDrop);
  container.appendChild(row);

  var offSwipe = api.swipe(cv.canvas, function (d) {
    if (d === 'tap') act(rotate);
    else if (d === 'left') act(function () { move(-1); });
    else if (d === 'right') act(function () { move(1); });
    else if (d === 'down') act(hardDrop);
  });

  function onKey(e) {
    if (e.key === 'ArrowLeft') act(function () { move(-1); });
    else if (e.key === 'ArrowRight') act(function () { move(1); });
    else if (e.key === 'ArrowUp') act(rotate);
    else if (e.key === 'ArrowDown') act(softDrop);
    else if (e.key === ' ') act(hardDrop);
    else return;
    e.preventDefault();
  }
  window.addEventListener('keydown', onKey);

  function drawCell(x, y, color, ghost) {
    var px = ox + x * cell, py = oy + y * cell;
    if (ghost) {
      g.strokeStyle = color;
      g.globalAlpha = 0.35;
      g.strokeRect(px + 1.5, py + 1.5, cell - 3, cell - 3);
      g.globalAlpha = 1;
    } else {
      g.fillStyle = color;
      g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
    }
  }

  function drawPiece(t, rot, px, py, ghost) {
    var mask = SHAPES[t][rot];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      if (!occ(mask, r, c)) continue;
      if (py + r < 0) continue;
      drawCell(px + c, py + r, PAL[t], ghost);
    }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.fillStyle = C.panel;
    g.fillRect(ox, oy, cell * COLS, cell * ROWS);
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
      var v = grid[y * COLS + x];
      if (v) drawCell(x, y, PAL[v - 1], false);
    }
    if (alive) {
      if (!api.lowEnd) drawPiece(cur.t, cur.r, cur.x, ghostY(), true);
      drawPiece(cur.t, cur.r, cur.x, cur.y, false);
    }
    // next-piece preview (top-right corner)
    var ps = Math.max(6, (cell * 0.55) | 0);
    var bx = cv.W - ps * 4 - 10, by = 8;
    g.fillStyle = C.panel2;
    g.fillRect(bx - 4, by - 4, ps * 4 + 8, ps * 3 + 8);
    var nm = SHAPES[nextT][0];
    g.fillStyle = PAL[nextT];
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      if (occ(nm, r, c)) g.fillRect(bx + c * ps + 1, by + r * ps + 1, ps - 2, ps - 2);
    }
    // level / lines
    g.fillStyle = C.muted;
    g.font = '12px sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(api.t('level') + ' ' + level, 8, 8);
    g.fillText(api.t('lines') + ' ' + lines, 8, 24);
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(100, ts - last);
    last = ts;
    if (started && alive) {
      acc += dt;
      while (acc >= fallMs && alive) {
        acc -= fallMs;
        if (fits(cur.t, cur.r, cur.x, cur.y + 1)) cur.y++;
        else lock();
      }
    }
    draw();
  }

  layout();
  reset();
  setSpeed();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      if (row.parentNode) row.parentNode.removeChild(row);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
