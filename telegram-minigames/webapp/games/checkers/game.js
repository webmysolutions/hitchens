/* Checkers — American checkers (8x8) vs minimax AI. MG game module. */
(function () {
'use strict';

/* Board: array[64], 0 empty, 1 player man (light, moves up), 2 player king,
   -1 AI man (dark, moves down), -2 AI king. Playable = dark squares (r+c odd). */

// --- rules ---
var DIRR = [-1, -1, 1, 1];
var DIRC = [-1, 1, -1, 1];

function isK(v) { return v === 2 || v === -2; }

function jumps1(bd, i) {
  var v = bd[i], out = [], r = i >> 3, c = i & 7;
  var d0 = isK(v) ? 0 : (v > 0 ? 0 : 2), d1 = isK(v) ? 4 : (v > 0 ? 2 : 4);
  for (var d = d0; d < d1; d++) {
    var tr = r + DIRR[d] * 2, tc = c + DIRC[d] * 2;
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
    var mi = (r + DIRR[d]) * 8 + (c + DIRC[d]), ti = tr * 8 + tc, mv = bd[mi];
    if (bd[ti] === 0 && mv !== 0 && (mv > 0) !== (v > 0)) out.push({ to: ti, cap: mi });
  }
  return out;
}

function steps1(bd, i) {
  var v = bd[i], out = [], r = i >> 3, c = i & 7;
  var d0 = isK(v) ? 0 : (v > 0 ? 0 : 2), d1 = isK(v) ? 4 : (v > 0 ? 2 : 4);
  for (var d = d0; d < d1; d++) {
    var tr = r + DIRR[d], tc = c + DIRC[d];
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7) continue;
    var ti = tr * 8 + tc;
    if (bd[ti] === 0) out.push({ to: ti, cap: -1 });
  }
  return out;
}

/* Full capture sequences (mandatory multi-jump; crowning ends the move). */
function dfsCaps(bd, from, i, path, caps, out) {
  var js = jumps1(bd, i);
  if (!js.length) {
    if (path.length) out.push({ from: from, path: path.slice(), caps: caps.slice() });
    return;
  }
  var v = bd[i];
  for (var k = 0; k < js.length; k++) {
    var j = js[k], cv = bd[j.cap];
    bd[i] = 0; bd[j.cap] = 0;
    var crowned = !isK(v) && ((v > 0 && j.to < 8) || (v < 0 && j.to >= 56));
    bd[j.to] = crowned ? v * 2 : v;
    path.push(j.to); caps.push(j.cap);
    if (crowned) out.push({ from: from, path: path.slice(), caps: caps.slice() });
    else dfsCaps(bd, from, j.to, path, caps, out);
    path.pop(); caps.pop();
    bd[j.to] = 0; bd[j.cap] = cv; bd[i] = v;
  }
}

/* All legal moves for side; if any capture exists only captures are returned. */
function genMoves(bd, side) {
  var out = [], i, v, k;
  for (i = 0; i < 64; i++) {
    v = bd[i];
    if (v !== 0 && (v > 0) === (side > 0)) dfsCaps(bd, i, i, [], [], out);
  }
  if (out.length) return out;
  for (i = 0; i < 64; i++) {
    v = bd[i];
    if (v === 0 || (v > 0) !== (side > 0)) continue;
    var st = steps1(bd, i);
    for (k = 0; k < st.length; k++) out.push({ from: i, path: [st[k].to], caps: [] });
  }
  return out;
}

function anyMoves(bd, side) {
  for (var i = 0; i < 64; i++) {
    var v = bd[i];
    if (v === 0 || (v > 0) !== (side > 0)) continue;
    if (steps1(bd, i).length || jumps1(bd, i).length) return true;
  }
  return false;
}

function doMove(bd, m) {
  var v = bd[m.from], to = m.path[m.path.length - 1], u = { v: v, cv: null };
  bd[m.from] = 0;
  if (m.caps.length) {
    u.cv = [];
    for (var k = 0; k < m.caps.length; k++) { u.cv.push(bd[m.caps[k]]); bd[m.caps[k]] = 0; }
  }
  bd[to] = (!isK(v) && ((v > 0 && to < 8) || (v < 0 && to >= 56))) ? v * 2 : v;
  return u;
}

function undoMove(bd, m, u) {
  bd[m.path[m.path.length - 1]] = 0;
  if (u.cv) for (var k = 0; k < m.caps.length; k++) bd[m.caps[k]] = u.cv[k];
  bd[m.from] = u.v;
}

/* Evaluation, positive = good for player (side 1):
   material (man 100 / king 160) + advancement + cheap mobility. */
function evalP(bd) {
  var s = 0;
  for (var i = 0; i < 64; i++) {
    var v = bd[i];
    if (!v) continue;
    var r = i >> 3, c = i & 7;
    if (v === 1) s += 100 + (7 - r) * 3;
    else if (v === 2) s += 160;
    else if (v === -1) s -= 100 + r * 3;
    else s -= 160;
    var d0 = isK(v) ? 0 : (v > 0 ? 0 : 2), d1 = isK(v) ? 4 : (v > 0 ? 2 : 4);
    for (var d = d0; d < d1; d++) {
      var nr = r + DIRR[d], nc = c + DIRC[d];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && bd[nr * 8 + nc] === 0) s += v > 0 ? 2 : -2;
    }
  }
  return s;
}

