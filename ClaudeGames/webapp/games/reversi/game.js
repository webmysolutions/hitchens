/* Reversi (Othello) — player black vs minimax AI. MG game module. */
(function () {
'use strict';

/* Board: array[64], 1 black (player), -1 white (AI), 0 empty. */

var DR = [-1, -1, -1, 0, 0, 1, 1, 1];
var DC = [-1, 0, 1, -1, 1, -1, 0, 1];

/* Classic positional weights: corners 100, X-squares negative, edges positive. */
var W = [
  100, -25, 12, 6, 6, 12, -25, 100,
  -25, -45, -6, -6, -6, -6, -45, -25,
  12, -6, 4, 2, 2, 4, -6, 12,
  6, -6, 2, 0, 0, 2, -6, 6,
  6, -6, 2, 0, 0, 2, -6, 6,
  12, -6, 4, 2, 2, 4, -6, 12,
  -25, -45, -6, -6, -6, -6, -45, -25,
  100, -25, 12, 6, 6, 12, -25, 100
];

function flipsFor(bd, i, side) {
  if (bd[i] !== 0) return null;
  var r0 = i >> 3, c0 = i & 7, all = null;
  for (var d = 0; d < 8; d++) {
    var dr = DR[d], dc = DC[d], r = r0 + dr, c = c0 + dc, line = null;
    while (r >= 0 && r < 8 && c >= 0 && c < 8) {
      var v = bd[r * 8 + c];
      if (v === -side) { (line || (line = [])).push(r * 8 + c); }
      else {
        if (v === side && line) all = all ? all.concat(line) : line;
        break;
      }
      r += dr; c += dc;
    }
  }
  return all;
}

function legalList(bd, side) {
  var out = [];
  for (var i = 0; i < 64; i++) {
    var f = flipsFor(bd, i, side);
    if (f) out.push({ i: i, f: f });
  }
  return out;
}

function hasMove(bd, side) {
  for (var i = 0; i < 64; i++) if (flipsFor(bd, i, side)) return true;
  return false;
}

function countLegal(bd, side) {
  var n = 0;
  for (var i = 0; i < 64; i++) if (flipsFor(bd, i, side)) n++;
  return n;
}

function discDiff(bd) { // black minus white
  var s = 0;
  for (var i = 0; i < 64; i++) s += bd[i];
  return s;
}

function evalB(bd) { // positive = good for black
  var s = 0;
  for (var i = 0; i < 64; i++) {
    var v = bd[i];
    if (v) s += v > 0 ? W[i] : -W[i];
  }
  return s + 8 * (countLegal(bd, 1) - countLegal(bd, -1));
}

function place(bd, m, side) {
  bd[m.i] = side;
  for (var k = 0; k < m.f.length; k++) bd[m.f[k]] = side;
}
function unplace(bd, m, side) {
  bd[m.i] = 0;
  for (var k = 0; k < m.f.length; k++) bd[m.f[k]] = -side;
}
function byW(a, b) { return W[b.i] - W[a.i]; }

/* Negamax alpha-beta on positional eval. */
function searchR(bd, side, depth, alpha, beta) {
  var moves = legalList(bd, side);
  if (!moves.length) {
    if (!hasMove(bd, -side)) {
      var dd = discDiff(bd) * side;
      return dd > 0 ? 60000 + dd : dd < 0 ? -60000 + dd : 0;
    }
    return -searchR(bd, -side, depth, -beta, -alpha); // pass
  }
  if (depth <= 0) return side > 0 ? evalB(bd) : -evalB(bd);
  moves.sort(byW);
  for (var k = 0; k < moves.length; k++) {
    place(bd, moves[k], side);
    var v = -searchR(bd, -side, depth - 1, -beta, -alpha);
    unplace(bd, moves[k], side);
    if (v > alpha) { alpha = v; if (alpha >= beta) break; }
  }
  return alpha;
}

/* Exact endgame disc-count solver, capped by a node budget. */
var budget = 0;
function solveR(bd, side, alpha, beta, passed) {
  if (--budget < 0) return discDiff(bd) * side;
  var any = false, best = -1e9;
  for (var i = 0; i < 64; i++) {
    if (bd[i] !== 0) continue;
    var f = flipsFor(bd, i, side);
    if (!f) continue;
    any = true;
    bd[i] = side;
    for (var k = 0; k < f.length; k++) bd[f[k]] = side;
    var v = -solveR(bd, -side, -beta, -alpha, false);
    bd[i] = 0;
    for (k = 0; k < f.length; k++) bd[f[k]] = -side;
    if (v > best) best = v;
    if (v > alpha) { alpha = v; if (alpha >= beta) return alpha; }
  }
  if (!any) {
    if (passed) return discDiff(bd) * side;
    return -solveR(bd, -side, -beta, -alpha, true);
  }
  return best;
}

function startBoard() {
  var bd = [];
  for (var i = 0; i < 64; i++) bd.push(0);
  bd[27] = -1; bd[28] = 1; bd[35] = 1; bd[36] = -1;
  return bd;
}

MG.register('reversi', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var destroyed = false, paused = false;
  var timers = {}, tseq = 0;

  function later(fn, ms) {
    var k = ++tseq;
    function tick() {
      if (destroyed) return;
      if (paused) { timers[k] = setTimeout(tick, 250); return; }
      delete timers[k];
      fn();
    }
    timers[k] = setTimeout(tick, ms);
  }
  function clearTimers() {
    for (var k in timers) clearTimeout(timers[k]);
    timers = {};
  }

  function pxc(s) {
    s = String(s || '').trim();
    var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function blend(a, b, t) {
    var A = pxc(a), B = pxc(b);
    if (!A || !B) return a;
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  var cellBg = blend(C.panel2, '#ffffff', 0.05);
  var lineBg = blend(C.panel, '#000000', 0.40);
  var blackPc = blend('#000000', C.panel, 0.25);
  var whitePc = blend('#ffffff', C.panel2, 0.08);

  // ---------- DOM ----------
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  var style = el('style');
  style.textContent =
    '.rvw{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center}' +
    '.rvbar{width:100%;max-width:520px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;box-sizing:border-box}' +
    '.rvchip{padding:4px 10px;border-radius:10px;font-size:14px;font-weight:bold;white-space:nowrap;border:2px solid transparent}' +
    '.rvmain{flex:1;width:100%;display:flex;align-items:center;justify-content:center;min-height:0;position:relative}' +
    '.rvbd{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);gap:1px;padding:2px;border-radius:10px;box-sizing:border-box}' +
    '.rvc{display:flex;align-items:center;justify-content:center}' +
    '.rvp{width:82%;height:82%;border-radius:50%;pointer-events:none}' +
    '.rvdot{width:30%;height:30%;border-radius:50%;pointer-events:none;opacity:.85}' +
    '.rvf{animation:rvflip .18s ease-out}' +
    '@keyframes rvflip{from{transform:scale(.3)}to{transform:scale(1)}}' +
    '.rvtoast{position:absolute;left:50%;top:10%;transform:translateX(-50%);padding:8px 14px;border-radius:10px;font-size:14px;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap}' +
    '.rvbtn{border:0;border-radius:8px;padding:5px 12px;font-size:20px;line-height:1;cursor:pointer}';
  container.appendChild(style);

  var wrap = el('div', 'rvw'), bar = el('div', 'rvbar'), main = el('div', 'rvmain'), bdEl = el('div', 'rvbd');
  var bChip = el('span', 'rvchip'), wChip = el('span', 'rvchip'), stEl = el('span'), btn = el('button', 'rvbtn');
  var toastEl = el('div', 'rvtoast');
  bChip.style.background = C.panel2; bChip.style.color = C.text;
  wChip.style.background = C.panel2; wChip.style.color = C.text;
  stEl.style.cssText = 'flex:1;text-align:center;font-size:13px;color:' + C.muted;
  btn.style.cssText = 'background:' + C.panel2 + ';color:' + C.text;
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  toastEl.style.background = C.panel2;
  toastEl.style.color = C.text;
  toastEl.style.boxShadow = '0 2px 10px rgba(0,0,0,.35)';
  bdEl.style.background = lineBg;
  bdEl.style.boxShadow = '0 2px 12px rgba(0,0,0,.35)';

  var cells = [];
  for (var ci = 0; ci < 64; ci++) {
    var ce = el('div', 'rvc');
    ce.style.background = cellBg;
    ce.setAttribute('data-i', String(ci));
    bdEl.appendChild(ce);
    cells.push(ce);
  }
  bar.appendChild(bChip); bar.appendChild(stEl); bar.appendChild(wChip); bar.appendChild(btn);
  main.appendChild(bdEl);
  main.appendChild(toastEl);
  wrap.appendChild(bar); wrap.appendChild(main);
  container.appendChild(wrap);

  function layout() {
    var w = main.clientWidth || container.clientWidth || 320;
    var h = main.clientHeight || 320;
    var s = Math.max(160, Math.min(w, h) - 16);
    bdEl.style.width = s + 'px';
    bdEl.style.height = s + 'px';
    bdEl.style.fontSize = Math.floor(s / 13) + 'px';
  }
  window.addEventListener('resize', layout);
  layout();
  later(layout, 80);

  // ---------- state ----------
  var B, turn, over, busy, myMoves, lastI, anim;

  function count(side) {
    var n = 0;
    for (var i = 0; i < 64; i++) if (B[i] === side) n++;
    return n;
  }
  function saveState() { if (!over) api.save({ b: B, t: turn }); }
  function markAnim(m) {
    anim = {};
    anim[m.i] = 1;
    for (var k = 0; k < m.f.length; k++) anim[m.f[k]] = 1;
  }

  function updBar() {
    var nB = count(1), nW = count(-1);
    bChip.textContent = '⚫ ' + nB;
    wChip.textContent = '⚪ ' + nW;
    bChip.style.borderColor = (!over && turn === 1) ? C.accent : 'transparent';
    wChip.style.borderColor = (!over && turn === -1) ? C.accent : 'transparent';
    api.score(nB);
  }

  function render() {
    for (var i = 0; i < 64; i++) {
      var ce = cells[i], v = B[i], html = '';
      if (v !== 0) {
        var cls = 'rvp' + (anim && anim[i] && !api.lowEnd ? ' rvf' : '');
        var sh = 'inset 0 0.08em 0 rgba(255,255,255,.25),inset 0 -0.1em 0 rgba(0,0,0,.35)' +
          (lastI === i ? ',0 0 0 2px ' + C.accent : '');
        html = '<div class="' + cls + '" style="background:' + (v > 0 ? blackPc : whitePc) +
          ';box-shadow:' + sh + '"></div>';
      } else if (turn === 1 && !busy && !over && myMoves) {
        for (var k = 0; k < myMoves.length; k++) if (myMoves[k].i === i) {
          html = '<div class="rvdot" style="background:' + C.accent + '"></div>';
          break;
        }
      }
      if (ce._h !== html) { ce._h = html; ce.innerHTML = html; }
    }
    anim = null;
    updBar();
  }

  function showToast(txt) {
    toastEl.textContent = txt;
    toastEl.style.opacity = '1';
    later(function () { toastEl.style.opacity = '0'; }, 950);
  }

  function finish() {
    over = true; busy = false; myMoves = null;
    clearTimers();
    api.save(null);
    render();
    var nB = count(1), nW = count(-1);
    api.score(nB);
    if (nB > nW) { api.haptic('success'); api.gameOver(nB + 100, { win: true }); }
    else if (nB === nW) api.gameOver(nB + 50, { draw: true });
    else { api.haptic('error'); api.gameOver(nB, { win: false }); }
  }

  function toMove(t) {
    if (over) return;
    turn = t; myMoves = null;
    saveState();
    if (!hasMove(B, t)) {
      if (!hasMove(B, -t)) return finish();
      showToast(t === 1 ? (RU ? 'Нет ходов — пропуск' : 'No moves — you pass')
        : (RU ? 'Соперник пропускает ход' : 'Opponent passes'));
      stEl.textContent = '';
      render();
      later(function () { toMove(-t); }, 1100);
      return;
    }
    if (t === 1) {
      busy = false;
      myMoves = legalList(B, 1);
      stEl.textContent = api.t('your_turn');
      render();
    } else {
      render();
      aiGo();
    }
  }

  function onTap(e) {
    if (over || busy || turn !== 1 || !myMoves) return;
    var a = e.target.getAttribute && e.target.getAttribute('data-i');
    if (a == null) return;
    var i = +a, m = null;
    for (var k = 0; k < myMoves.length; k++) if (myMoves[k].i === i) { m = myMoves[k]; break; }
    if (!m) return;
    place(B, m, 1);
    api.haptic('light');
    markAnim(m);
    lastI = m.i;
    myMoves = null;
    render();
    later(function () { toMove(-1); }, api.lowEnd ? 60 : 240);
  }
  bdEl.addEventListener('click', onTap);

  function aiGo() {
    busy = true;
    stEl.textContent = api.t('thinking');
    render();
    var moves = legalList(B, -1);
    moves.sort(byW);
    var empties = 0;
    for (var i = 0; i < 64; i++) if (B[i] === 0) empties++;
    var exact = empties <= 12;
    budget = api.lowEnd ? 150000 : 450000;
    var depth = api.lowEnd ? 3 : 4;
    var idx = 0, best = moves[0], bestV = -1e9, alpha = -1e9;
    function chunk() {
      var t0 = Date.now();
      while (idx < moves.length && Date.now() - t0 < 45) {
        var m = moves[idx++];
        place(B, m, -1);
        var v = exact ? -solveR(B, 1, -1e9, -alpha, false)
          : -searchR(B, 1, depth - 1, -1e9, -alpha);
        unplace(B, m, -1);
        if (v > bestV) { bestV = v; best = m; if (v > alpha) alpha = v; }
      }
      if (idx < moves.length) { later(chunk, 16); return; }
      place(B, best, -1);
      api.haptic('light');
      markAnim(best);
      lastI = best.i;
      busy = false;
      render();
      later(function () { toMove(1); }, api.lowEnd ? 60 : 260);
    }
    later(chunk, 40);
  }

  function newGame(useSaved) {
    clearTimers();
    over = false; busy = false; myMoves = null; lastI = -1; anim = null;
    var s = useSaved ? api.load() : null;
    var ok = s && s.b && s.b.length === 64 && (s.t === 1 || s.t === -1), discs = 0, i;
    if (ok) for (i = 0; i < 64; i++) {
      var v = s.b[i];
      if (v !== 0 && v !== 1 && v !== -1) { ok = false; break; }
      if (v !== 0) discs++;
    }
    if (ok && discs >= 4) {
      B = s.b.slice();
      toMove(s.t);
    } else {
      B = startBoard();
      toMove(1);
    }
  }

  btn.onclick = function () {
    api.haptic('light');
    api.save(null);
    newGame(false);
  };

  newGame(true);

  return {
    destroy: function () {
      destroyed = true;
      clearTimers();
      window.removeEventListener('resize', layout);
      bdEl.removeEventListener('click', onTap);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
