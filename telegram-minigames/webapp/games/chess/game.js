/* Chess — full legal chess vs AI (negamax + alpha-beta, PSTs).
   Engine is standalone (0x88 board) and node-loadable for tests. */
(function () {
'use strict';

/* ========================= engine ========================= */

var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
var KN = [31, 33, 14, 18, -31, -33, -14, -18];          // knight offsets
var KG = [15, 16, 17, 1, -15, -16, -17, -1];            // king / queen dirs
var BDIR = [15, 17, -15, -17], RDIR = [16, 1, -16, -1];
var VAL = [0, 100, 320, 330, 500, 900, 0];
var MATE = 100000;

/* castling-rights mask per square: 1=WK 2=WQ 4=BK 8=BQ */
var CMASK = (function () {
  var a = new Array(128);
  for (var i = 0; i < 128; i++) a[i] = 15;
  a[0] = 13; a[7] = 14; a[4] = 12;        // a1, h1, e1
  a[112] = 7; a[119] = 11; a[116] = 3;    // a8, h8, e8
  return a;
})();

/* middlegame piece-square tables (white view, a8 first) */
var PST_P = [0,0,0,0,0,0,0,0,50,50,50,50,50,50,50,50,10,10,20,30,30,20,10,10,5,5,10,25,25,10,5,5,0,0,0,20,20,0,0,0,5,-5,-10,0,0,-10,-5,5,5,10,10,-20,-20,10,10,5,0,0,0,0,0,0,0,0];
var PST_N = [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,0,0,0,0,-20,-40,-30,0,10,15,15,10,0,-30,-30,5,15,20,20,15,5,-30,-30,0,15,20,20,15,0,-30,-30,5,10,15,15,10,5,-30,-40,-20,0,5,5,0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50];
var PST_B = [-20,-10,-10,-10,-10,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,10,10,5,0,-10,-10,5,5,10,10,5,5,-10,-10,0,10,10,10,10,0,-10,-10,10,10,10,10,10,10,-10,-10,5,0,0,0,0,5,-10,-20,-10,-10,-10,-10,-10,-10,-20];
var PST_R = [0,0,0,0,0,0,0,0,5,10,10,10,10,10,10,5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,-5,0,0,0,0,0,0,-5,0,0,0,5,5,0,0,0];
var PST_Q = [-20,-10,-10,-5,-5,-10,-10,-20,-10,0,0,0,0,0,0,-10,-10,0,5,5,5,5,0,-10,-5,0,5,5,5,5,0,-5,0,0,5,5,5,5,0,-5,-10,5,5,5,5,5,0,-10,-10,0,5,0,0,0,0,-10,-20,-10,-10,-5,-5,-10,-10,-20];
var PST_K = [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10,20,20,0,0,0,0,20,20,20,30,10,0,0,10,30,20];
var PST = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, PST_K];

/* state: b = Int8Array(128) 0x88 board (a1=0, +16 per rank),
   t = 1 white / -1 black, c = castling bits, ep = ep square or -1,
   hm = halfmove clock, fm = fullmove number, wk/bk = king squares */
function newState() {
  var b = new Int8Array(128);
  var back = [R, N, B, Q, K, B, N, R];
  for (var f = 0; f < 8; f++) {
    b[f] = back[f]; b[16 + f] = P;
    b[112 + f] = -back[f]; b[96 + f] = -P;
  }
  return { b: b, t: 1, c: 15, ep: -1, hm: 0, fm: 1, wk: 4, bk: 116 };
}

/* is `sq` attacked by side `by` (1|-1)? */
function attacked(S, sq, by) {
  var b = S.b, i, t, d, p;
  if (by > 0) {
    t = sq - 15; if (!(t & 0x88) && b[t] === P) return true;
    t = sq - 17; if (!(t & 0x88) && b[t] === P) return true;
  } else {
    t = sq + 15; if (!(t & 0x88) && b[t] === -P) return true;
    t = sq + 17; if (!(t & 0x88) && b[t] === -P) return true;
  }
  for (i = 0; i < 8; i++) {
    t = sq + KN[i]; if (!(t & 0x88) && b[t] === N * by) return true;
    t = sq + KG[i]; if (!(t & 0x88) && b[t] === K * by) return true;
  }
  for (i = 0; i < 4; i++) {
    d = BDIR[i]; t = sq + d;
    while (!(t & 0x88)) { p = b[t]; if (p) { if (p === B * by || p === Q * by) return true; break; } t += d; }
    d = RDIR[i]; t = sq + d;
    while (!(t & 0x88)) { p = b[t]; if (p) { if (p === R * by || p === Q * by) return true; break; } t += d; }
  }
  return false;
}

function mvsc(cap, a) { return cap ? 1000 + 10 * VAL[cap < 0 ? -cap : cap] - VAL[a] : 0; } // MVV-LVA

function pushPawn(mv, from, to, p, cap, flag, t) {
  var r = to >> 4, promo = 0, s = mvsc(cap, P);
  if ((t > 0 && r === 7) || (t < 0 && r === 0)) { promo = Q * t; s += 800; }
  mv.push({ from: from, to: to, piece: p, cap: cap, flag: flag, promo: promo, s: s });
}

/* pseudo-legal move list. flag: 0 normal, 1 double push, 2 en passant, 3 O-O, 4 O-O-O */
function genMoves(S) {
  var b = S.b, t = S.t, mv = [], sq, p, a, i, to, q, d;
  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p || p * t < 0) continue;
    a = p * t;
    if (a === P) {
      to = sq + 16 * t;
      if (!(to & 0x88) && !b[to]) {
        pushPawn(mv, sq, to, p, 0, 0, t);
        var r0 = sq >> 4;
        if ((t > 0 && r0 === 1) || (t < 0 && r0 === 6)) {
          var to2 = to + 16 * t;
          if (!b[to2]) mv.push({ from: sq, to: to2, piece: p, cap: 0, flag: 1, promo: 0, s: 0 });
        }
      }
      for (i = 0; i < 2; i++) {
        to = sq + (i ? 17 : 15) * t;
        if (to & 0x88) continue;
        q = b[to];
        if (q && q * t < 0) pushPawn(mv, sq, to, p, q, 0, t);
        else if (!q && to === S.ep && S.ep >= 0)
          mv.push({ from: sq, to: to, piece: p, cap: -t * P, flag: 2, promo: 0, s: mvsc(P, P) });
      }
    } else if (a === N || a === K) {
      var offs = (a === N) ? KN : KG;
      for (i = 0; i < 8; i++) {
        to = sq + offs[i];
        if (to & 0x88) continue;
        q = b[to];
        if (!q || q * t < 0) mv.push({ from: sq, to: to, piece: p, cap: q, flag: 0, promo: 0, s: mvsc(q, a) });
      }
      if (a === K) {
        if (t > 0) {
          if ((S.c & 1) && !b[5] && !b[6] && !attacked(S, 4, -1) && !attacked(S, 5, -1) && !attacked(S, 6, -1))
            mv.push({ from: 4, to: 6, piece: p, cap: 0, flag: 3, promo: 0, s: 0 });
          if ((S.c & 2) && !b[3] && !b[2] && !b[1] && !attacked(S, 4, -1) && !attacked(S, 3, -1) && !attacked(S, 2, -1))
            mv.push({ from: 4, to: 2, piece: p, cap: 0, flag: 4, promo: 0, s: 0 });
        } else {
          if ((S.c & 4) && !b[117] && !b[118] && !attacked(S, 116, 1) && !attacked(S, 117, 1) && !attacked(S, 118, 1))
            mv.push({ from: 116, to: 118, piece: p, cap: 0, flag: 3, promo: 0, s: 0 });
          if ((S.c & 8) && !b[115] && !b[114] && !b[113] && !attacked(S, 116, 1) && !attacked(S, 115, 1) && !attacked(S, 114, 1))
            mv.push({ from: 116, to: 114, piece: p, cap: 0, flag: 4, promo: 0, s: 0 });
        }
      }
    } else {
      var dirs = (a === B) ? BDIR : (a === R) ? RDIR : KG;
      for (i = 0; i < dirs.length; i++) {
        d = dirs[i]; to = sq + d;
        while (!(to & 0x88)) {
          q = b[to];
          if (!q) mv.push({ from: sq, to: to, piece: p, cap: 0, flag: 0, promo: 0, s: 0 });
          else {
            if (q * t < 0) mv.push({ from: sq, to: to, piece: p, cap: q, flag: 0, promo: 0, s: mvsc(q, a) });
            break;
          }
          to += d;
        }
      }
    }
  }
  return mv;
}

