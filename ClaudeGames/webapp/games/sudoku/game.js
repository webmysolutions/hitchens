/* Sudoku — DOM UI. Generated puzzles with unique solutions, 3 mistakes allowed. */
(function () {
'use strict';
MG.register('sudoku', function (container, api) {
  var C = api.colors, ru = api.lang === 'ru';

  function pc(s) {
    var m; s = String(s).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(s))) { var p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
    return [128, 128, 128];
  }
  function mix(a, b, t) {
    var A = pc(a), B = pc(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  function rgba(c, a) { var p = pc(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }
  function rep(s, n) { var r = ''; while (n-- > 0) r += s; return r; }

  // ---------- generator ----------
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function boxOf(i) { return ((i / 27) | 0) * 3 + (((i % 9) / 3) | 0); }

  function genFull() {
    var g = [], rows = [], cols = [], box = [], i;
    for (i = 0; i < 81; i++) g.push(0);
    for (i = 0; i < 9; i++) { rows.push(0); cols.push(0); box.push(0); }
    var digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    function rec(i) {
      if (i === 81) return true;
      var r = (i / 9) | 0, c = i % 9, b = boxOf(i);
      var ds = shuffle(digits.slice());
      for (var k = 0; k < 9; k++) {
        var d = ds[k], bit = 1 << d;
        if ((rows[r] | cols[c] | box[b]) & bit) continue;
        g[i] = d; rows[r] |= bit; cols[c] |= bit; box[b] |= bit;
        if (rec(i + 1)) return true;
        g[i] = 0; rows[r] &= ~bit; cols[c] &= ~bit; box[b] &= ~bit;
      }
      return false;
    }
    rec(0);
    return g;
  }

  var steps = 0; // shared uniqueness-check budget for one generation
  function countSolutions(g, limit) {
    var rows = [0, 0, 0, 0, 0, 0, 0, 0, 0], cols = rows.slice(), box = rows.slice(), i, bit;
    for (i = 0; i < 81; i++) if (g[i]) {
      bit = 1 << g[i];
      rows[(i / 9) | 0] |= bit; cols[i % 9] |= bit; box[boxOf(i)] |= bit;
    }
    var n = 0, dead = false;
    function bits(m) { var k = 0; while (m) { m &= m - 1; k++; } return k; }
    function rec() {
      if (--steps < 0) { dead = true; return; }
      var bi = -1, bc = 10, bm = 0;
      for (var j = 0; j < 81; j++) {
        if (g[j]) continue;
        var m = (~(rows[(j / 9) | 0] | cols[j % 9] | box[boxOf(j)])) & 0x3FE;
        var k = bits(m);
        if (k === 0) return; // dead end
        if (k < bc) { bc = k; bi = j; bm = m; if (k === 1) break; }
      }
      if (bi < 0) { n++; return; }
      var r0 = (bi / 9) | 0, c0 = bi % 9, b0 = boxOf(bi);
      for (var d = 1; d <= 9 && n < limit && !dead; d++) {
        var bt = 1 << d;
        if (!(bm & bt)) continue;
        g[bi] = d; rows[r0] |= bt; cols[c0] |= bt; box[b0] |= bt;
        rec();
        g[bi] = 0; rows[r0] &= ~bt; cols[c0] &= ~bt; box[b0] &= ~bt;
      }
    }
    rec();
    return dead ? limit : n;
  }

  function generate() {
    var d = Math.random() < 0.5 ? 'easy' : 'medium';
    var full = genFull();
    var p = full.slice();
    var target = d === 'easy' ? 34 + ((Math.random() * 7) | 0) : 28 + ((Math.random() * 6) | 0);
    var order = [], i;
    for (i = 0; i < 81; i++) order.push(i);
    shuffle(order);
    steps = 30000;
    var givens = 81;
    for (i = 0; i < 81 && givens > target && steps > 0; i++) {
      var k = order[i], v = p[k];
      p[k] = 0;
      if (countSolutions(p, 2) === 1) givens--;
      else p[k] = v; // not unique (or budget hit) — keep the clue
    }
    return { sol: full, puz: p, diff: d };
  }

  // ---------- state ----------
  var sol, puz, board, given, mistakes, seconds, diff;
  var sel = -1, over = false, paused = false, timerInt = 0;
  var units = []; // 27 units of 9 indices for conflict checks
  (function () {
    var r, c, b, u;
    for (r = 0; r < 9; r++) { u = []; for (c = 0; c < 9; c++) u.push(r * 9 + c); units.push(u); }
    for (c = 0; c < 9; c++) { u = []; for (r = 0; r < 9; r++) u.push(r * 9 + c); units.push(u); }
    for (b = 0; b < 9; b++) {
      u = [];
      var r0 = ((b / 3) | 0) * 3, c0 = (b % 3) * 3;
      for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) u.push((r0 + r) * 9 + c0 + c);
      units.push(u);
    }
  })();

  function tryResume() {
    var s = api.load();
    if (!s || s.v !== 1 || typeof s.sol !== 'string' || s.sol.length !== 81 ||
        typeof s.puz !== 'string' || s.puz.length !== 81 ||
        typeof s.board !== 'string' || s.board.length !== 81) return false;
    sol = s.sol.split('').map(Number);
    puz = s.puz.split('').map(Number);
    board = s.board.split('').map(Number);
    mistakes = Math.min(2, Math.max(0, s.m | 0));
    seconds = Math.max(0, s.s | 0);
    diff = s.d === 'medium' ? 'medium' : 'easy';
    for (var i = 0; i < 81; i++) {
      if (!(sol[i] >= 1 && sol[i] <= 9)) return false;
      if (board[i] !== sol[i]) return true; // unfinished — resume
    }
    return false; // already solved — new game
  }
  if (!tryResume()) {
    var g = generate();
    sol = g.sol; puz = g.puz; diff = g.diff;
    board = puz.slice(); mistakes = 0; seconds = 0;
  }
  given = puz.map(Boolean);

  function persist() {
    if (over) return;
    api.save({ v: 1, sol: sol.join(''), puz: puz.join(''), board: board.join(''), m: mistakes, s: seconds, d: diff });
  }

  // ---------- DOM ----------
  container.style.background = C.bg;
  var strong = mix(C.text, C.bg, 0.55), weak = mix(C.text, C.bg, 0.82);
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;color:' + C.text + ';user-select:none;-webkit-user-select:none;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;max-width:420px;padding:10px 14px;box-sizing:border-box;font-weight:700;font-size:15px;';
  var diffLbl = document.createElement('div');
  diffLbl.textContent = ru ? (diff === 'easy' ? 'Легко' : 'Средне') : (diff === 'easy' ? 'Easy' : 'Medium');
  diffLbl.style.color = C.accent;
  var mistLbl = document.createElement('div');
  var timeLbl = document.createElement('div');
  bar.appendChild(diffLbl); bar.appendChild(mistLbl); bar.appendChild(timeLbl);

  var wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;width:100%;min-height:0;';
  var gridEl = document.createElement('div');
  gridEl.style.cssText = 'display:grid;background:' + C.panel + ';border:2px solid ' + strong + ';border-radius:8px;overflow:hidden;touch-action:manipulation;';
  wrap.appendChild(gridEl);

  var cells = [];
  for (var ci = 0; ci < 81; ci++) {
    var el = document.createElement('div');
    el.setAttribute('data-i', ci);
    var r = (ci / 9) | 0, c = ci % 9;
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;box-sizing:border-box;font-weight:600;' +
      'border-right:' + (c === 8 ? 'none' : (c % 3 === 2 ? '2px solid ' + strong : '1px solid ' + weak)) + ';' +
      'border-bottom:' + (r === 8 ? 'none' : (r % 3 === 2 ? '2px solid ' + strong : '1px solid ' + weak)) + ';';
    gridEl.appendChild(el);
    cells.push(el);
  }

  var pad = document.createElement('div');
  pad.style.cssText = 'width:100%;max-width:420px;padding:8px 12px 14px;box-sizing:border-box;';
  var padBtns = {};
  function mkRow(list) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    for (var k = 0; k < list.length; k++) {
      var b = document.createElement('button');
      b.textContent = list[k];
      b.setAttribute('data-d', list[k] === '⌫' ? '0' : list[k]);
      b.style.cssText = 'flex:1;font:inherit;font-size:20px;font-weight:700;padding:10px 0;border-radius:10px;border:none;background:' + C.panel2 + ';color:' + C.text + ';cursor:pointer;';
      padBtns[b.getAttribute('data-d')] = b;
      row.appendChild(b);
    }
    pad.appendChild(row);
    return row;
  }
  mkRow(['1', '2', '3', '4', '5']);
  mkRow(['6', '7', '8', '9', '⌫']);

  root.appendChild(bar); root.appendChild(wrap); root.appendChild(pad);
  container.appendChild(root);

  function layout() {
    var w = wrap.clientWidth - 16, h = wrap.clientHeight - 16;
    var s = Math.floor(Math.min(w, h) / 9);
    s = Math.max(24, Math.min(s, 46));
    gridEl.style.gridTemplateColumns = 'repeat(9,' + s + 'px)';
    gridEl.style.gridAutoRows = s + 'px';
    gridEl.style.fontSize = Math.floor(s * 0.58) + 'px';
  }
  window.addEventListener('resize', layout);

  // ---------- rendering ----------
  var userCol = mix(C.accent, C.text, 0.15);
  function correctCount() {
    var n = 0;
    for (var i = 0; i < 81; i++) if (!given[i] && board[i] && board[i] === sol[i]) n++;
    return n;
  }
  function render() {
    var conf = new Uint8Array(81), u, k, i, seen, v;
    for (u = 0; u < 27; u++) {
      seen = {};
      for (k = 0; k < 9; k++) {
        i = units[u][k]; v = board[i];
        if (!v) continue;
        if (seen[v] !== undefined) { conf[i] = 1; conf[seen[v]] = 1; }
        else seen[v] = i;
      }
    }
    var done = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (i = 0; i < 81; i++) if (board[i] && board[i] === sol[i]) done[board[i]]++;
    var selV = sel >= 0 ? board[sel] : 0;
    var selR = sel >= 0 ? (sel / 9) | 0 : -1, selC = sel >= 0 ? sel % 9 : -1, selB = sel >= 0 ? boxOf(sel) : -1;
    for (i = 0; i < 81; i++) {
      var el = cells[i], s = el.style;
      v = board[i];
      el.textContent = v ? String(v) : '';
      var bg = 'transparent';
      if (i === sel) bg = rgba(C.accent, 0.38);
      else if (selV && v === selV) bg = rgba(C.accent, 0.2);
      else if (sel >= 0 && (((i / 9) | 0) === selR || i % 9 === selC || boxOf(i) === selB)) bg = rgba(C.accent, 0.08);
      s.background = bg;
      s.color = (v && (conf[i] || (!given[i] && v !== sol[i]))) ? C.bad : (given[i] ? C.text : userCol);
      s.fontWeight = given[i] ? '700' : '600';
    }
    for (var d = 1; d <= 9; d++) {
      var b = padBtns[String(d)];
      b.style.color = done[d] === 9 ? C.muted : C.text;
      b.style.opacity = done[d] === 9 ? '0.5' : '1';
    }
    mistLbl.textContent = rep('❤️', 3 - mistakes) + rep('🖤', mistakes);
    api.score(correctCount() * 5);
  }
  function fmt(s) { var m = (s / 60) | 0; s = s % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function updTime() { timeLbl.textContent = '⏱ ' + fmt(seconds); }

  // ---------- game logic ----------
  function endLose() {
    over = true; stopTimer();
    api.save(null);
    api.gameOver(correctCount() * 5);
  }
  function checkWin() {
    for (var i = 0; i < 81; i++) if (board[i] !== sol[i]) return;
    over = true; stopTimer();
    api.save(null);
    var sc = 500 + Math.max(0, 900 - seconds) + (3 - mistakes) * 100;
    api.haptic('success');
    api.gameOver(sc, { win: true });
  }
  function place(d) {
    if (over || paused || sel < 0) return;
    var i = sel;
    if (given[i] || (board[i] && board[i] === sol[i])) return; // locked
    if (board[i] === d) return;
    board[i] = d;
    if (d === sol[i]) {
      api.haptic('light');
      persist(); render();
      checkWin();
    } else {
      mistakes++;
      api.haptic('error');
      persist(); render();
      if (mistakes >= 3) endLose();
    }
  }
  function erase() {
    if (over || paused || sel < 0) return;
    if (given[sel] || !board[sel] || board[sel] === sol[sel]) return;
    board[sel] = 0;
    persist(); render();
  }

  // ---------- input ----------
  function onGridClick(ev) {
    if (over) return;
    var t = ev.target, a = t && t.getAttribute && t.getAttribute('data-i');
    if (a == null) return;
    sel = +a;
    render();
  }
  function onPadClick(ev) {
    var t = ev.target, a = t && t.getAttribute && t.getAttribute('data-d');
    if (a == null) return;
    var d = +a;
    if (d === 0) erase(); else place(d);
  }
  function onKey(e) {
    if (over) return;
    if (e.key >= '1' && e.key <= '9') { place(+e.key); e.preventDefault(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { erase(); e.preventDefault(); return; }
    var mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
    if (mv !== undefined) {
      e.preventDefault();
      if (sel < 0) sel = 40;
      else {
        var n = sel + mv;
        if (n >= 0 && n < 81 && !(mv === -1 && sel % 9 === 0) && !(mv === 1 && sel % 9 === 8)) sel = n;
      }
      render();
    }
  }
  gridEl.addEventListener('click', onGridClick);
  pad.addEventListener('click', onPadClick);
  window.addEventListener('keydown', onKey);

  timerInt = setInterval(function () {
    if (!paused && !over) {
      seconds++;
      updTime();
      if (seconds % 15 === 0) persist();
    }
  }, 1000);
  function stopTimer() { if (timerInt) { clearInterval(timerInt); timerInt = 0; } }

  layout();
  updTime();
  render();

  return {
    destroy: function () {
      stopTimer();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', layout);
      persist();
    },
    pause: function () { paused = true; persist(); },
    resume: function () { paused = false; }
  };
});
})();
