/* Подкидной дурак — premium 36-card game vs AI. MG contract. */
(function () {
'use strict';

/* ================= Rules engine (pure, node-testable) ================= */
var SUITS = '♠♥♦♣';

function mkCard(r, s) { return { r: r, s: s, id: s * 9 + (r - 6) }; }

function newDeck(rnd) {
  var d = [], s, r, i, j, t;
  for (s = 0; s < 4; s++) for (r = 6; r <= 14; r++) d.push(mkCard(r, s));
  for (i = d.length - 1; i > 0; i--) {
    j = (rnd() * (i + 1)) | 0; t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}

/* State: deck (deck[0] is trump card, drawn last; pop() draws from top),
   trump suit, hands[2], table [{a,d}], att seat, defStart (defender hand
   size at bout start), taking flag, discard count, over, winner (0/1, 2=draw). */
function create(rnd) {
  rnd = rnd || Math.random;
  var deck = newDeck(rnd);
  var st = { deck: deck, trump: deck[0].s, hands: [[], []], table: [],
    att: 0, defStart: 0, taking: false, discard: 0, over: false, winner: -1 };
  for (var k = 0; k < 12; k++) st.hands[k % 2].push(deck.pop());
  var lo = [99, 99];
  st.hands.forEach(function (h, p) {
    h.forEach(function (c) { if (c.s === st.trump && c.r < lo[p]) lo[p] = c.r; });
  });
  st.att = lo[1] < lo[0] ? 1 : 0; // lowest trump attacks first
  return st;
}

function beats(c, a, trump) {
  if (c.s === a.s) return c.r > a.r;
  return c.s === trump;
}

function uncovered(st) {
  var u = [];
  st.table.forEach(function (p, i) { if (!p.d) u.push(i); });
  return u;
}

/* Whose decision it is: 'att' (attack / throw in / pass) or 'def' (cover / take). */
function whose(st) {
  if (st.over) return null;
  if (st.taking) return 'att';
  return uncovered(st).length ? 'def' : 'att';
}

function canAttack(st, c) {
  if (st.over || whose(st) !== 'att') return false;
  var hand = st.hands[st.att];
  if (hand.indexOf(c) < 0) return false;
  if (!st.table.length) return true;
  // throw-in: ≤6 total and never more than defender's hand at bout start
  if (st.table.length >= Math.min(6, st.defStart)) return false;
  for (var i = 0; i < st.table.length; i++) {
    var p = st.table[i];
    if (p.a.r === c.r || (p.d && p.d.r === c.r)) return true;
  }
  return false;
}

function attack(st, c) {
  if (!canAttack(st, c)) return false;
  if (!st.table.length) st.defStart = st.hands[1 - st.att].length;
  st.hands[st.att].splice(st.hands[st.att].indexOf(c), 1);
  st.table.push({ a: c, d: null });
  return true;
}

function cover(st, i, c) {
  if (st.over || whose(st) !== 'def') return false;
  var p = st.table[i];
  if (!p || p.d) return false;
  var hand = st.hands[1 - st.att];
  if (hand.indexOf(c) < 0 || !beats(c, p.a, st.trump)) return false;
  hand.splice(hand.indexOf(c), 1);
  p.d = c;
  return true;
}

function take(st) {
  if (st.over || whose(st) !== 'def') return false;
  st.taking = true;
  return true;
}

/* Attacker ends the bout: "бито" (all covered) or finishes giving cards after a take.
   Then refill attacker first, defender last; roles swap only on successful defense. */
function finish(st) {
  if (st.over || whose(st) !== 'att' || !st.table.length) return false;
  var def = 1 - st.att;
  if (st.taking) {
    st.table.forEach(function (p) {
      st.hands[def].push(p.a);
      if (p.d) st.hands[def].push(p.d);
    });
  } else {
    if (uncovered(st).length) return false;
    st.table.forEach(function () { st.discard += 2; });
  }
  var taken = st.taking;
  st.table = []; st.taking = false; st.defStart = 0;
  [st.att, def].forEach(function (p) {
    while (st.hands[p].length < 6 && st.deck.length) st.hands[p].push(st.deck.pop());
  });
  if (!taken) st.att = def;
  if (!st.deck.length) {
    var e0 = !st.hands[0].length, e1 = !st.hands[1].length;
    if (e0 && e1) { st.over = true; st.winner = 2; }
    else if (e0) { st.over = true; st.winner = 0; }
    else if (e1) { st.over = true; st.winner = 1; }
  }
  return true;
}

function act(st, a) {
  if (!a) return false;
  if (a.t === 'a') return attack(st, a.card);
  if (a.t === 'c') return cover(st, a.i, a.card);
  if (a.t === 'take') return take(st);
  if (a.t === 'done') return finish(st);
  return false;
}

/* ================= AI (sees own hand + table + counts + trump only) ================= */
function val(st, c) { return (c.r - 6) + (c.s === st.trump ? 13 : 0); }

function pickThrow(st, seat) {
  var hand = st.hands[seat];
  if (st.table.length >= Math.min(6, st.defStart)) return null;
  var ranks = {};
  st.table.forEach(function (p) { ranks[p.a.r] = 1; if (p.d) ranks[p.d.r] = 1; });
  var legal = hand.filter(function (c) { return ranks[c.r]; });
  if (!legal.length) return null;
  legal.sort(function (x, y) { return val(st, x) - val(st, y); });
  var c = legal[0], lim;
  if (!st.deck.length) lim = (st.taking || hand.length <= 2) ? 99 : 8; // press the endgame
  else lim = st.taking ? 5 : 4; // only dump cheap cards while the deck lasts
  return val(st, c) <= lim ? c : null;
}

function aiAction(st, seat) {
  var w = whose(st);
  if (!w) return null;
  if ((w === 'att' ? st.att : 1 - st.att) !== seat) return null;
  var hand = st.hands[seat], i, c;

  if (w === 'def') {
    // plan cheapest sufficient cover for every uncovered card
    var unc = uncovered(st), avail = hand.slice(), plan = {}, cost = 0, ok = true;
    var order = unc.slice().sort(function (a, b) {
      return val(st, st.table[b].a) - val(st, st.table[a].a);
    });
    for (i = 0; i < order.length; i++) {
      var atk = st.table[order[i]].a;
      var opts = avail.filter(function (x) { return beats(x, atk, st.trump); });
      if (!opts.length) { ok = false; break; }
      opts.sort(function (x, y) { return val(st, x) - val(st, y); });
      avail.splice(avail.indexOf(opts[0]), 1);
      plan[order[i]] = opts[0];
      cost += val(st, opts[0]) - Math.min(val(st, atk), 8) * 0.6;
    }
    if (!ok) return { t: 'take' };
    if (st.deck.length) { // early on, taking cheap beats burning trumps/aces
      var thr = 7 + (24 - st.deck.length) * 0.4 + st.table.length * 1.5;
      if (cost > thr && hand.length <= 7) return { t: 'take' };
    }
    return { t: 'c', i: unc[0], card: plan[unc[0]] };
  }

  if (st.table.length === 0) { // open: cheapest card, prefer non-trump pairs
    var best = null, bs = 1e9;
    for (i = 0; i < hand.length; i++) {
      c = hand[i];
      var cnt = 0;
      for (var j = 0; j < hand.length; j++) if (hand[j].r === c.r) cnt++;
      var sc = val(st, c) - (cnt > 1 && c.s !== st.trump ? 2.6 : 0) -
        (!st.deck.length && cnt > 1 ? 1.5 : 0);
      if (sc < bs) { bs = sc; best = c; }
    }
    return { t: 'a', card: best };
  }
  c = pickThrow(st, seat);
  return c ? { t: 'a', card: c } : { t: 'done' };
}

var Engine = {
  create: create, beats: beats, act: act, whose: whose, canAttack: canAttack,
  uncovered: uncovered, aiAction: aiAction, val: val, SUITS: SUITS, mkCard: mkCard
};
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
if (typeof MG === 'undefined' || !MG || !MG.register) return;

/* ================= UI ================= */
MG.register('durak', function (container, api) {
  var C = api.colors, LOW = api.lowEnd;
  var RU = api.lang === 'ru';
  function L(ru, en) { return RU ? ru : en; }
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var TRANS = LOW ? 'transform .13s ease-out' : 'transform .24s cubic-bezier(.25,.9,.35,1)';
  var AID = LOW ? 480 : 700; // AI move delay
  var destroyed = false, paused = false, dealing = false, ended = false;
  var st, nodes = {}, selected = -1, cRaf = 0, confettiEl = null;

  /* --- deferred-timer manager (pause defers AI timers) --- */
  var T = (function () {
    var seq = 0, pend = {};
    function arm(id) {
      var p = pend[id];
      p.at = Date.now();
      p.h = setTimeout(function () { delete pend[id]; p.fn(); }, Math.max(0, p.rem));
    }
    return {
      set: function (fn, ms) {
        var id = ++seq;
        pend[id] = { fn: fn, rem: ms, at: 0, h: null };
        if (!paused) arm(id);
        return id;
      },
      pause: function () {
        for (var id in pend) {
          var p = pend[id];
          if (p.h) { clearTimeout(p.h); p.rem -= Date.now() - p.at; p.h = null; }
        }
      },
      resume: function () { for (var id in pend) if (!pend[id].h) arm(id); },
      clear: function () {
        for (var id in pend) if (pend[id].h) clearTimeout(pend[id].h);
        pend = {};
      }
    };
  })();

  /* --- color helpers --- */
  function hx(x) {
    x = String(x).replace('#', '');
    if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
    if (!/^[0-9a-fA-F]{6}/.test(x)) x = '4a6cf7';
    return [parseInt(x.substr(0, 2), 16), parseInt(x.substr(2, 2), 16), parseInt(x.substr(4, 2), 16)];
  }
  function mix(a, b, t) {
    var A = hx(a), B = hx(b), o = '#', i, v;
    for (i = 0; i < 3; i++) {
      v = Math.round(A[i] + (B[i] - A[i]) * t);
      o += ('0' + v.toString(16)).slice(-2);
    }
    return o;
  }

  /* --- static DOM --- */
  container.style.background =
    'radial-gradient(130% 100% at 50% 22%, #2f7c50 0%, #1e5a3a 52%, #113925 100%)';
  container.style.overflow = 'hidden';
  var style = document.createElement('style');
  style.textContent =
    '@keyframes dkshk{0%,100%{margin-left:0}20%{margin-left:-6px}40%{margin-left:6px}' +
    '60%{margin-left:-4px}80%{margin-left:4px}}' +
    '.dkshk{animation:dkshk .32s;filter:grayscale(.9) brightness(.75)!important}';
  container.appendChild(style);

  function el(tag, css) {
    var e = document.createElement(tag);
    for (var k in css) e.style[k] = css[k];
    container.appendChild(e);
    return e;
  }
  var statusEl = el('div', { position: 'absolute', left: '8px', right: '8px', textAlign: 'center',
    color: '#eaf6ee', fontSize: '14px', fontWeight: '600', textShadow: '0 1px 2px rgba(0,0,0,.5)',
    pointerEvents: 'none', zIndex: 200 });
  var badgeEl = el('div', { position: 'absolute', padding: '3px 8px', borderRadius: '10px',
    background: 'rgba(0,0,0,.35)', color: '#fff', fontSize: '12px', fontWeight: '700',
    pointerEvents: 'none', zIndex: 200 });
  var deckCntEl = el('div', { position: 'absolute', textAlign: 'center', color: '#dfeee4',
    fontSize: '12px', fontWeight: '700', pointerEvents: 'none', zIndex: 200 });
  var discCntEl = el('div', { position: 'absolute', textAlign: 'center', color: '#c6d9cc',
    fontSize: '12px', fontWeight: '700', pointerEvents: 'none', zIndex: 200 });
  function mkBtn(txt) {
    var b = document.createElement('button');
    b.className = 'mg-btn';
    b.textContent = txt;
    b.style.position = 'absolute';
    b.style.zIndex = '220';
    b.style.display = 'none';
    b.style.padding = '8px 18px';
    b.style.fontWeight = '700';
    container.appendChild(b);
    return b;
  }
  var btnMain = mkBtn(''), btnTake = mkBtn('');
  btnTake.style.background = C.bad; btnTake.style.color = '#fff';
  btnMain.style.background = C.accent; btnMain.style.color = '#fff';
  var btnNew = mkBtn('↺');
  btnNew.style.display = 'block';
  btnNew.style.padding = '4px 10px';
  btnNew.style.fontSize = '18px';
  btnNew.style.background = 'rgba(0,0,0,.3)';
  btnNew.style.color = '#fff';

  var deckStack = [], discStack = [];
  function mkPile(arr, n) {
    for (var i = 0; i < n; i++) {
      var d = document.createElement('div');
      d.style.position = 'absolute';
      d.style.zIndex = String(3 + i);
      d.style.borderRadius = '8px';
      d.style.overflow = 'hidden';
      d.style.boxShadow = '0 3px 8px rgba(0,0,0,.4)';
      var cn = document.createElement('canvas');
      d.appendChild(cn);
      container.appendChild(d);
      arr.push(d);
    }
  }
  mkPile(deckStack, 3);
  mkPile(discStack, 2);

  /* --- geometry --- */
  var W, H, CW, CH, topY, handY, deckX, deckY, tx0, pairW, rowY0, rowY1, areaTop, areaBot;
  function layout() {
    W = container.clientWidth || window.innerWidth;
    H = container.clientHeight || window.innerHeight;
    CW = Math.round(Math.min(74, Math.max(44, W / 7.2)));
    CH = Math.round(CW * 1.44);
    topY = 10;
    handY = H - CH - 88;
    areaTop = topY + CH + 18;
    areaBot = handY - 78;
    deckX = 8;
    deckY = Math.round((areaTop + areaBot) / 2 - CH / 2);
    tx0 = deckX + CW * 0.9 + CH * 0.55 + 12;
    pairW = Math.min(CW * 1.5, (W - tx0 - 6) / 3);
    rowY0 = areaTop + 2;
    rowY1 = Math.min(rowY0 + CH + 16, areaBot - CH - CH * 0.2);
    statusEl.style.top = (handY - 32) + 'px';
    btnMain.style.top = btnTake.style.top = (handY - 78) + 'px';
    btnMain.style.left = '50%';
    btnMain.style.transform = 'translateX(-50%)';
    btnTake.style.left = '50%';
    btnTake.style.transform = 'translateX(-50%)';
    btnNew.style.top = '8px'; btnNew.style.right = '8px';
    badgeEl.style.left = deckX + 'px';
    badgeEl.style.top = (deckY + CH + 26) + 'px';
    deckCntEl.style.left = deckX + 'px';
    deckCntEl.style.width = CW + 'px';
    deckCntEl.style.top = (deckY + CH + 6) + 'px';
    discCntEl.style.right = '4px';
    discCntEl.style.width = CW + 'px';
    discCntEl.style.top = (deckY + CH + 6) + 'px';
    deckStack.forEach(function (d, i) {
      d.style.left = (deckX + i * 2) + 'px';
      d.style.top = (deckY - i * 2) + 'px';
      sizePile(d);
    });
    discStack.forEach(function (d, i) {
      d.style.left = (W - CW * 0.55 + i * 3) + 'px';
      d.style.top = (deckY - i * 3) + 'px';
      sizePile(d);
    });
  }
  function sizePile(d) {
    d.style.width = CW + 'px'; d.style.height = CH + 'px';
    var cn = d.firstChild, g = cn.getContext('2d');
    cn.width = CW * DPR; cn.height = CH * DPR;
    cn.style.width = CW + 'px'; cn.style.height = CH + 'px';
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    back(g);
  }

  /* --- card painting --- */
  function rankLbl(r) {
    if (r <= 10) return String(r);
    return (RU ? { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' } :
      { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r];
  }
  function face(g, c) {
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = '#fcfaf2';
    g.fillRect(0, 0, CW, CH);
    var gr = g.createLinearGradient(0, 0, 0, CH);
    gr.addColorStop(0, 'rgba(255,255,255,.6)');
    gr.addColorStop(1, 'rgba(0,0,0,.05)');
    g.fillStyle = gr;
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(0,0,0,.15)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, CW - 1, CH - 1);
    var col = (c.s === 1 || c.s === 2) ? '#d0342c' : '#22242b';
    var rl = rankLbl(c.r), sy = SUITS[c.s], fs = CW * 0.24;
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    function corner() {
      g.font = '700 ' + fs + 'px system-ui,sans-serif';
      g.fillText(rl, CW * 0.17, CH * 0.115);
      g.font = (fs * 0.92) + 'px system-ui,sans-serif';
      g.fillText(sy, CW * 0.17, CH * 0.115 + fs * 0.98);
    }
    corner();
    g.save(); g.translate(CW, CH); g.rotate(Math.PI); corner(); g.restore();
    if (c.r > 10 && c.r < 14) {
      g.font = '700 ' + (CW * 0.46) + 'px Georgia,serif';
      g.fillText(rl, CW / 2, CH * 0.45);
      g.font = (CW * 0.3) + 'px system-ui,sans-serif';
      g.fillText(sy, CW / 2, CH * 0.7);
    } else {
      g.font = (CW * 0.62) + 'px system-ui,sans-serif';
      g.fillText(sy, CW / 2, CH * 0.52);
    }
  }
  function back(g) {
    var a = C.accent || '#4a6cf7';
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = '#f0ede1';
    g.fillRect(0, 0, CW, CH);
    var m = 3;
    g.fillStyle = mix(a, '#141420', 0.42);
    g.fillRect(m, m, CW - 2 * m, CH - 2 * m);
    g.save();
    g.beginPath();
    g.rect(m, m, CW - 2 * m, CH - 2 * m);
    g.clip();
    g.strokeStyle = mix(a, '#ffffff', 0.35);
    g.globalAlpha = 0.65;
    g.lineWidth = 1;
    var sp = 6, k;
    g.beginPath();
    for (k = -CH; k < CW + CH; k += sp) { g.moveTo(k, 0); g.lineTo(k + CH, CH); }
    for (k = 0; k < CW + 2 * CH; k += sp) { g.moveTo(k, 0); g.lineTo(k - CH, CH); }
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.2)';
    g.strokeRect(0.5, 0.5, CW - 1, CH - 1);
  }

  /* --- card nodes --- */
  function makeNode(card) {
    var d = document.createElement('div');
    d.style.position = 'absolute';
    d.style.left = '0'; d.style.top = '0';
    d.style.width = CW + 'px'; d.style.height = CH + 'px';
    d.style.borderRadius = Math.round(CW * 0.11) + 'px';
    d.style.overflow = 'hidden';
    d.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)';
    d.style.willChange = 'transform';
    var cn = document.createElement('canvas');
    d.appendChild(cn);
    container.appendChild(d);
    var nd = { el: d, cv: cn, card: card, up: null };
    d.addEventListener('click', function () { onCardTap(card, nd); });
    nodes[card.id] = nd;
    return nd;
  }
  function paint(nd) {
    var g = nd.cv.getContext('2d');
    nd.cv.width = CW * DPR; nd.cv.height = CH * DPR;
    nd.cv.style.width = CW + 'px'; nd.cv.style.height = CH + 'px';
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (nd.up) face(g, nd.card); else back(g);
  }
  function setXf(nd, x, y, r, z) {
    nd.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) rotate(' + r + 'deg)';
    nd.el.style.zIndex = String(z);
  }

  /* --- layout sync (all animation flows through here) --- */
  function sync(anim) {
    var plc = [], i, c, m, step;
    var ph = st.hands[0];
    m = (ph.length - 1) / 2;
    step = Math.min(CW * 0.6, (W - CW - 24) / Math.max(1, ph.length - 1));
    for (i = 0; i < ph.length; i++) {
      c = ph[i];
      plc.push({ c: c, x: W / 2 + (i - m) * step - CW / 2, y: handY + Math.abs(i - m) * 3,
        r: (i - m) * Math.min(4, 24 / Math.max(1, ph.length)), z: 100 + i, up: true });
    }
    var ah = st.hands[1];
    m = (ah.length - 1) / 2;
    step = Math.min(CW * 0.42, (W * 0.62) / Math.max(1, ah.length - 1));
    for (i = 0; i < ah.length; i++) {
      c = ah[i];
      plc.push({ c: c, x: W / 2 + (i - m) * step - CW / 2, y: topY + Math.abs(i - m) * 2,
        r: -(i - m) * 3, z: 40 + i, up: !!st.over });
    }
    var oneRow = st.table.length <= 3;
    var y0 = oneRow ? Math.round((areaTop + areaBot - CH * 1.2) / 2) : rowY0;
    for (i = 0; i < st.table.length; i++) {
      var p = st.table[i];
      var bx = tx0 + (i % 3) * pairW, by = (i < 3 ? y0 : rowY1);
      plc.push({ c: p.a, x: bx, y: by, r: -3, z: 60 + i * 2, up: true, tbl: i });
      if (p.d) plc.push({ c: p.d, x: bx + CW * 0.28, y: by + CH * 0.2, r: 7, z: 61 + i * 2, up: true });
    }
    if (st.deck.length) {
      var tc = st.deck[0];
      plc.push({ c: tc, x: deckX + CW * 0.42, y: deckY + (CH - CH) / 2, r: 96, z: 2, up: true });
    }
    var seen = {}, fresh = 0;
    plc.forEach(function (e) {
      seen[e.c.id] = 1;
      var nd = nodes[e.c.id], isNew = false;
      if (!nd) {
        nd = makeNode(e.c);
        isNew = true;
        nd.up = e.up;
        paint(nd);
        nd.el.style.transition = 'none';
        setXf(nd, deckX, deckY, 0, e.z);
        void nd.el.offsetWidth; // reflow so the fly-in animates
      }
      if (nd.up !== e.up) { nd.up = e.up; paint(nd); }
      nd.el.style.transition = anim ? TRANS : 'none';
      nd.el.style.transitionDelay = (anim && isNew) ? (fresh++ * 55) + 'ms' : '0ms';
      setXf(nd, e.x, e.y, e.r, e.z);
    });
    for (var id in nodes) {
      if (seen[id]) continue;
      var out = nodes[id];
      delete nodes[id];
      out.el.style.transition = anim ? TRANS + ', opacity .25s' : 'none';
      out.el.style.transitionDelay = '0ms';
      setXf(out, W - CW * 0.55, deckY, 15 + Math.random() * 20, 30);
      (function (o) {
        T.set(function () { if (o.el.parentNode) o.el.parentNode.removeChild(o.el); }, anim ? 380 : 0);
      })(out);
    }
    // piles + counters
    deckStack.forEach(function (d, i) {
      d.style.display = st.deck.length > i + 1 ? 'block' : 'none';
    });
    discStack.forEach(function (d, i) {
      d.style.display = st.discard > i * 6 ? 'block' : 'none';
    });
    deckCntEl.textContent = st.deck.length ? String(st.deck.length) : '';
    discCntEl.textContent = st.discard ? String(st.discard) : '';
    var red = st.trump === 1 || st.trump === 2;
    badgeEl.innerHTML = L('Козырь ', 'Trump ') +
      '<span style="color:' + (red ? '#ff6f66' : '#fff') + ';font-size:15px">' +
      SUITS[st.trump] + '</span>';
  }

  /* --- contextual UI --- */
  function actorSeat() {
    var w = whose(st);
    if (!w) return -1;
    return w === 'att' ? st.att : 1 - st.att;
  }
  function playerLegal() {
    var w = whose(st), out = {};
    if (dealing || st.over || actorSeat() !== 0) return out;
    st.hands[0].forEach(function (c) {
      if (w === 'att') { if (canAttack(st, c)) out[c.id] = 1; }
      else {
        for (var i = 0; i < st.table.length; i++) {
          var p = st.table[i];
          if (!p.d && beats(c, p.a, st.trump)) { out[c.id] = 1; break; }
        }
      }
    });
    return out;
  }
  function updateUI() {
    var w = whose(st), a = actorSeat();
    var legal = playerLegal();
    st.hands[0].forEach(function (c) {
      var nd = nodes[c.id];
      if (!nd) return;
      nd.el.style.boxShadow = (legal[c.id] && !LOW)
        ? '0 4px 10px rgba(0,0,0,.35), 0 0 14px ' + mix(C.accent, '#ffffff', 0.2)
        : '0 4px 10px rgba(0,0,0,.35)';
    });
    st.table.forEach(function (p, i) {
      var nd = nodes[p.a.id];
      if (!nd) return;
      var pick = (w === 'def' && a === 0 && !p.d);
      nd.el.style.boxShadow = '0 4px 10px rgba(0,0,0,.35)' +
        (i === selected ? ', 0 0 0 3px ' + C.accent : (pick && !LOW ? ', 0 0 0 2px rgba(255,255,255,.35)' : ''));
    });
    btnTake.style.display = (a === 0 && w === 'def' && !dealing) ? 'block' : 'none';
    btnTake.textContent = L('Взять', 'Take');
    var showMain = a === 0 && w === 'att' && st.table.length > 0 && !dealing;
    btnMain.style.display = showMain ? 'block' : 'none';
    btnMain.textContent = st.taking ? L('Готово', 'Done') : L('Бито', 'Done');
    if (st.over) {
      statusEl.textContent = st.winner === 2 ? api.t('draw') :
        (st.winner === 0 ? api.t('you_win') : api.t('you_lose'));
    } else if (dealing) {
      statusEl.textContent = L('Раздача…', 'Dealing…');
    } else if (a === 0) {
      if (w === 'def') statusEl.textContent = L('Отбейтесь или возьмите', 'Beat the cards or take them');
      else if (st.taking) statusEl.textContent = L('Соперник берёт — можно подкинуть', 'Opponent takes — you may add cards');
      else if (st.table.length) statusEl.textContent = L('Подкиньте или «Бито»', 'Throw in or press Done');
      else statusEl.textContent = L('Ваш ход — атакуйте', 'Your move — attack');
    } else {
      statusEl.textContent = (st.taking && st.att === 1)
        ? L('Вы берёте…', 'You take the cards…') : api.t('thinking');
    }
  }

  /* --- game flow --- */
  function persist() {
    if (st.over) api.save(null);
    else api.save(st);
  }
  function afterMove() {
    selected = -1;
    sync(true);
    persist();
    updateUI();
    if (st.over) { endSeq(); return; }
    scheduleAI();
  }
  function scheduleAI() {
    var a = actorSeat();
    if (a === 1) { T.set(aiStep, AID); return; }
    if (a === 0 && whose(st) === 'att' && st.table.length) {
      // nothing to throw in → auto-finish after a beat
      var none = !st.hands[0].some(function (c) { return canAttack(st, c); });
      if (none) T.set(function () {
        if (st.over || dealing || actorSeat() !== 0 || whose(st) !== 'att' || !st.table.length) return;
        if (st.hands[0].some(function (c) { return canAttack(st, c); })) return;
        act(st, { t: 'done' });
        afterMove();
      }, 1100);
    }
  }
  function aiStep() {
    if (st.over || destroyed) return;
    if (actorSeat() !== 1) return;
    var a = aiAction(st, 1);
    if (!a || !act(st, a)) { act(st, { t: 'done' }); }
    if (a && a.t === 'take') api.haptic('light');
    if (a && a.t === 'c') api.haptic('light');
    afterMove();
  }

  function onCardTap(card, nd) {
    if (dealing || st.over || paused) return;
    var w = whose(st), a = actorSeat();
    // table card tap: pick defense target
    var ti = st.table.findIndex(function (p) { return p.a === card; });
    if (ti >= 0) {
      if (a === 0 && w === 'def' && !st.table[ti].d) {
        selected = selected === ti ? -1 : ti;
        updateUI();
      }
      return;
    }
    if (st.hands[0].indexOf(card) < 0 || a !== 0) return;
    if (w === 'att') {
      if (act(st, { t: 'a', card: card })) { api.haptic('light'); afterMove(); }
      else shake(nd);
      return;
    }
    // defending: cover selected target, else the biggest attack this card beats
    var best = -1, bv = -1;
    if (selected >= 0 && !st.table[selected].d && beats(card, st.table[selected].a, st.trump)) best = selected;
    else st.table.forEach(function (p, i) {
      if (!p.d && beats(card, p.a, st.trump)) {
        var v = val(st, p.a);
        if (v > bv) { bv = v; best = i; }
      }
    });
    if (best >= 0 && act(st, { t: 'c', i: best, card: card })) {
      api.haptic('light');
      afterMove();
    } else shake(nd);
  }
  function shake(nd) {
    nd.el.classList.add('dkshk');
    api.haptic('error');
    T.set(function () { nd.el.classList.remove('dkshk'); }, 340);
  }

  btnTake.addEventListener('click', function () {
    if (dealing || st.over || actorSeat() !== 0 || whose(st) !== 'def') return;
    if (act(st, { t: 'take' })) { api.haptic('medium'); afterMove(); }
  });
  btnMain.addEventListener('click', function () {
    if (dealing || st.over || actorSeat() !== 0 || whose(st) !== 'att') return;
    if (act(st, { t: 'done' })) { api.haptic('light'); afterMove(); }
  });
  btnNew.addEventListener('click', function () { newGame(true); });

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (btnMain.style.display !== 'none') { btnMain.click(); e.preventDefault(); }
    } else if (e.key === 't' || e.key === 'T' || e.key === 'в' || e.key === 'В') {
      if (btnTake.style.display !== 'none') btnTake.click();
    }
  }
  window.addEventListener('keydown', onKey);
  function onResize() {
    layout();
    for (var id in nodes) paint(nodes[id]);
    sync(false);
    updateUI();
  }
  window.addEventListener('resize', onResize);

  /* --- end / confetti --- */
  function endSeq() {
    if (ended) return;
    ended = true;
    api.save(null);
    var win = st.winner === 0, draw = st.winner === 2;
    var score = win ? 120 + 5 * st.hands[1].length : (draw ? 50 : 10);
    api.haptic(win ? 'success' : 'error');
    if (win) confetti();
    T.set(function () {
      api.gameOver(score, draw ? { draw: true } : { win: win });
    }, win && !LOW ? 1300 : 650);
  }
  function confetti() {
    if (LOW || destroyed) return;
    confettiEl = document.createElement('canvas');
    confettiEl.width = W * DPR; confettiEl.height = H * DPR;
    confettiEl.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' +
      H + 'px;pointer-events:none;z-index:500';
    container.appendChild(confettiEl);
    var g = confettiEl.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cols = [C.accent, C.good, '#ffd54a', '#ff7597', '#7ec8ff'];
    var ps = [], i;
    for (i = 0; i < 70; i++) ps.push({
      x: W / 2 + (Math.random() - 0.5) * 90, y: H * 0.35,
      vx: (Math.random() - 0.5) * 7, vy: -3 - Math.random() * 5.5,
      w: 4 + Math.random() * 5, h: 3 + Math.random() * 4,
      a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.35, c: cols[i % 5]
    });
    var t0 = performance.now();
    (function fr(t) {
      if (destroyed || !confettiEl) return;
      g.clearRect(0, 0, W, H);
      ps.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.a += p.va;
        g.save(); g.translate(p.x, p.y); g.rotate(p.a);
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.restore();
      });
      if (t - t0 < 1400) cRaf = requestAnimationFrame(fr);
      else if (confettiEl.parentNode) { confettiEl.parentNode.removeChild(confettiEl); confettiEl = null; }
    })(t0);
  }

  /* --- boot --- */
  function clearNodes() {
    for (var id in nodes) {
      if (nodes[id].el.parentNode) nodes[id].el.parentNode.removeChild(nodes[id].el);
    }
    nodes = {};
  }
  function validSave(s) {
    try {
      if (!s || s.over || !s.hands || s.hands.length !== 2 || !s.deck || !s.table) return false;
      var n = s.deck.length + s.discard;
      s.hands.forEach(function (h) { n += h.length; });
      s.table.forEach(function (p) { n += p.d ? 2 : 1; });
      return n === 36 && s.trump >= 0 && s.trump < 4;
    } catch (e) { return false; }
  }
  function newGame(fresh) {
    T.clear();
    ended = false;
    selected = -1;
    clearNodes();
    var saved = fresh ? null : api.load();
    if (validSave(saved)) {
      st = saved;
      dealing = false;
      sync(false);
      updateUI();
      scheduleAI();
    } else {
      st = create();
      persist();
      dealing = true;
      sync(true);
      updateUI();
      T.set(function () {
        dealing = false;
        updateUI();
        scheduleAI();
      }, LOW ? 500 : 1150);
    }
  }

  api.score(0);
  layout();
  newGame(false);

  return {
    destroy: function () {
      destroyed = true;
      T.clear();
      cancelAnimationFrame(cRaf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      if (confettiEl && confettiEl.parentNode) confettiEl.parentNode.removeChild(confettiEl);
    },
    pause: function () { paused = true; T.pause(); },
    resume: function () { paused = false; T.resume(); }
  };
});
})();