function makeMove(S, m) {
  var b = S.b, t = S.t;
  var u = { c: S.c, ep: S.ep, hm: S.hm };
  b[m.from] = 0;
  b[m.to] = m.promo || m.piece;
  S.ep = -1;
  S.hm++;
  if (m.cap) S.hm = 0;
  var a = m.piece * t;
  if (a === P) {
    S.hm = 0;
    if (m.flag === 1) S.ep = m.to - 16 * t;
    else if (m.flag === 2) b[m.to - 16 * t] = 0;
  } else if (a === K) {
    if (t > 0) S.wk = m.to; else S.bk = m.to;
    if (m.flag === 3) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = 0; }
    else if (m.flag === 4) { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = 0; }
  }
  S.c &= CMASK[m.from] & CMASK[m.to];
  S.t = -t;
  if (t < 0) S.fm++;
  return u;
}

function unmakeMove(S, m, u) {
  var b = S.b;
  S.t = -S.t;
  var t = S.t;
  if (t < 0) S.fm--;
  S.c = u.c; S.ep = u.ep; S.hm = u.hm;
  b[m.from] = m.piece;
  b[m.to] = 0;
  if (m.flag === 2) b[m.to - 16 * t] = -t * P;
  else if (m.cap) b[m.to] = m.cap;
  if (m.piece * t === K) {
    if (t > 0) S.wk = m.from; else S.bk = m.from;
    if (m.flag === 3) { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = 0; }
    else if (m.flag === 4) { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = 0; }
  }
}

