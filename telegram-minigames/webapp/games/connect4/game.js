/* Connect Four vs AI (minimax alpha-beta). MG game contract. */
(function () {
'use strict';

/* --- AI core (pure, no DOM) --- */
var C4_ORDER = [3, 2, 4, 1, 5, 0, 6]; // center-first move ordering
var C4_WINDOWS = (function () {
  var w = [], c, r;
  for (r = 0; r < 6; r++) for (c = 0; c < 4; c++)
    w.push([r * 7 + c, r * 7 + c + 1, r * 7 + c + 2, r * 7 + c + 3]);
  for (c = 0; c < 7; c++) for (r = 0; r < 3; r++)
    w.push([r * 7 + c, (r + 1) * 7 + c, (r + 2) * 7 + c, (r + 3) * 7 + c]);
  for (r = 0; r < 3; r++) for (c = 0; c < 4; c++)
    w.push([r * 7 + c, (r + 1) * 7 + c + 1, (r + 2) * 7 + c + 2, (r + 3) * 7 + c + 3]);
  for (r = 3; r < 6; r++) for (c = 0; c < 4; c++)
    w.push([r * 7 + c, (r - 1) * 7 + c + 1, (r - 2) * 7 + c + 2, (r - 3) * 7 + c + 3]);
  return w;
})();
// If the disc at (c,r) completes 4-in-a-row, return the 4 cell indices, else null.
function c4WinCells(b, c, r) {
  var v = b[r * 7 + c];
  if (!v) return null;
  var dirs = [[1, 0], [0, 1], [1, 1], [1, -1]], d, s, cc, rr;
  for (d = 0; d < 4; d++) {
    var cells = [r * 7 + c];
    for (s = -1; s <= 1; s += 2) {
      cc = c + dirs[d][0] * s; rr = r + dirs[d][1] * s;
      while (cc >= 0 && cc < 7 && rr >= 0 && rr < 6 && b[rr * 7 + cc] === v) {
        cells.push(rr * 7 + cc);
        cc += dirs[d][0] * s; rr += dirs[d][1] * s;
      }
    }
    if (cells.length >= 4) {
      cells.sort(function (x, y) { return x - y; });
      return cells.slice(0, 4);
    }
  }
  return null;
}
// Heuristic from AI's (player 2) perspective: windows-of-4 counts + center bonus.
function c4Eval(b) {
  var s = 0, w, i, a, h, v;
  for (w = 0; w < C4_WINDOWS.length; w++) {
    var W = C4_WINDOWS[w];
    a = 0; h = 0;
    for (i = 0; i < 4; i++) { v = b[W[i]]; if (v === 2) a++; else if (v === 1) h++; }
    if (a && h) continue; // blocked window
    if (a === 3) s += 120; else if (a === 2) s += 12;
    else if (h === 3) s -= 140; else if (h === 2) s -= 12;
  }
  for (i = 3; i < 42; i += 7) { v = b[i]; if (v === 2) s += 6; else if (v === 1) s -= 6; }
  return s;
}
function c4Search(b, hts, depth, alpha, beta, maxing) {
  if (depth === 0) return c4Eval(b);
  var best = maxing ? -1e9 : 1e9, moved = false, i, c, r, sc;
  for (i = 0; i < 7; i++) {
    c = C4_ORDER[i];
    if (hts[c] >= 6) continue;
    moved = true;
    r = 5 - hts[c];
    b[r * 7 + c] = maxing ? 2 : 1; hts[c]++;
    if (c4WinCells(b, c, r)) sc = maxing ? 100000 + depth : -100000 - depth;
    else sc = c4Search(b, hts, depth - 1, alpha, beta, !maxing);
    b[r * 7 + c] = 0; hts[c]--;
    if (maxing) { if (sc > best) best = sc; if (best > alpha) alpha = best; }
    else { if (sc < best) best = sc; if (best < beta) beta = best; }
    if (alpha >= beta) break;
  }
  return moved ? best : 0;
}
// Score of the AI dropping into column c, searching `depth` plies total.
function c4ScoreMove(b, hts, c, depth, alpha, beta) {
  var r = 5 - hts[c], sc;
  b[r * 7 + c] = 2; hts[c]++;
  if (c4WinCells(b, c, r)) sc = 1000000;
  else sc = c4Search(b, hts, depth - 1, alpha, beta, false);
  b[r * 7 + c] = 0; hts[c]--;
  return sc;
}
/* --- end AI core --- */

MG.register('connect4', function (container, api) {
  var C = api.colors;
  var RU = api.lang === 'ru';
  var HU = 1, AI = 2;
  var DEPTH = api.lowEnd ? 4 : 6;

  var board, hts, over, busy, think;
  var timers = [], queue = [], paused = false;

  // setTimeout wrapper: tracked for destroy, defers callbacks while paused
  // (this is what suspends AI thinking chunks and animation on pause)
  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      if (paused) { queue.push(fn); return; }
      fn();
    }, ms);
    timers.push(id);
  }

  /* ---------- UI ---------- */
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;padding:10px;box-sizing:border-box;';

  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
    'width:min(96vw,62vh,430px);margin-bottom:8px;';
  var statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:17px;font-weight:700;color:' + C.text;
  var newBtn = document.createElement('button');
  newBtn.textContent = '↺ ' + (RU ? 'Заново' : 'New game');
  newBtn.style.cssText = 'font-size:14px;font-weight:600;padding:6px 12px;border:none;' +
    'border-radius:10px;cursor:pointer;background:' + C.panel2 + ';color:' + C.text;
  newBtn.onclick = function () { newGame(); };
  bar.appendChild(statusEl);
  bar.appendChild(newBtn);

  var arrowsEl = document.createElement('div');
  arrowsEl.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px;' +
    'width:min(96vw,62vh,430px);padding:0 8px;box-sizing:border-box;margin-bottom:2px;';
  var arrows = [];
  for (var ai = 0; ai < 7; ai++) (function (c) {
    var a = document.createElement('div');
    a.textContent = '▼';
    a.style.cssText = 'text-align:center;font-size:min(5vw,20px);cursor:pointer;' +
      'user-select:none;-webkit-user-select:none;padding:2px 0;color:' + C.accent;
    a.onclick = function () { humanDrop(c); };
    arrows.push(a);
    arrowsEl.appendChild(a);
  })(ai);

  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px;' +
    'width:min(96vw,62vh,430px);padding:8px;box-sizing:border-box;border-radius:14px;' +
    'background:' + C.panel;
  var cells = [];
  for (var ki = 0; ki < 42; ki++) (function (i) {
    var d = document.createElement('div');
    d.style.cssText = 'aspect-ratio:1;border-radius:50%;display:flex;align-items:center;' +
      'justify-content:center;font-size:min(9.5vw,6vh,42px);line-height:1;cursor:pointer;' +
      'user-select:none;-webkit-user-select:none;background:' + C.bg;
    d.onclick = function () { humanDrop(i % 7); };
    cells.push(d);
    boardEl.appendChild(d);
  })(ki);

  root.appendChild(bar);
  root.appendChild(arrowsEl);
  root.appendChild(boardEl);
  container.appendChild(root);

  /* ---------- flow ---------- */
  function setStatus(s) { statusEl.textContent = s; }
  function isFull() {
    for (var c = 0; c < 7; c++) if (hts[c] < 6) return false;
    return true;
  }
  function countEmpty() {
    var n = 0;
    for (var i = 0; i < 42; i++) if (!board[i]) n++;
    return n;
  }

  // cheap falling animation: emoji steps down the column
  function drop(c, p, done) {
    busy = true;
    var target = 5 - hts[c];
    var emo = p === HU ? '🔴' : '🟡';
    api.haptic('light');
    function land() {
      board[target * 7 + c] = p;
      hts[c]++;
      cells[target * 7 + c].textContent = emo;
      busy = false;
      done(target);
    }
    if (api.lowEnd || target === 0) { land(); return; }
    var r = 0;
    (function step() {
      if (over) { busy = false; return; }
      if (r > 0) cells[(r - 1) * 7 + c].textContent = '';
      if (r === target) { land(); return; }
      cells[r * 7 + c].textContent = emo;
      r++;
      later(step, 34);
    })();
  }

  function humanDrop(c) {
    if (over || busy || think || paused || hts[c] >= 6) return;
    drop(c, HU, function (r) {
      var wc = c4WinCells(board, c, r);
      if (wc) return endGame('win', wc);
      if (isFull()) return endGame('draw', null);
      startThinking();
    });
  }

  // AI search chunked with setTimeout: one root column per chunk
  function startThinking() {
    setStatus(api.t('thinking'));
    think = { i: 0, best: -Infinity, bestCol: -1, alpha: -Infinity };
    later(thinkChunk, 50);
  }
  function thinkChunk() {
    if (over || !think) { think = null; return; }
    while (think.i < 7 && hts[C4_ORDER[think.i]] >= 6) think.i++;
    if (think.i >= 7) { finishThinking(); return; }
    var c = C4_ORDER[think.i];
    var sc = c4ScoreMove(board, hts, c, DEPTH, think.alpha, Infinity);
    if (sc > think.best) {
      think.best = sc;
      think.bestCol = c;
      if (sc > think.alpha) think.alpha = sc;
    }
    think.i++;
    later(thinkChunk, 0);
  }
  function finishThinking() {
    var c = think.bestCol;
    think = null;
    drop(c, AI, function (r) {
      var wc = c4WinCells(board, c, r);
      if (wc) return endGame('lose', wc);
      if (isFull()) return endGame('draw', null);
      setStatus(api.t('your_turn'));
    });
  }

  function endGame(res, wc) {
    over = true;
    think = null;
    setStatus(api.t(res === 'win' ? 'you_win' : res === 'lose' ? 'you_lose' : 'draw'));
    if (wc) {
      var ring = res === 'win' ? C.good : C.bad;
      for (var i = 0; i < 4; i++) cells[wc[i]].style.boxShadow = '0 0 0 3px ' + ring;
    }
    var score, opts;
    if (res === 'win') { score = 100 + countEmpty(); opts = { win: true }; api.haptic('success'); }
    else if (res === 'draw') { score = 50; opts = { draw: true }; }
    else { score = 10; opts = { win: false }; api.haptic('error'); }
    api.score(score);
    later(function () { api.gameOver(score, opts); }, 1200);
  }

  function newGame() {
    if (over) return; // shell overlay handles restart after gameOver
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers.length = 0;
    queue.length = 0;
    think = null;
    busy = false;
    board = [];
    hts = [0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < 42; i++) {
      board.push(0);
      cells[i].textContent = '';
      cells[i].style.boxShadow = 'none';
    }
    api.score(0);
    setStatus(api.t('your_turn'));
  }

  function onKey(e) {
    var n = parseInt(e.key, 10); // keys 1..7 drop in that column
    if (n >= 1 && n <= 7) humanDrop(n - 1);
  }
  window.addEventListener('keydown', onKey);

  over = false;
  newGame();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      queue.length = 0;
      think = null;
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () {
      paused = false;
      var q = queue;
      queue = [];
      for (var i = 0; i < q.length; i++) q[i]();
    }
  };
});
})();