/* Negamax alpha-beta; capture chains are extended past depth 0. */
function searchC(bd, side, depth, alpha, beta) {
  var moves = genMoves(bd, side);
  if (!moves.length) return -30000 - depth * 16; // side to move loses
  if (depth <= 0 && !moves[0].caps.length) return side > 0 ? evalP(bd) : -evalP(bd);
  var nd = depth > 1 ? depth - 1 : 0;
  for (var k = 0; k < moves.length; k++) {
    var u = doMove(bd, moves[k]);
    var v = -searchC(bd, -side, nd, -beta, -alpha);
    undoMove(bd, moves[k], u);
    if (v > alpha) { alpha = v; if (alpha >= beta) break; }
  }
  return alpha;
}

function startBoard() {
  var bd = [];
  for (var i = 0; i < 64; i++) {
    var r = i >> 3, dark = ((r + (i & 7)) & 1) === 1;
    bd.push(!dark ? 0 : r < 3 ? -1 : r > 4 ? 1 : 0);
  }
  return bd;
}
// --- end rules ---

MG.register('checkers', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var QUIET_LIMIT = 80; // 40 moves per side without capture/crowning -> draw
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

  var darkSq = blend(C.panel, '#000000', 0.30);
  var selSq = blend(darkSq, C.accent, 0.45);
  var lastSq = blend(darkSq, C.accent, 0.20);
  var lightSq = blend(C.panel2, '#ffffff', 0.08);
  var lightPc = blend('#ffffff', C.panel2, 0.15);
  var darkPc = blend('#000000', C.panel, 0.35);

  // ---------- DOM ----------
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  var style = el('style');
  style.textContent =
    '.ckw{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center}' +
    '.ckbar{width:100%;max-width:520px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;box-sizing:border-box}' +
    '.ckmain{flex:1;width:100%;display:flex;align-items:center;justify-content:center;min-height:0}' +
    '.ckbd{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border-radius:10px;overflow:hidden}' +
    '.ckc{display:flex;align-items:center;justify-content:center}' +
    '.ckp{width:78%;height:78%;border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:.9em;box-sizing:border-box}' +
    '.ckd{width:32%;height:32%;border-radius:50%;pointer-events:none;opacity:.9}' +
    '.ckbtn{border:0;border-radius:8px;padding:5px 12px;font-size:20px;line-height:1;cursor:pointer}';
  container.appendChild(style);

  var wrap = el('div', 'ckw'), bar = el('div', 'ckbar'), main = el('div', 'ckmain'), bdEl = el('div', 'ckbd');
  var cntEl = el('span'), stEl = el('span'), btn = el('button', 'ckbtn');
  cntEl.style.cssText = 'font-size:14px;font-weight:bold;white-space:nowrap;color:' + C.text;
  stEl.style.cssText = 'flex:1;text-align:center;font-size:14px;color:' + C.muted;
  btn.style.cssText = 'background:' + C.panel2 + ';color:' + C.text;
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  bdEl.style.boxShadow = '0 2px 12px rgba(0,0,0,.35)';

  var cells = [];
  for (var ci = 0; ci < 64; ci++) {
    var ce = el('div', 'ckc');
    var dark = (((ci >> 3) + (ci & 7)) & 1) === 1;
    ce.style.background = dark ? darkSq : lightSq;
    if (dark) ce.setAttribute('data-i', String(ci));
    bdEl.appendChild(ce);
    cells.push(ce);
  }
  bar.appendChild(cntEl); bar.appendChild(stEl); bar.appendChild(btn);
  main.appendChild(bdEl);
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
  var B, turn, quiet, over, busy, sel, forced, pm, lastMv;

  function count(side) {
    var n = 0;
    for (var i = 0; i < 64; i++) if (B[i] !== 0 && (B[i] > 0) === (side > 0)) n++;
    return n;
  }
  function updScore() { api.score(Math.max(0, (12 - count(-1)) * 5)); }
  function saveState() { if (!over) api.save({ b: B, t: turn, q: quiet }); }

  function pieceHTML(v, ring) {
    var sh = 'inset 0 -0.14em 0 rgba(0,0,0,.35),inset 0 0.1em 0 rgba(255,255,255,.25)';
    if (ring) sh += ',0 0 0 2px ' + C.accent;
    return '<div class="ckp" style="background:' + (v > 0 ? lightPc : darkPc) +
      ';box-shadow:' + sh + '">' + (isK(v) ? '👑' : '') + '</div>';
  }

  function render() {
    var mv = (turn === 1 && !busy && !over && pm) ? pm.byFrom : null;
    for (var i = 0; i < 64; i++) {
      if ((((i >> 3) + (i & 7)) & 1) !== 1) continue;
      var ce = cells[i];
      ce.style.background = sel === i ? selSq :
        (lastMv && (lastMv.from === i || lastMv.to === i)) ? lastSq : darkSq;
      var v = B[i], html = '';
      if (v !== 0) html = pieceHTML(v, !!(mv && mv[i] && mv[i].length));
      else if (sel >= 0 && mv && mv[sel]) {
        var os = mv[sel];
        for (var k = 0; k < os.length; k++) if (os[k].to === i) {
          html = '<div class="ckd" style="background:' + (os[k].cap >= 0 ? C.bad : C.accent) + '"></div>';
          break;
        }
      }
      if (ce._h !== html) { ce._h = html; ce.innerHTML = html; }
    }
    cntEl.textContent = '⚪ ' + count(1) + ' · ' + count(-1) + ' ⚫';
  }

  /* Player-side movable pieces: single steps of the (mandatory) legal moves. */
  function computePlayer() {
    var byFrom = {}, caps = false, i;
    if (forced >= 0) {
      byFrom[forced] = jumps1(B, forced);
      return { byFrom: byFrom };
    }
    for (i = 0; i < 64; i++) {
      if (B[i] <= 0) continue;
      var j = jumps1(B, i);
      if (j.length) { if (!caps) { caps = true; byFrom = {}; } byFrom[i] = j; }
      else if (!caps) { var s = steps1(B, i); if (s.length) byFrom[i] = s; }
    }
    return { byFrom: byFrom };
  }

  function finish(res) { // 1 win, -1 loss, 0 draw
    over = true; busy = false; pm = null; sel = -1; forced = -1;
    clearTimers();
    api.save(null);
    render();
    if (res === 1) { api.haptic('success'); api.gameOver(100 + count(1) * 5, { win: true }); }
    else if (res === -1) { api.haptic('error'); api.gameOver(10, { win: false }); }
    else api.gameOver(50, { draw: true });
  }

  function startPlayerTurn() {
    turn = 1; busy = false; sel = -1; forced = -1;
    saveState();
    if (quiet >= QUIET_LIMIT) return finish(0);
    if (!anyMoves(B, 1)) return finish(-1);
    pm = computePlayer();
    stEl.textContent = api.t('your_turn');
    render();
  }

  function playerStep(from, opt) {
    var v = B[from];
    B[from] = 0;
    var capd = opt.cap >= 0;
    if (capd) { B[opt.cap] = 0; api.haptic('light'); }
    var crowned = !isK(v) && opt.to < 8;
    B[opt.to] = crowned ? 2 : v;
    lastMv = { from: from, to: opt.to };
    quiet = (capd || crowned) ? 0 : quiet + 1;
    updScore();
    if (capd && !crowned) {
      var cont = jumps1(B, opt.to);
      if (cont.length) { // multi-jump must continue
        forced = opt.to; sel = opt.to;
        pm = { byFrom: {} };
        pm.byFrom[opt.to] = cont;
        render();
        if (cont.length === 1) later(function () {
          if (!over && turn === 1 && forced >= 0) playerStep(forced, cont[0]);
        }, 280);
        return;
      }
    }
    sel = -1; forced = -1; pm = null;
    render();
    aiTurn();
  }

  function onTap(e) {
    if (over || busy || turn !== 1 || !pm) return;
    var a = e.target.getAttribute && e.target.getAttribute('data-i');
    if (a == null) return;
    var i = +a;
    var os = sel >= 0 ? pm.byFrom[sel] : null;
    if (os) for (var k = 0; k < os.length; k++) if (os[k].to === i) { playerStep(sel, os[k]); return; }
    if (forced >= 0) return; // locked into a multi-jump
    if (B[i] > 0 && pm.byFrom[i] && pm.byFrom[i].length) { sel = sel === i ? -1 : i; render(); }
    else if (sel >= 0) { sel = -1; render(); }
  }
  bdEl.addEventListener('click', onTap);

  function aiTurn() {
    turn = -1; busy = true;
    saveState();
    if (quiet >= QUIET_LIMIT) return finish(0);
    var moves = genMoves(B, -1);
    if (!moves.length) return finish(1);
    stEl.textContent = api.t('thinking');
    render();
    var depth = api.lowEnd ? 4 : 6;
    var idx = 0, best = moves[0], bestV = -1e9, alpha = -1e9;
    function chunk() {
      var t0 = Date.now();
      while (idx < moves.length && Date.now() - t0 < 45) {
        var m = moves[idx++];
        var u = doMove(B, m);
        var v = -searchC(B, 1, depth - 1, -1e9, -alpha);
        undoMove(B, m, u);
        if (v > bestV) { bestV = v; best = m; if (v > alpha) alpha = v; }
      }
      if (idx < moves.length) later(chunk, 16);
      else playAI(best);
    }
    later(chunk, 40);
  }

  function playAI(m) {
    var step = 0, cur = m.from, capd = m.caps.length > 0, crowned = false;
    function stepFn() {
      var to = m.path[step], v = B[cur];
      B[cur] = 0;
      if (step < m.caps.length) B[m.caps[step]] = 0;
      if (!isK(v) && to >= 56) { v = v * 2; crowned = true; }
      B[to] = v;
      lastMv = { from: m.from, to: to };
      cur = to; step++;
      render();
      if (step < m.path.length) { later(stepFn, 220); return; }
      if (capd) api.haptic('light');
      quiet = (capd || crowned) ? 0 : quiet + 1;
      updScore();
      startPlayerTurn();
    }
    stepFn();
  }

  function validCell(v) { return v === 0 || v === 1 || v === 2 || v === -1 || v === -2; }

  function newGame(useSaved) {
    clearTimers();
    over = false; busy = false; sel = -1; forced = -1; pm = null; lastMv = null;
    var s = useSaved ? api.load() : null;
    var ok = s && s.b && s.b.length === 64 && (s.t === 1 || s.t === -1);
    if (ok) for (var i = 0; i < 64; i++) if (!validCell(s.b[i])) { ok = false; break; }
    if (ok) {
      B = s.b.slice();
      turn = s.t;
      quiet = Math.max(0, s.q | 0);
    } else {
      B = startBoard(); turn = 1; quiet = 0;
    }
    updScore();
    render();
    if (turn === 1) startPlayerTurn();
    else later(aiTurn, 350);
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