/* after makeMove: was the MOVER's king left in check? */
function leftInCheck(S) {
  return attacked(S, S.t < 0 ? S.wk : S.bk, S.t);
}

function inCheck(S) {
  return attacked(S, S.t > 0 ? S.wk : S.bk, -S.t);
}

function legalMoves(S) {
  var ms = genMoves(S), out = [], i, u;
  for (i = 0; i < ms.length; i++) {
    u = makeMove(S, ms[i]);
    if (!leftInCheck(S)) out.push(ms[i]);
    unmakeMove(S, ms[i], u);
  }
  return out;
}

function perft(S, d) {
  if (d === 0) return 1;
  var ms = genMoves(S), n = 0, i, u;
  for (i = 0; i < ms.length; i++) {
    u = makeMove(S, ms[i]);
    if (!leftInCheck(S)) n += perft(S, d - 1);
    unmakeMove(S, ms[i], u);
  }
  return n;
}

/* white-positive evaluation: material + PST */
function evalBoard(S) {
  var b = S.b, sc = 0, sq, p, a, f, r;
  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p) continue;
    f = sq & 7; r = sq >> 4;
    if (p > 0) sc += VAL[p] + PST[p][((7 - r) << 3) + f];
    else { a = -p; sc -= VAL[a] + PST[a][(r << 3) + f]; }
  }
  return sc;
}

function bySc(a, b) { return b.s - a.s; }

