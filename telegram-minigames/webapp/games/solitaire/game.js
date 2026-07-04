/* Klondike Solitaire (draw-1, unlimited passes) — MG platform flagship card game. */
(function () {
'use strict';

/* ================= Rules module (pure, node-testable) =================
   Card = int 0..51. suit = c/13 |0 (0♠ 1♥ 2♦ 3♣), rank = c%13 (0=A .. 12=K).
   State: { s:[stock], w:[waste], f:[[],[],[],[]] (per suit), t:[{c:[cards], d:faceDownCount} x7] }
   Moves: {k:'D'} draw  {k:'R'} recycle  {k:'WF'} {k:'WT',to} {k:'TF',from}
          {k:'TT',from,idx,to}  {k:'FT',from,to}                               */
var R = (function () {
  function suitOf(c) { return (c / 13) | 0; }
  function rankOf(c) { return c % 13; }
  function isRed(c) { var s = suitOf(c); return s === 1 || s === 2; }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function deal(seed) {
    var cards = [], i, j, tmp;
    for (i = 0; i < 52; i++) cards.push(i);
    var rnd = mulberry(seed);
    for (i = 51; i > 0; i--) { j = (rnd() * (i + 1)) | 0; tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp; }
    var st = { s: [], w: [], f: [[], [], [], []], t: [] }, k = 0;
    for (i = 0; i < 7; i++) { st.t.push({ c: cards.slice(k, k + i + 1), d: i }); k += i + 1; }
    st.s = cards.slice(k);
    return st;
  }
  function topOf(a) { return a[a.length - 1]; }
  function canTab(c, pile) {
    if (!pile.length) return rankOf(c) === 12;
    var t = topOf(pile);
    return isRed(c) !== isRed(t) && rankOf(c) === rankOf(t) - 1;
  }
  function canF(st, c) { return st.f[suitOf(c)].length === rankOf(c); }
  function legal(st, mv) {
    if (!mv) return false;
    var a, b;
    switch (mv.k) {
      case 'D': return st.s.length > 0;
      case 'R': return st.s.length === 0 && st.w.length > 0;
      case 'WF': return st.w.length > 0 && canF(st, topOf(st.w));
      case 'WT': return st.w.length > 0 && mv.to >= 0 && mv.to < 7 && canTab(topOf(st.w), st.t[mv.to].c);
      case 'TF': a = st.t[mv.from]; return !!a && a.c.length > a.d && canF(st, topOf(a.c));
      case 'TT':
        a = st.t[mv.from]; b = st.t[mv.to];
        return !!a && !!b && mv.from !== mv.to && mv.idx >= a.d && mv.idx < a.c.length && canTab(a.c[mv.idx], b.c);
      case 'FT':
        a = st.f[mv.from];
        return !!a && a.length > 0 && mv.to >= 0 && mv.to < 7 && canTab(topOf(a), st.t[mv.to].c);
    }
    return false;
  }
  function fixFlip(p) {
    if (p.c.length === 0) { p.d = 0; return false; }
    if (p.d >= p.c.length) { p.d = p.c.length - 1; return true; }
    return false;
  }
  /* mutates st; returns true if a face-down card was flipped */
  function apply(st, mv) {
    var p, c, fl = false;
    switch (mv.k) {
      case 'D': st.w.push(st.s.pop()); break;
      case 'R': while (st.w.length) st.s.push(st.w.pop()); break;
      case 'WF': c = st.w.pop(); st.f[suitOf(c)].push(c); break;
      case 'WT': st.t[mv.to].c.push(st.w.pop()); break;
      case 'TF': p = st.t[mv.from]; c = p.c.pop(); st.f[suitOf(c)].push(c); fl = fixFlip(p); break;
      case 'TT':
        p = st.t[mv.from];
        st.t[mv.to].c = st.t[mv.to].c.concat(p.c.splice(mv.idx));
        fl = fixFlip(p);
        break;
      case 'FT': st.t[mv.to].c.push(st.f[mv.from].pop()); break;
    }
    return fl;
  }
  /* smart tap: foundation first, then best tableau move. loc: {w:1}|{t:col,i:idx}|{f:pile} */
  function bestMove(st, loc) {
    var i, c, mv, pick = -1, empty = -1, p;
    if (!loc) return null;
    if (loc.w) {
      if (!st.w.length) return null;
      mv = { k: 'WF' };
      if (legal(st, mv)) return mv;
      c = topOf(st.w);
      for (i = 0; i < 7; i++) {
        if (canTab(c, st.t[i].c)) { if (st.t[i].c.length) { if (pick < 0) pick = i; } else if (empty < 0) empty = i; }
      }
      if (pick >= 0) return { k: 'WT', to: pick };
      if (empty >= 0) return { k: 'WT', to: empty };
      return null;
    }
    if (loc.t != null) {
      p = st.t[loc.t];
      if (loc.i < p.d || loc.i >= p.c.length) return null;
      if (loc.i === p.c.length - 1) {
        mv = { k: 'TF', from: loc.t };
        if (legal(st, mv)) return mv;
      }
      c = p.c[loc.i];
      for (i = 0; i < 7; i++) {
        if (i === loc.t) continue;
        if (canTab(c, st.t[i].c)) { if (st.t[i].c.length) { if (pick < 0) pick = i; } else if (empty < 0) empty = i; }
      }
      if (pick >= 0) return { k: 'TT', from: loc.t, idx: loc.i, to: pick };
      /* skip pointless king shuffle: whole clean column -> another empty column */
      if (empty >= 0 && !(rankOf(c) === 12 && loc.i === 0 && p.d === 0))
        return { k: 'TT', from: loc.t, idx: loc.i, to: empty };
      return null;
    }
    return null;
  }
  function isWon(st) { return st.f[0].length + st.f[1].length + st.f[2].length + st.f[3].length === 52; }
  function allUp(st) { for (var i = 0; i < 7; i++) if (st.t[i].d > 0) return false; return true; }
  function clone(st) {
    return {
      s: st.s.slice(), w: st.w.slice(),
      f: st.f.map(function (x) { return x.slice(); }),
      t: st.t.map(function (p) { return { c: p.c.slice(), d: p.d }; })
    };
  }
  return {
    deal: deal, canTab: canTab, canF: canF, legal: legal, apply: apply,
    bestMove: bestMove, isWon: isWon, allUp: allUp, clone: clone,
    suitOf: suitOf, rankOf: rankOf, isRed: isRed
  };
})();

/* node test hook */
if (typeof module !== 'undefined' && module.exports) { module.exports = R; }
if (typeof MG === 'undefined' || !MG || !MG.register) return;

/* ================================ UI ================================ */
MG.register('solitaire', function (container, api) {
  var C = api.colors, LOW = !!api.lowEnd, RU = api.lang === 'ru';
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var DUR = LOW ? 110 : 180;
  var hudH = 44;

  var st = null, score = 0, moves = 0, elapsed = 0, recycles = 0;
  var undoStack = [], won = false, autoBusy = false, paused = false;
  var timers = [], tick = 0, raf = 0, drag = null;
  var cardEls = [], prev = [], P = [], pulsed = [];
  var W = 0, H = 0, BH = 0, cw = 0, ch = 0, gap = 4, topY = 6, tabY = 80, slotXs = [];

  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timers.indexOf(id);
      if (k >= 0) timers.splice(k, 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function txt(ru, en) { return RU ? ru : en; }
  function fmt(t) { var m = (t / 60) | 0, s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  /* ------------------------------ DOM ------------------------------ */
  container.style.overflow = 'hidden';
  container.style.background = 'radial-gradient(130% 100% at 50% 18%, ' + C.panel + ' 0%, ' + C.bg + ' 78%)';

  var style = document.createElement('style');
  style.textContent =
    '.sol-card{position:absolute;left:0;top:0;box-sizing:border-box;overflow:hidden;' +
    'border:1px solid rgba(0,0,0,.28);box-shadow:0 1px 2px rgba(0,0,0,.35);' +
    'transition:transform ' + DUR + 'ms cubic-bezier(.25,.8,.35,1);will-change:transform;' +
    '-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;cursor:pointer}' +
    '.sol-fast{transition-duration:' + ((DUR / 2) | 0) + 'ms}' +
    '.sol-nt,.sol-ntall .sol-card{transition:none!important}' +
    '.sol-drag{box-shadow:0 10px 22px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.4)!important}' +
    '.sol-cor{position:absolute;top:2%;left:6%;line-height:1.05;font-weight:700;text-align:center}' +
    '.sol-r2{top:auto;left:auto;right:6%;bottom:2%;transform:rotate(180deg)}' +
    '.sol-cen{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-size:2.2em;opacity:.92}' +
    '.sol-slot{position:absolute;box-sizing:border-box;opacity:.55;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;pointer-events:none;z-index:0}' +
    '@keyframes solPulse{0%,100%{box-shadow:0 1px 2px rgba(0,0,0,.35)}' +
    '50%{box-shadow:0 0 0 3px rgba(255,204,77,.95),0 0 16px 4px rgba(255,204,77,.6)}}' +
    '.sol-pulse{animation:solPulse 1.1s ease-in-out infinite}';
  container.appendChild(style);

  var hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:0;top:0;right:0;height:' + hudH + 'px;display:flex;' +
    'align-items:center;gap:6px;padding:0 8px;box-sizing:border-box;z-index:1500;' +
    'color:' + C.text + ';font:600 13px/1.2 sans-serif';
  var info = document.createElement('div');
  info.style.cssText = 'flex:1;display:flex;gap:10px;min-width:0;white-space:nowrap;overflow:hidden;color:' + C.muted;
  var tEl = document.createElement('span'); tEl.style.color = C.text;
  var mEl = document.createElement('span');
  info.appendChild(tEl); info.appendChild(mEl);
  hud.appendChild(info);
  function mkBtn(label) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'border:0;border-radius:9px;padding:7px 10px;background:' + C.panel2 +
      ';color:' + C.text + ';font:700 12px sans-serif;cursor:pointer;-webkit-tap-highlight-color:transparent';
    hud.appendChild(b);
    return b;
  }
  var undoBtn = mkBtn('↶ 0');
  var autoBtn = mkBtn(txt('Авто', 'Auto'));
  var dealBtn = mkBtn(api.t('restart'));
  container.appendChild(hud);

  var board = document.createElement('div');
  board.style.cssText = 'position:absolute;left:0;top:' + hudH + 'px;right:0;bottom:0;overflow:hidden;touch-action:none';
  container.appendChild(board);

  function mkSlot() {
    var d = document.createElement('div');
    d.className = 'sol-slot';
    d.style.border = '1.5px dashed ' + C.muted;
    board.appendChild(d);
    return d;
  }
  var stockSlot = mkSlot(), wasteSlot = mkSlot(), fSlots = [], tSlots = [], i;
  var stockIcon = document.createElement('div');
  stockIcon.textContent = '↻';
  stockIcon.style.color = C.muted;
  var passEl = document.createElement('div');
  passEl.style.cssText = 'color:' + C.muted + ';font:600 10px sans-serif';
  stockSlot.appendChild(stockIcon); stockSlot.appendChild(passEl);
  for (i = 0; i < 4; i++) {
    fSlots.push(mkSlot());
    fSlots[i].textContent = SUITS[i];
    fSlots[i].style.color = C.muted;
  }
  for (i = 0; i < 7; i++) tSlots.push(mkSlot());

  for (i = 0; i < 52; i++) {
    var el = document.createElement('div');
    el.className = 'sol-card sol-nt';
    el.setAttribute('data-c', i);
    board.appendChild(el);
    cardEls.push(el); prev.push(null); P.push(null);
  }

  var BACK = null;
  function setFace(el2, c, up) {
    if (up) {
      var s = R.suitOf(c), r = R.rankOf(c), sym = SUITS[s];
      el2.style.background = 'linear-gradient(160deg,#ffffff 0%,#f4f4f8 55%,#e9e9f0 100%)';
      el2.style.color = R.isRed(c) ? '#c62f3f' : '#232333';
      el2.innerHTML = '<div class="sol-cor">' + RANKS[r] + '<br>' + sym + '</div>' +
        '<div class="sol-cen">' + sym + '</div>' +
        '<div class="sol-cor sol-r2">' + RANKS[r] + '<br>' + sym + '</div>';
    } else {
      if (!BACK) BACK =
        'repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 2px,transparent 2px 7px),' +
        'repeating-linear-gradient(-45deg,rgba(255,255,255,.18) 0 2px,transparent 2px 7px),' +
        'linear-gradient(160deg,rgba(0,0,0,.05),rgba(0,0,0,.32)),' +
        'linear-gradient(' + C.accent + ',' + C.accent + ')';
      el2.style.background = BACK;
      el2.style.color = '';
      el2.innerHTML = '';
    }
  }

  /* ----------------------------- layout ----------------------------- */
  function layout() {
    W = container.clientWidth || 320;
    H = container.clientHeight || 480;
    BH = H - hudH;
    gap = Math.max(4, Math.round(W * 0.012));
    var pad = Math.max(6, Math.round(W * 0.02));
    cw = Math.min(96, Math.floor((W - pad * 2 - gap * 6) / 7));
    ch = Math.round(cw * 1.45);
    pad = Math.floor((W - (cw * 7 + gap * 6)) / 2);
    for (var j = 0; j < 7; j++) slotXs[j] = pad + j * (cw + gap);
    topY = 6;
    tabY = topY + ch + Math.max(10, Math.round(ch * 0.14));
    var rad = Math.max(4, Math.round(cw * 0.1)) + 'px';
    var fs = Math.max(9, Math.round(cw * 0.24)) + 'px';
    for (j = 0; j < 52; j++) {
      var s2 = cardEls[j].style;
      s2.width = cw + 'px'; s2.height = ch + 'px'; s2.borderRadius = rad; s2.fontSize = fs;
    }
    function slotAt(d, x, y) {
      d.style.left = x + 'px'; d.style.top = y + 'px';
      d.style.width = cw + 'px'; d.style.height = ch + 'px';
      d.style.borderRadius = rad;
    }
    slotAt(stockSlot, slotXs[0], topY);
    slotAt(wasteSlot, slotXs[1], topY);
    stockIcon.style.font = '700 ' + Math.round(cw * 0.42) + 'px sans-serif';
    for (j = 0; j < 4; j++) {
      slotAt(fSlots[j], slotXs[3 + j], topY);
      fSlots[j].style.font = '700 ' + Math.round(cw * 0.5) + 'px sans-serif';
    }
    for (j = 0; j < 7; j++) slotAt(tSlots[j], slotXs[j], tabY);
  }

  function setP(cid, x, y, z, up) { P[cid] = { x: x, y: y, z: z, up: up }; }
  function computeAll() {
    var j, k, y;
    for (j = 0; j < st.s.length; j++) setP(st.s[j], slotXs[0], topY, j + 1, false);
    for (j = 0; j < st.w.length; j++) setP(st.w[j], slotXs[1], topY, j + 1, true);
    for (j = 0; j < 4; j++) for (k = 0; k < st.f[j].length; k++) setP(st.f[j][k], slotXs[3 + j], topY, k + 1, true);
    var avail = BH - tabY - ch - 6;
    for (j = 0; j < 7; j++) {
      var p = st.t[j], n = p.c.length;
      var du = Math.max(12, Math.min(32, Math.round(ch * 0.27)));
      var dd = Math.max(4, Math.min(14, Math.round(ch * 0.13)));
      var tot = p.d * dd + Math.max(0, n - p.d - 1) * du;
      if (tot > avail && tot > 0) { var f2 = avail / tot; du *= f2; dd *= f2; }
      y = tabY;
      for (k = 0; k < n; k++) {
        setP(p.c[k], slotXs[j], Math.round(y), 40 + k, k >= p.d);
        y += k < p.d ? dd : du;
      }
    }
  }

  function flipTo(el2, cid, p, tf) {
    el2.classList.add('sol-fast');
    el2.style.transform = tf + ' scaleX(0.04)';
    later(function () {
      setFace(el2, cid, p.up);
      el2.style.transform = tf;
    }, (DUR / 2) | 0);
    later(function () { el2.classList.remove('sol-fast'); }, DUR + 20);
  }

  function render() {
    computeAll();
    for (var cid = 0; cid < 52; cid++) {
      var p = P[cid], el2 = cardEls[cid], pr = prev[cid];
      var tf = 'translate(' + p.x + 'px,' + p.y + 'px)';
      if (!pr) { setFace(el2, cid, p.up); el2.style.transform = tf; }
      else if (pr.up !== p.up) flipTo(el2, cid, p, tf);
      else el2.style.transform = tf;
      if (!pr || pr.x !== p.x || pr.y !== p.y) {
        el2.style.zIndex = 300 + p.z;
        (function (e3, z) { later(function () { e3.style.zIndex = z; }, DUR * 2 + 60); })(el2, p.z);
      } else {
        el2.style.zIndex = p.z;
      }
      prev[cid] = p;
    }
    updateHud();
    updateBtns();
    updatePulse();
  }

  function updateHud() {
    tEl.textContent = '⏱ ' + fmt(elapsed);
    mEl.textContent = api.t('moves') + ': ' + moves;
    passEl.textContent = recycles ? '×' + recycles : '';
    stockIcon.style.visibility = st.s.length ? 'hidden' : '';
  }
  function autoAvailable() {
    return !won && ((st.s.length === 0 && st.w.length === 0) || R.allUp(st));
  }
  function updateBtns() {
    undoBtn.textContent = '↶ ' + undoStack.length;
    var u = !undoStack.length || won || autoBusy;
    undoBtn.disabled = u;
    undoBtn.style.opacity = u ? '.45' : '1';
    var a = !autoAvailable() || autoBusy;
    autoBtn.disabled = a;
    autoBtn.style.opacity = a ? '.45' : '1';
  }
  function updatePulse() {
    var j;
    for (j = 0; j < pulsed.length; j++) pulsed[j].classList.remove('sol-pulse');
    pulsed.length = 0;
    if (won) return;
    var cand = [];
    if (st.w.length) cand.push(st.w[st.w.length - 1]);
    for (j = 0; j < 7; j++) { var p = st.t[j]; if (p.c.length > p.d) cand.push(p.c[p.c.length - 1]); }
    for (j = 0; j < cand.length; j++) {
      if (R.rankOf(cand[j]) === 0 && R.canF(st, cand[j])) {
        cardEls[cand[j]].classList.add('sol-pulse');
        pulsed.push(cardEls[cand[j]]);
      }
    }
  }

  /* --------------------------- game flow --------------------------- */
  function saveState() {
    if (won) return;
    api.save({ v: 1, s: st.s, w: st.w, f: st.f, t: st.t, sc: score, el: elapsed, mv: moves, rc: recycles });
  }
  function validSave(sv) {
    try {
      if (!sv || sv.v !== 1 || !sv.s || !sv.w || !sv.f || !sv.t) return false;
      if (sv.f.length !== 4 || sv.t.length !== 7) return false;
      var seen = {}, n = 0, j;
      function eat(a) {
        if (!a || !a.length && a.length !== 0) return false;
        for (var k = 0; k < a.length; k++) {
          var c = a[k];
          if (typeof c !== 'number' || c < 0 || c > 51 || c !== (c | 0) || seen[c]) return false;
          seen[c] = 1; n++;
        }
        return true;
      }
      if (!eat(sv.s) || !eat(sv.w)) return false;
      for (j = 0; j < 4; j++) if (!eat(sv.f[j])) return false;
      for (j = 0; j < 7; j++) {
        if (!sv.t[j] || !eat(sv.t[j].c)) return false;
        var d = sv.t[j].d;
        if (typeof d !== 'number' || d < 0) return false;
        if (sv.t[j].c.length ? d >= sv.t[j].c.length : d !== 0) return false;
      }
      return n === 52;
    } catch (e) { return false; }
  }
  function newDeal() {
    st = R.deal((Math.random() * 0x7fffffff) | 0);
    score = 0; moves = 0; elapsed = 0; recycles = 0;
    undoStack = []; won = false; autoBusy = false;
    for (var j = 0; j < 52; j++) cardEls[j].style.visibility = '';
    api.score(0);
    render();
    saveState();
  }

  function doMove(mv) {
    if (won || !R.legal(st, mv)) return;
    undoStack.push({ st: R.clone(st), sc: score, mv: moves, rc: recycles });
    var fl = R.apply(st, mv);
    if (mv.k === 'WF' || mv.k === 'TF') { score += 10; api.haptic('light'); }
    else if (mv.k === 'WT') score += 5;
    else if (mv.k === 'R') { score = Math.max(0, score - 20); recycles++; }
    if (fl) score += 5;
    moves++;
    api.score(score);
    render();
    saveState();
    if (R.isWon(st)) win();
  }
  function undo() {
    if (won || autoBusy || !undoStack.length) return;
    var u = undoStack.pop();
    st = u.st; score = u.sc; moves = u.mv; recycles = u.rc;
    api.score(score);
    render();
    saveState();
  }
  function stockTap() {
    if (won || autoBusy) return;
    if (st.s.length) doMove({ k: 'D' });
    else if (st.w.length) doMove({ k: 'R' });
  }
  function doTap(loc) {
    if (won || autoBusy) return;
    var mv = R.bestMove(st, loc);
    if (mv) doMove(mv);
  }

  function tryAuto() {
    if (won || autoBusy || !autoAvailable()) return;
    autoBusy = true;
    updateBtns();
    autoStep();
  }
  function autoStep() {
    var best = null, bestRank = 99, j, c;
    if (!won) {
      if (st.w.length && R.canF(st, st.w[st.w.length - 1])) {
        best = { k: 'WF' }; bestRank = R.rankOf(st.w[st.w.length - 1]);
      }
      for (j = 0; j < 7; j++) {
        var p = st.t[j];
        if (p.c.length > p.d) {
          c = p.c[p.c.length - 1];
          if (R.canF(st, c) && R.rankOf(c) < bestRank) { best = { k: 'TF', from: j }; bestRank = R.rankOf(c); }
        }
      }
    }
    if (!best) { autoBusy = false; updateBtns(); return; }
    doMove(best);
    if (won) { autoBusy = false; return; }
    later(autoStep, LOW ? 80 : 150);
  }

  function win() {
    won = true;
    autoBusy = false;
    api.haptic('success');
    api.save(null);
    updateBtns();
    if (LOW) { later(finishWin, 600); return; }
    cascade(finishWin);
  }
  function finishWin() { api.gameOver(score + 200, { win: true }); }

  /* win cascade: canvas overlay, cards launched with gravity + bounce trails */
  function cascade(cb) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cnv = document.createElement('canvas');
    cnv.width = Math.round(W * dpr); cnv.height = Math.round(BH * dpr);
    cnv.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + BH +
      'px;z-index:2000;pointer-events:none';
    board.appendChild(cnv);
    var g = cnv.getContext('2d');
    g.scale(dpr, dpr);
    var order = [], r2, s2;
    for (r2 = 12; r2 >= 0; r2--) for (s2 = 0; s2 < 4; s2++) if (st.f[s2][r2] != null) order.push(st.f[s2][r2]);
    var parts = [], spawned = 0, t0 = 0, ended = false;
    var rr = Math.max(4, cw * 0.1);
    function drawMini(p2) {
      var x = p2.x, y = p2.y;
      g.beginPath();
      g.moveTo(x + rr, y);
      g.arcTo(x + cw, y, x + cw, y + ch, rr);
      g.arcTo(x + cw, y + ch, x, y + ch, rr);
      g.arcTo(x, y + ch, x, y, rr);
      g.arcTo(x, y, x + cw, y, rr);
      g.closePath();
      g.fillStyle = '#f6f6fa';
      g.strokeStyle = 'rgba(0,0,0,.3)';
      g.fill(); g.stroke();
      g.fillStyle = R.isRed(p2.c) ? '#c62f3f' : '#232333';
      g.font = '700 ' + Math.round(cw * 0.32) + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(RANKS[R.rankOf(p2.c)] + SUITS[R.suitOf(p2.c)], x + cw / 2, y + ch / 2);
    }
    function frame(ts) {
      if (ended) return;
      raf = requestAnimationFrame(frame);
      if (!t0) t0 = ts;
      if (spawned < order.length) {
        var cid = order[spawned++];
        var su = R.suitOf(cid);
        parts.push({
          c: cid, x: slotXs[3 + su], y: topY,
          vx: (1.5 + Math.random() * 3.5) * (Math.random() < 0.5 ? -1 : 1),
          vy: -(1 + Math.random() * 5)
        });
        cardEls[cid].style.visibility = 'hidden';
      }
      for (var j = parts.length - 1; j >= 0; j--) {
        var p2 = parts[j];
        p2.vy += 0.5;
        p2.x += p2.vx; p2.y += p2.vy;
        if (p2.y > BH - ch) { p2.y = BH - ch; p2.vy *= -0.72; }
        drawMini(p2);
        if (p2.x < -cw || p2.x > W + cw) parts.splice(j, 1);
      }
      if ((spawned >= order.length && !parts.length) || ts - t0 > 6000) {
        ended = true;
        cancelAnimationFrame(raf); raf = 0;
        later(cb, 250);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------- pointer input ------------------------- */
  function boardPt(e) {
    var r = board.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function findLoc(cid) {
    var j, idx;
    if (st.s.indexOf(cid) >= 0) return { s: 1 };
    if (st.w.length && st.w[st.w.length - 1] === cid) return { w: 1 };
    for (j = 0; j < 4; j++) {
      var f = st.f[j];
      if (f.length && f[f.length - 1] === cid) return { f: j };
    }
    for (j = 0; j < 7; j++) {
      idx = st.t[j].c.indexOf(cid);
      if (idx >= 0) return idx >= st.t[j].d ? { t: j, i: idx } : null;
    }
    return null;
  }
  function grabRun(loc) {
    var ids = [];
    if (loc.w) { if (!st.w.length) return null; ids = [st.w[st.w.length - 1]]; }
    else if (loc.f != null) { var f = st.f[loc.f]; if (!f.length) return null; ids = [f[f.length - 1]]; }
    else if (loc.t != null) ids = st.t[loc.t].c.slice(loc.i);
    if (!ids.length) return null;
    var items = [];
    for (var j = 0; j < ids.length; j++) {
      var el2 = cardEls[ids[j]], p = P[ids[j]];
      el2.classList.add('sol-nt');
      el2.classList.add('sol-drag');
      el2.style.zIndex = 900 + j;
      items.push({ el: el2, cid: ids[j], bx: p.x, by: p.y });
    }
    return items;
  }
  function dropMove(d, pt) {
    var loc = d.loc, single = d.items.length === 1;
    if (pt.y < tabY - 4) {
      if (!single) return null;
      for (var j = 0; j < 4; j++) {
        if (pt.x >= slotXs[3 + j] - gap && pt.x <= slotXs[3 + j] + cw + gap) {
          if (R.suitOf(d.cid) !== j) return null;
          if (loc.w) return { k: 'WF' };
          if (loc.t != null) return { k: 'TF', from: loc.t };
          return null;
        }
      }
      return null;
    }
    var col = Math.floor((pt.x - slotXs[0] + gap / 2) / (cw + gap));
    if (col < 0 || col > 6) return null;
    if (loc.w) return { k: 'WT', to: col };
    if (loc.f != null) return { k: 'FT', from: loc.f, to: col };
    if (loc.t != null) return { k: 'TT', from: loc.t, idx: loc.i, to: col };
    return null;
  }
  function onDown(e) {
    if (won || autoBusy || drag) return;
    if (e.button != null && e.button > 0) return;
    var pt = boardPt(e);
    var t = e.target, el2 = null;
    while (t && t !== board) {
      if (t.classList && t.classList.contains('sol-card')) { el2 = t; break; }
      t = t.parentNode;
    }
    var loc = null, cid = -1;
    if (el2) { cid = +el2.getAttribute('data-c'); loc = findLoc(cid); }
    else if (pt.x >= slotXs[0] && pt.x <= slotXs[0] + cw && pt.y >= topY && pt.y <= topY + ch) loc = { s: 1 };
    if (!loc) return;
    e.preventDefault();
    drag = { loc: loc, cid: cid, sx: pt.x, sy: pt.y, started: false, items: null };
    window.addEventListener('pointermove', onPMove);
    window.addEventListener('pointerup', onPUp);
    window.addEventListener('pointercancel', onPUp);
  }
  function onPMove(e) {
    if (!drag) return;
    var pt = boardPt(e);
    var dx = pt.x - drag.sx, dy = pt.y - drag.sy;
    if (!drag.started) {
      if (drag.loc.s) return; /* stock is tap-only */
      if (dx * dx + dy * dy < 49) return;
      drag.items = grabRun(drag.loc);
      if (!drag.items) { drag = null; unbind(); return; }
      drag.started = true;
    }
    for (var j = 0; j < drag.items.length; j++) {
      var it = drag.items[j];
      it.el.style.transform = 'translate(' + (it.bx + dx) + 'px,' + (it.by + dy) + 'px)';
    }
    e.preventDefault();
  }
  function onPUp(e) {
    unbind();
    var d = drag;
    drag = null;
    if (!d) return;
    if (!d.started) {
      if (d.loc.s) stockTap();
      else doTap(d.loc);
      return;
    }
    var pt = boardPt(e);
    var mv = dropMove(d, pt);
    for (var j = 0; j < d.items.length; j++) {
      var el3 = d.items[j].el;
      el3.classList.remove('sol-nt');
      (function (e4) { later(function () { e4.classList.remove('sol-drag'); }, DUR + 40); })(el3);
    }
    if (mv && R.legal(st, mv)) doMove(mv);
    else {
      for (j = 0; j < d.items.length; j++) {
        var it = d.items[j], p = P[it.cid];
        it.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
        (function (e5, z) { later(function () { e5.style.zIndex = z; }, DUR + 40); })(it.el, p.z);
      }
    }
  }
  function unbind() {
    window.removeEventListener('pointermove', onPMove);
    window.removeEventListener('pointerup', onPUp);
    window.removeEventListener('pointercancel', onPUp);
  }
  board.addEventListener('pointerdown', onDown);

  function onKey(e) {
    if (e.key === ' ') { stockTap(); e.preventDefault(); }
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') undo();
    else if (e.key === 'a' || e.key === 'A') tryAuto();
    else if (e.key === 'n' || e.key === 'N') { if (!autoBusy) newDeal(); }
  }
  window.addEventListener('keydown', onKey);

  function onResize() {
    layout();
    board.classList.add('sol-ntall');
    render();
    later(function () { board.classList.remove('sol-ntall'); }, 60);
  }
  window.addEventListener('resize', onResize);

  undoBtn.addEventListener('click', undo);
  autoBtn.addEventListener('click', tryAuto);
  dealBtn.addEventListener('click', function () { if (!autoBusy) newDeal(); });

  /* timer: +1s, -2 score per 10s (floor 0), periodic autosave */
  tick = setInterval(function () {
    if (paused || won || moves === 0) return;
    elapsed++;
    if (elapsed % 10 === 0 && score > 0) {
      score = Math.max(0, score - 2);
      api.score(score);
    }
    updateHud();
    if (elapsed % 5 === 0) saveState();
  }, 1000);

  /* ------------------------------ init ------------------------------ */
  layout();
  var sv = api.load();
  if (validSave(sv)) {
    st = { s: sv.s, w: sv.w, f: sv.f, t: sv.t };
    score = Math.max(0, sv.sc | 0);
    moves = Math.max(0, sv.mv | 0);
    elapsed = Math.max(0, sv.el | 0);
    recycles = Math.max(0, sv.rc | 0);
    api.score(score);
    render();
  } else {
    newDeal();
  }
  later(function () {
    for (var j = 0; j < 52; j++) cardEls[j].classList.remove('sol-nt');
  }, 60);

  return {
    destroy: function () {
      clearInterval(tick);
      for (var j = 0; j < timers.length; j++) clearTimeout(timers[j]);
      timers.length = 0;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      unbind();
      board.removeEventListener('pointerdown', onDown);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
