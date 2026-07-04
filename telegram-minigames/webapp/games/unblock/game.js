/* Unblock — rush-hour style: slide the red car to the right exit. 12 embedded levels. */
(function () {
'use strict';

/* Each level: array of [row, col, len, horizontal(1/0)]; piece 0 is the red car (row 2).
   All levels are machine-generated and BFS-verified solvable; OPT holds the optimal move counts. */
/*LEVELS*/
var LEVELS = [
  [[2,0,2,1],[5,1,2,1],[0,4,3,0],[4,3,2,0],[1,2,3,0],[1,5,2,0],[3,1,2,0]],
  [[2,0,2,1],[4,2,2,1],[4,4,2,1],[2,5,2,0],[0,3,3,0],[5,3,2,1]],
  [[2,0,2,1],[3,0,2,1],[1,2,2,0],[0,3,3,1],[3,3,2,1],[1,3,2,0],[4,0,2,0],[4,4,2,0],[4,1,3,1]],
  [[2,1,2,1],[0,4,2,1],[3,2,3,0],[4,3,2,0],[1,0,2,1],[2,3,2,0],[3,4,2,1],[1,4,2,0],[0,2,2,1]],
  [[2,0,2,1],[4,1,2,0],[2,3,3,0],[2,5,2,0],[5,3,3,1],[3,1,2,1],[0,1,3,1],[4,0,2,0],[0,5,2,0]],
  [[2,1,2,1],[0,4,3,0],[3,2,3,0],[4,5,2,0],[3,0,2,0],[1,3,2,0],[5,3,2,1],[1,5,2,0],[4,1,2,0],[4,3,2,1]],
  [[2,0,2,1],[2,2,2,0],[3,5,2,0],[0,4,2,0],[3,4,2,0],[0,2,2,1],[3,3,2,0],[0,0,2,0],[5,3,2,1],[0,1,2,0],[1,3,2,0]],
  [[2,0,2,1],[3,5,2,0],[3,4,2,0],[3,0,2,0],[1,0,3,1],[4,2,2,1],[1,5,2,0],[2,2,2,0],[5,3,2,1],[0,4,2,0]],
  [[2,0,2,1],[0,2,3,0],[3,0,2,0],[4,4,2,0],[0,0,2,0],[2,3,2,0],[5,0,3,1],[3,1,2,1],[0,3,3,1],[4,1,3,1],[3,5,2,0]],
  [[2,1,2,1],[3,3,2,1],[3,1,2,0],[1,5,3,0],[0,1,3,1],[1,0,2,1],[4,3,2,0],[1,3,2,1],[5,1,2,1],[4,4,2,1]],
  [[2,0,2,1],[4,1,2,0],[2,4,2,0],[5,4,2,1],[0,3,2,0],[3,1,2,1],[0,0,2,1],[4,3,2,0],[4,4,2,1],[1,2,2,0],[0,5,3,0]],
  [[2,0,2,1],[3,1,2,1],[0,1,2,0],[0,3,2,1],[5,0,2,1],[0,2,3,0],[3,5,3,0],[3,4,2,0],[3,3,2,0],[4,0,3,1],[5,3,2,1]]
];
var OPT = [5, 5, 8, 8, 10, 12, 12, 13, 14, 15, 17, 19];
/*END*/

if (typeof module !== 'undefined' && module.exports) module.exports = { LEVELS: LEVELS };
if (typeof MG === 'undefined') return;

MG.register('unblock', function (container, api) {
  var C = api.colors;
  var cv = api.createCanvas();
  var g = cv.g;
  var SZ = 6;

  var level = 0, pieces, moves, score = 0, over = false, exiting = null;
  var cell, ox, oy, raf = 0, paused = false, banner = null;
  var drag = null;

  var st = api.load();
  if (st && st.level >= 0 && st.level < LEVELS.length) { level = st.level; score = st.score | 0; }

  function reset() {
    pieces = LEVELS[level].map(function (p) { return { r: p[0], c: p[1], len: p[2], h: !!p[3], off: 0 }; });
    moves = 0;
    exiting = null;
    api.save({ level: level, score: score });
  }

  function layout() {
    var top = 52;
    cell = Math.floor(Math.min(cv.W - 16, cv.H - top - 16) / SZ);
    ox = ((cv.W - cell * SZ) / 2) | 0;
    oy = top + (((cv.H - top - cell * SZ) / 2) | 0);
  }
  cv.onResize = layout;

  function occupied(skip) {
    var grid = {};
    for (var i = 0; i < pieces.length; i++) {
      if (i === skip) continue;
      var p = pieces[i];
      for (var k = 0; k < p.len; k++) grid[(p.h ? p.r : p.r + k) * SZ + (p.h ? p.c + k : p.c)] = true;
    }
    return grid;
  }

  /* max slide range (in cells) for piece i in both directions */
  function range(i) {
    var p = pieces[i], grid = occupied(i);
    var back = 0, fwd = 0;
    while (true) {
      var nc = p.h ? p.c - back - 1 : p.c, nr = p.h ? p.r : p.r - back - 1;
      if (nc < 0 || nr < 0 || grid[nr * SZ + nc]) break;
      back++;
    }
    while (true) {
      nc = p.h ? p.c + p.len + fwd : p.c;
      nr = p.h ? p.r : p.r + p.len + fwd;
      if ((p.h ? nc : nr) >= SZ || grid[nr * SZ + nc]) break;
      fwd++;
    }
    return { back: back, fwd: fwd };
  }

  function pieceAt(x, y) {
    var cc = ((x - ox) / cell) | 0, rr = ((y - oy) / cell) | 0;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      for (var k = 0; k < p.len; k++) {
        if ((p.h ? p.r : p.r + k) === rr && (p.h ? p.c + k : p.c) === cc) return i;
      }
    }
    return -1;
  }

  function pt(e) {
    var p = e.touches && e.touches.length ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    var r = cv.canvas.getBoundingClientRect();
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }

  function down(e) {
    if (over || exiting || banner) return;
    var q = pt(e);
    var i = pieceAt(q.x, q.y);
    if (i < 0) return;
    var rg = range(i);
    drag = { i: i, sx: q.x, sy: q.y, rg: rg, moved: false };
    e.preventDefault();
  }
  function move(e) {
    if (!drag) return;
    var q = pt(e);
    var p = pieces[drag.i];
    var d = (p.h ? q.x - drag.sx : q.y - drag.sy) / cell;
    p.off = Math.max(-drag.rg.back, Math.min(drag.rg.fwd, d));
    e.preventDefault();
  }
  function up() {
    if (!drag) return;
    var p = pieces[drag.i];
    var snap = Math.round(p.off);
    if (snap !== 0) {
      if (p.h) p.c += snap; else p.r += snap;
      moves++;
      api.haptic('light');
      // red car exit check
      if (drag.i === 0 && p.c + p.len === SZ) {
        exiting = { t: 0 };
        api.haptic('success');
      }
    }
    p.off = 0;
    drag = null;
  }
  cv.canvas.addEventListener('touchstart', down, { passive: false });
  cv.canvas.addEventListener('touchmove', move, { passive: false });
  cv.canvas.addEventListener('touchend', up);
  cv.canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);

  function finishLevel() {
    var gained = Math.max(20, 150 - 10 * Math.max(0, moves - OPT[level]));
    score += gained;
    api.score(score);
    banner = '+' + gained;
    setTimeout(function () {
      if (over) return;
      banner = null;
      level++;
      if (level >= LEVELS.length) {
        over = true;
        api.save(null);
        api.gameOver(score, { win: true });
      } else reset();
    }, 1100);
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(api.t('level') + ' ' + (level + 1) + '/' + LEVELS.length, 12, 26);
    g.textAlign = 'right';
    g.fillText(api.t('moves') + ': ' + moves, cv.W - 12, 26);

    g.fillStyle = C.panel;
    g.fillRect(ox - 4, oy - 4, cell * SZ + 8, cell * SZ + 8);
    // exit arrow at row 2 right side
    g.fillStyle = C.good;
    g.font = (cell * 0.4 | 0) + 'px sans-serif';
    g.textAlign = 'left';
    g.fillText('➡', ox + cell * SZ + 6, oy + 2.5 * cell);
    g.fillStyle = C.bg;
    for (var r = 0; r < SZ; r++) for (var c = 0; c < SZ; c++) {
      g.fillRect(ox + c * cell + 2, oy + r * cell + 2, cell - 4, cell - 4);
    }
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var x = ox + (p.c + (p.h ? p.off : 0)) * cell;
      var y = oy + (p.r + (p.h ? 0 : p.off)) * cell;
      if (i === 0 && exiting) x += exiting.t * cell * 4;
      var w = (p.h ? p.len : 1) * cell, h = (p.h ? 1 : p.len) * cell;
      g.fillStyle = i === 0 ? C.bad : (p.h ? C.accent : C.panel2);
      rr(x + 4, y + 4, w - 8, h - 8, 8);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)';
      rr(x + 8, y + 8, w - 16, (h - 16) * 0.35, 5);
      g.fill();
    }
    if (banner) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, cv.H / 2 - 40, cv.W, 80);
      g.fillStyle = C.good;
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center';
      g.fillText(banner, cv.W / 2, cv.H / 2);
    }
  }
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    if (exiting) {
      exiting.t += 0.06;
      if (exiting.t >= 1) { exiting = null; finishLevel(); }
    }
    draw();
  }

  layout();
  reset();
  api.score(score);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      over = true;
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('touchstart', down);
      cv.canvas.removeEventListener('touchmove', move);
      cv.canvas.removeEventListener('touchend', up);
      cv.canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