function negamax(S, depth, alpha, beta, ply, ctx) {
  if (++ctx.nodes > ctx.cap) { ctx.abort = true; return 0; }
  if (depth <= 0) return S.t * evalBoard(S);
  if (S.hm >= 100) return 0;
  var ms = genMoves(S).sort(bySc);
  var any = 0, i, m, u, v;
  for (i = 0; i < ms.length; i++) {
    m = ms[i];
    u = makeMove(S, m);
    if (leftInCheck(S)) { unmakeMove(S, m, u); continue; }
    any = 1;
    v = -negamax(S, depth - 1, -beta, -alpha, ply + 1, ctx);
    unmakeMove(S, m, u);
    if (ctx.abort) return alpha;
    if (v > alpha) { alpha = v; if (alpha >= beta) return alpha; }
  }
  if (!any) return inCheck(S) ? -(MATE - ply) : 0;
  return alpha;
}

function insufficient(S) {
  var b = S.b, sq, p, a;
  var wm = 0, bm = 0, wb = -1, bb = -1; // minor counts, bishop square colors
  for (sq = 0; sq < 120; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p) continue;
    a = p < 0 ? -p : p;
    if (a === K) continue;
    if (a === P || a === R || a === Q) return false;
    if (p > 0) { wm++; if (a === B) wb = ((sq >> 4) + (sq & 7)) & 1; }
    else { bm++; if (a === B) bb = ((sq >> 4) + (sq & 7)) & 1; }
    if (wm > 1 || bm > 1) return false;
  }
  if (wm + bm <= 1) return true;                 // K vs K, K+minor vs K
  return wb >= 0 && bb >= 0 && wb === bb;        // KB vs KB, same color
}

var Engine = {
  newState: newState, genMoves: genMoves, legalMoves: legalMoves,
  makeMove: makeMove, unmakeMove: unmakeMove, attacked: attacked,
  inCheck: inCheck, perft: perft, evalBoard: evalBoard,
  negamax: negamax, insufficient: insufficient
};
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;

/* ========================= game UI ========================= */

if (typeof MG !== 'undefined') {
MG.register('chess', function (container, api) {
  var C = api.colors;
  var RU = api.lang === 'ru';
  var WGLYPH = ['', '♙', '♘', '♗', '♖', '♕', '♔'];
  var BGLYPH = ['', '♟', '♞', '♝', '♜', '♛', '♚'];

  /* --- colors (derived shades of theme colors only) --- */
  function hex(c) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgb(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
  function clampCh(x) { return x < 0 ? 0 : x > 255 ? 255 : x | 0; }
  function shift(a, d) { return [clampCh(a[0] + d), clampCh(a[1] + d), clampCh(a[2] + d)]; }
  function blend(a, b, t) {
    return [clampCh(a[0] + (b[0] - a[0]) * t), clampCh(a[1] + (b[1] - a[1]) * t), clampCh(a[2] + (b[2] - a[2]) * t)];
  }
  var pa = hex(C.panel), pb = hex(C.panel2);
  var baseA = (pa && pb) ? blend(pa, pb, 0.5) : (pa || pb || [70, 74, 84]);
  var LT = shift(baseA, 20), DK = shift(baseA, -18);
  var ACC = hex(C.accent) || shift(baseA, 60);
  var BAD = hex(C.bad) || ACC;

  /* --- state --- */
  var S = newState();
  var sel = -1, selMoves = [], lastMove = null;
  var thinking = false, gameEnded = false, paused = false;
  var aiCtx = null, aiTimer = 0, endTimer = 0, startTimer = 0;

  /* --- DOM --- */
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;padding:8px;box-sizing:border-box;overflow:hidden;';

  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;max-width:560px;padding:2px 4px 8px;box-sizing:border-box;';
  var statusEl = document.createElement('div');
  statusEl.style.cssText = 'flex:1;font-size:15px;font-weight:600;color:' + C.text + ';min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  var moveEl = document.createElement('div');
  moveEl.style.cssText = 'font-size:13px;color:' + C.muted + ';flex-shrink:0;';
  var btn = document.createElement('button');
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  btn.style.cssText = 'flex-shrink:0;border:0;border-radius:8px;padding:4px 12px;font-size:18px;line-height:1.2;cursor:pointer;background:' + C.panel2 + ';color:' + C.text + ';';
  bar.appendChild(statusEl); bar.appendChild(moveEl); bar.appendChild(btn);
  root.appendChild(bar);

  var wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;';
  root.appendChild(wrap);

  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.25);touch-action:manipulation;';
  wrap.appendChild(boardEl);
  container.appendChild(root);

  /* squares: display index 0..63, row 0 = rank 8 (White at bottom) */
  var cells = [];
  (function build() {
    for (var i = 0; i < 64; i++) {
      var d = document.createElement('div');
      d.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none;cursor:pointer;';
      var span = document.createElement('span');
      span.style.cssText = 'position:relative;z-index:1;line-height:1;pointer-events:none;';
      var mark = document.createElement('div');
      mark.style.cssText = 'position:absolute;border-radius:50%;pointer-events:none;display:none;box-sizing:border-box;';
      d.appendChild(mark); d.appendChild(span);
      boardEl.appendChild(d);
      cells.push({ el: d, span: span, mark: mark });
    }
  })();

  function idx2sq(i) { return (7 - (i >> 3)) * 16 + (i & 7); }

  function sizeBoard() {
    var w = wrap.clientWidth || container.clientWidth || 320;
    var h = wrap.clientHeight || 320;
    var s = Math.min(w, h) - 4;
    if (s < 160) s = 160;
    s = Math.floor(s / 8) * 8;
    boardEl.style.width = s + 'px';
    boardEl.style.height = s + 'px';
    boardEl.style.fontSize = Math.floor((s / 8) * 0.74) + 'px';
  }
  function onResize() { sizeBoard(); }
  window.addEventListener('resize', onResize);

  /* --- persistence --- */
  var LETTERS = ' PNBRQK', lets = ' pnbrqk';
  function saveGame() {
    var s = '', r, f, p;
    for (r = 0; r < 8; r++) for (f = 0; f < 8; f++) {
      p = S.b[r * 16 + f];
      s += p === 0 ? '.' : p > 0 ? LETTERS[p] : lets[-p];
    }
    api.save({ v: 1, b: s, t: S.t, c: S.c, ep: S.ep, hm: S.hm, fm: S.fm, lm: lastMove });
  }
  function loadGame() {
    var sv = api.load();
    if (!sv || sv.v !== 1 || typeof sv.b !== 'string' || sv.b.length !== 64) return false;
    var st = newState();
    st.b.fill(0);
    st.wk = -1; st.bk = -1;
    for (var i = 0; i < 64; i++) {
      var ch = sv.b[i], sq = (i / 8 | 0) * 16 + (i % 8);
      var wi = LETTERS.indexOf(ch), bi = lets.indexOf(ch);
      if (wi > 0) { st.b[sq] = wi; if (wi === K) st.wk = sq; }
      else if (bi > 0) { st.b[sq] = -bi; if (bi === K) st.bk = sq; }
    }
    if (st.wk < 0 || st.bk < 0) return false;
    st.t = sv.t === -1 ? -1 : 1;
    st.c = sv.c & 15;
    st.ep = (typeof sv.ep === 'number' && sv.ep >= 0 && sv.ep < 128 && !(sv.ep & 0x88)) ? sv.ep : -1;
    st.hm = sv.hm | 0; st.fm = Math.max(1, sv.fm | 0);
    S = st;
    lastMove = (sv.lm && sv.lm.length === 2) ? sv.lm : null;
    return true;
  }

  /* --- rendering --- */
  function setStatus() {
    var txt;
    if (gameEnded) txt = api.t('game_over');
    else if (thinking) txt = api.t('thinking') + '…';
    else txt = api.t('your_turn');
    if (!gameEnded && inCheck(S)) txt += ' · ' + (RU ? 'Шах!' : 'Check!');
    statusEl.textContent = txt;
    moveEl.textContent = api.t('moves') + ': ' + S.fm;
  }

  function render() {
    var chkSq = inCheck(S) ? (S.t > 0 ? S.wk : S.bk) : -1;
    var tgt = {};
    for (var j = 0; j < selMoves.length; j++) tgt[selMoves[j].to] = selMoves[j].cap ? 2 : 1;
    for (var i = 0; i < 64; i++) {
      var sq = idx2sq(i), c = cells[i], p = S.b[sq];
      var base = (((sq >> 4) + (sq & 7)) & 1) ? LT : DK;
      var bg = base;
      if (lastMove && (sq === lastMove[0] || sq === lastMove[1])) bg = blend(base, ACC, 0.3);
      if (sq === sel) bg = blend(base, ACC, 0.5);
      if (sq === chkSq) bg = blend(base, BAD, 0.55);
      c.el.style.background = rgb(bg);
      // Filled glyphs for both sides, differentiated by color (like chess.com) —
      // outline glyphs read poorly on small screens.
      c.span.textContent = p === 0 ? '' : BGLYPH[Math.abs(p)];
      if (p > 0) {
        c.span.style.color = '#f4f4f4';
        c.span.style.textShadow = '0 0 2px rgba(0,0,0,.9), 0 1px 1px rgba(0,0,0,.6)';
      } else {
        c.span.style.color = '#1a1a1a';
        c.span.style.textShadow = '0 0 2px rgba(255,255,255,.75), 0 1px 1px rgba(255,255,255,.4)';
      }
      var m = tgt[sq];
      if (m === 1) {
        m = c.mark;
        m.style.display = 'block';
        m.style.width = '26%'; m.style.height = '26%';
        m.style.border = 'none';
        m.style.background = 'rgba(' + ACC[0] + ',' + ACC[1] + ',' + ACC[2] + ',0.65)';
      } else if (m === 2) {
        m = c.mark;
        m.style.display = 'block';
        m.style.width = '86%'; m.style.height = '86%';
        m.style.background = 'none';
        m.style.border = '3px solid rgba(' + ACC[0] + ',' + ACC[1] + ',' + ACC[2] + ',0.85)';
      } else c.mark.style.display = 'none';
    }
    setStatus();
  }

  /* --- game end --- */
  function finishGame(kind) {
    gameEnded = true;
    thinking = false;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = 0; }
    aiCtx = null;
    api.save(null);
    render();
    var fm = S.fm;
    if (endTimer) clearTimeout(endTimer);
    if (kind === 'win') {
      api.haptic('success');
      endTimer = setTimeout(function () { api.gameOver(100 + Math.max(0, 60 - fm), { win: true }); }, 450);
    } else if (kind === 'loss') {
      api.haptic('error');
      endTimer = setTimeout(function () { api.gameOver(10, { win: false }); }, 450);
    } else {
      api.haptic('light');
      endTimer = setTimeout(function () { api.gameOver(50, { draw: true }); }, 450);
    }
  }

  /* returns true if the game just ended (side to move = S.t) */
  function checkEnd() {
    if (!legalMoves(S).length) {
      if (inCheck(S)) finishGame(S.t < 0 ? 'win' : 'loss');
      else finishGame('draw');
      return true;
    }
    if (S.hm >= 100 || insufficient(S)) { finishGame('draw'); return true; }
    return false;
  }

  /* --- AI (Black) --- */
  function startAI() {
    thinking = true;
    render();
    aiCtx = {
      moves: legalMoves(S).sort(bySc),
      i: 0, alpha: -Infinity, best: null,
      nodes: 0, cap: 150000, abort: false,
      depth: api.lowEnd ? 2 : 3
    };
    aiTimer = setTimeout(aiStep, 30);
  }

  function aiStep() {
    aiTimer = 0;
    if (paused || gameEnded || !aiCtx) return;
    var ctx = aiCtx, t0 = Date.now();
    while (ctx.i < ctx.moves.length && !ctx.abort && Date.now() - t0 < 40) {
      var m = ctx.moves[ctx.i];
      var u = makeMove(S, m);
      var v = -negamax(S, ctx.depth - 1, -Infinity, ctx.alpha === -Infinity ? Infinity : -ctx.alpha, 1, ctx);
      unmakeMove(S, m, u);
      if (ctx.abort) { if (!ctx.best) ctx.best = m; break; }
      if (!ctx.best || v > ctx.alpha) { ctx.alpha = v; ctx.best = m; }
      ctx.i++;
    }
    if (ctx.i >= ctx.moves.length || ctx.abort) aiFinish();
    else aiTimer = setTimeout(aiStep, 16);
  }

  function aiFinish() {
    if (!aiCtx) return;
    var m = aiCtx.best || aiCtx.moves[0];
    aiCtx = null;
    thinking = false;
    if (!m) { checkEnd(); return; }
    makeMove(S, m);
    lastMove = [m.from, m.to];
    if (m.cap) api.haptic('light');
    render();
    if (!checkEnd()) saveGame();
  }

  /* --- input --- */
  function onTap(sq) {
    if (gameEnded || thinking || S.t < 0 || paused) return;
    if (sel >= 0) {
      for (var i = 0; i < selMoves.length; i++) {
        if (selMoves[i].to === sq) { playerMove(selMoves[i]); return; }
      }
    }
    var p = S.b[sq];
    if (p > 0) {
      sel = sq;
      selMoves = legalMoves(S).filter(function (m) { return m.from === sq; });
    } else {
      sel = -1; selMoves = [];
    }
    render();
  }

  function playerMove(m) {
    makeMove(S, m);
    lastMove = [m.from, m.to];
    sel = -1; selMoves = [];
    api.haptic('light');
    render();
    if (!checkEnd()) {
      saveGame();
      startAI();
    }
  }

  function onBoardClick(e) {
    var r = boardEl.getBoundingClientRect();
    if (!r.width) return;
    var f = Math.floor((e.clientX - r.left) / (r.width / 8));
    var rk = 7 - Math.floor((e.clientY - r.top) / (r.height / 8));
    if (f < 0 || f > 7 || rk < 0 || rk > 7) return;
    onTap(rk * 16 + f);
  }
  boardEl.addEventListener('click', onBoardClick);

  function newGame() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = 0; }
    if (endTimer) { clearTimeout(endTimer); endTimer = 0; }
    aiCtx = null;
    thinking = false; gameEnded = false;
    S = newState();
    sel = -1; selMoves = []; lastMove = null;
    api.haptic('light');
    saveGame();
    render();
  }
  btn.addEventListener('click', newGame);

  /* --- init --- */
  var resumed = loadGame();
  if (!resumed) S = newState();
  sizeBoard();
  render();
  startTimer = setTimeout(function () {
    startTimer = 0;
    sizeBoard();
    render();
    if (!gameEnded && !checkEnd() && S.t < 0) startAI();
  }, 50);

  return {
    destroy: function () {
      if (aiTimer) clearTimeout(aiTimer);
      if (endTimer) clearTimeout(endTimer);
      if (startTimer) clearTimeout(startTimer);
      aiCtx = null;
      window.removeEventListener('resize', onResize);
      boardEl.removeEventListener('click', onBoardClick);
    },
    pause: function () {
      paused = true;
      if (aiTimer) { clearTimeout(aiTimer); aiTimer = 0; }
    },
    resume: function () {
      paused = false;
      sizeBoard();
      if (thinking && aiCtx && !aiTimer && !gameEnded) aiTimer = setTimeout(aiStep, 30);
    }
  };
});
}

})();
