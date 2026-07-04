/* Tiny Kingdom — chill island-builder puzzle (Islanders-lite).
   Place 28 buildings on a procedural island; adjacency synergies score points. */
(function () {
'use strict';

var BW = 9, BH = 11, N = BW * BH, TURNS = 28;
/* terrain codes: 0 water, 1 plains, 2 forest, 3 mountain */
/* building ids: 0 House 1 Farm 2 Mill 3 Well 4 Lumberjack 5 Mine 6 Market 7 Temple 8 Tower 9 Statue */

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Procedural island: random radial blob -> cellular smoothing -> largest
   component -> trim/grow into a 60..80 land-cell range -> scatter features. */
function genIsland(rand) {
  var ter, i, x, y, tries = 0;
  function inB(x, y) { return x >= 0 && y >= 0 && x < BW && y < BH; }
  function n4(i) {
    var x = i % BW, y = (i / BW) | 0, r = [];
    if (x > 0) r.push(i - 1);
    if (x < BW - 1) r.push(i + 1);
    if (y > 0) r.push(i - BW);
    if (y < BH - 1) r.push(i + BW);
    return r;
  }
  function landN4(i) {
    var c = 0, nb = n4(i);
    for (var k = 0; k < nb.length; k++) if (ter[nb[k]]) c++;
    return c;
  }
  function largest() {
    var seen = new Array(N), best = null, s, k;
    for (s = 0; s < N; s++) {
      if (!ter[s] || seen[s]) continue;
      var q = [s], comp = [];
      seen[s] = 1;
      while (q.length) {
        var c = q.pop();
        comp.push(c);
        var nb = n4(c);
        for (k = 0; k < nb.length; k++) if (ter[nb[k]] && !seen[nb[k]]) { seen[nb[k]] = 1; q.push(nb[k]); }
      }
      if (!best || comp.length > best.length) best = comp;
    }
    var nt = new Array(N);
    for (k = 0; k < N; k++) nt[k] = 0;
    if (best) for (k = 0; k < best.length; k++) nt[best[k]] = 1;
    ter = nt;
  }
  function count() { var c = 0; for (var k = 0; k < N; k++) if (ter[k]) c++; return c; }

  while (tries++ < 80) {
    ter = [];
    for (i = 0; i < N; i++) {
      x = i % BW; y = (i / BW) | 0;
      var dx = (x - (BW - 1) / 2) / (BW * 0.55), dy = (y - (BH - 1) / 2) / (BH * 0.55);
      ter.push(rand() < 0.97 - 1.05 * Math.sqrt(dx * dx + dy * dy) ? 1 : 0);
    }
    for (var s = 0; s < 3; s++) {
      var nt = ter.slice();
      for (i = 0; i < N; i++) {
        x = i % BW; y = (i / BW) | 0;
        var n = 0;
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          if (inB(x + ox, y + oy) && ter[(y + oy) * BW + x + ox]) n++;
        }
        nt[i] = n >= 5 ? 1 : (n <= 3 ? 0 : ter[i]);
      }
      ter = nt;
    }
    largest();
    var land = count(), guard = 0, cand, pool;
    while (land > 78 && guard++ < 300) { /* trim coastal nubs */
      cand = [];
      for (i = 0; i < N; i++) if (ter[i] && landN4(i) <= 2) cand.push(i);
      if (!cand.length) for (i = 0; i < N; i++) if (ter[i] && landN4(i) <= 3) cand.push(i);
      if (!cand.length) break;
      ter[cand[(rand() * cand.length) | 0]] = 0;
      land--;
    }
    largest();
    land = count();
    guard = 0;
    while (land < 64 && guard++ < 300) { /* grow coastline back */
      var c2 = [], c1 = [];
      for (i = 0; i < N; i++) if (!ter[i]) {
        var ln = landN4(i);
        if (ln >= 2) c2.push(i); else if (ln === 1) c1.push(i);
      }
      pool = c2.length ? c2 : c1;
      if (!pool.length) break;
      ter[pool[(rand() * pool.length) | 0]] = 1;
      land++;
    }
    if (land >= 60 && land <= 80) break;
  }

  /* scatter mountains + forests on inner plains */
  var plainIdx = [];
  for (i = 0; i < N; i++) if (ter[i]) plainIdx.push(i);
  function pickInner() {
    var best = -1, bn = -1;
    for (var t2 = 0; t2 < 24; t2++) {
      var c = plainIdx[(rand() * plainIdx.length) | 0];
      if (ter[c] !== 1) continue;
      var nn = landN4(c);
      if (nn > bn) { bn = nn; best = c; }
    }
    return best;
  }
  function plainsNb(i) { return n4(i).filter(function (c) { return ter[c] === 1; }); }
  var nm = 3 + ((rand() * 2) | 0), sm = pickInner(), nb;
  for (i = 0; i < nm && sm >= 0; i++) {
    ter[sm] = 3;
    nb = plainsNb(sm);
    sm = (nb.length && rand() < 0.8) ? nb[(rand() * nb.length) | 0] : pickInner();
  }
  var nf = 6 + ((rand() * 3) | 0), done = 0, sf = pickInner();
  while (done < nf && sf >= 0) {
    ter[sf] = 2;
    done++;
    nb = plainsNb(sf);
    sf = (nb.length && rand() < 0.7) ? nb[(rand() * nb.length) | 0] : pickInner();
  }
  var hs = [];
  for (i = 0; i < N; i++) hs.push(ter[i] ? ((rand() * 3.4) | 0) : 0);
  return { ter: ter, hs: hs };
}

/* Building table: names, short synergy hints, deck weights (w0 early, w1 late). */
var BT = [
  { en: 'House',      ru: 'Дом',      he: '+2/house +3/well,temple', hr: '+2/дом +3/колодец,храм', w0: 5,    w1: 1.5 },
  { en: 'Farm',       ru: 'Ферма',    he: '+3/grass +5/mill',        hr: '+3/луг +5/мельница',     w0: 3.5,  w1: 1.5 },
  { en: 'Mill',       ru: 'Мельница', he: '+4/farm',                 hr: '+4/ферма',               w0: 1.2,  w1: 1.8 },
  { en: 'Well',       ru: 'Колодец',  he: '+2/house near',           hr: '+2/дом рядом',           w0: 1.2,  w1: 2.2 },
  { en: 'Lumberjack', ru: 'Лесоруб',  he: '+4/forest',               hr: '+4/лес',                 w0: 2.2,  w1: 0.9 },
  { en: 'Mine',       ru: 'Шахта',    he: '+8 by mountain',          hr: '+8 у горы',              w0: 1.6,  w1: 1 },
  { en: 'Market',     ru: 'Рынок',    he: '+2/type near',            hr: '+2/тип рядом',           w0: 0.25, w1: 2.6 },
  { en: 'Temple',     ru: 'Храм',     he: '+1/building near',        hr: '+1/здание рядом',        w0: 0.15, w1: 2.4 },
  { en: 'Tower',      ru: 'Башня',    he: '+6 on coast',             hr: '+6 на берегу',           w0: 0.9,  w1: 1.2 },
  { en: 'Statue',     ru: 'Статуя',   he: '+10',                     hr: '+10',                    w0: 0.22, w1: 0.5 }
];

/* Points earned by placing building t at (x,y).
   st = {w,h,ter,bld,tpl}; bld -1 = empty; tpl = "already blessed by a temple".
   Returns {pts, marks:[cells newly blessed]} (marks only for Temple). */
function scorePlace(st, t, x, y) {
  var w = st.w, h = st.h, ter = st.ter, bld = st.bld, tpl = st.tpl;
  function T(ax, ay) { return (ax < 0 || ay < 0 || ax >= w || ay >= h) ? 0 : ter[ay * w + ax]; }
  function B(ax, ay) {
    if (ax < 0 || ay < 0 || ax >= w || ay >= h) return -1;
    var v = bld[ay * w + ax];
    return v == null ? -1 : v;
  }
  function ring(r, cb) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      cb(x + dx, y + dy);
    }
  }
  var pts = 0, marks = [], b, seen, uniq, hit;
  if (t === 0) {           /* House */
    pts = 1;
    ring(1, function (ax, ay) {
      b = B(ax, ay);
      if (b === 0) pts += 2;
      else if (b === 3 || b === 7) pts += 3;
    });
  } else if (t === 1) {    /* Farm */
    pts = 1;
    ring(1, function (ax, ay) {
      if (B(ax, ay) === 2) pts += 5;
      else if (T(ax, ay) === 1 && B(ax, ay) < 0) pts += 3;
    });
  } else if (t === 2) {    /* Mill */
    pts = 1;
    ring(1, function (ax, ay) { if (B(ax, ay) === 1) pts += 4; });
  } else if (t === 3) {    /* Well */
    pts = 1;
    ring(2, function (ax, ay) { if (B(ax, ay) === 0) pts += 2; });
  } else if (t === 4) {    /* Lumberjack */
    pts = 1;
    ring(1, function (ax, ay) { if (T(ax, ay) === 2) pts += 4; });
  } else if (t === 5) {    /* Mine */
    hit = false;
    ring(1, function (ax, ay) { if (T(ax, ay) === 3) hit = true; });
    pts = hit ? 8 : 1;
  } else if (t === 6) {    /* Market */
    seen = {}; uniq = 0;
    ring(2, function (ax, ay) {
      b = B(ax, ay);
      if (b >= 0 && !seen[b]) { seen[b] = 1; uniq++; }
    });
    pts = 1 + 2 * uniq;
  } else if (t === 7) {    /* Temple: each building gives a temple bonus once */
    pts = 1;
    ring(3, function (ax, ay) {
      if (B(ax, ay) >= 0) {
        var ci = ay * w + ax;
        if (!tpl[ci]) { pts += 1; marks.push(ci); }
      }
    });
  } else if (t === 8) {    /* Tower */
    hit = T(x - 1, y) === 0 || T(x + 1, y) === 0 || T(x, y - 1) === 0 || T(x, y + 1) === 0;
    pts = hit ? 6 : 1;
  } else {                 /* Statue */
    pts = 10;
  }
  return { pts: pts, marks: marks };
}

if (typeof MG !== 'undefined') MG.register('kingdom', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var low = api.lowEnd, ru = api.lang === 'ru';

  /* ---- palette (api.colors + natural greens/blues/sands) ---- */
  var GRASS = ['#8cc474', '#83bb6b', '#94cb7c'];
  var SIDE = '#5e8d4a', SAND = '#cfb478';
  var SEA0 = '#3b7fa6', SEA1 = '#26567a';

  /* ---- state ---- */
  var ter, hs, bld, tpl, coast, shallow, edges;
  var score, turn, hand, sel, undoLeft, rerollLeft, snap, over;
  var armedI = -1, hoverI = -1, rev = 0, pv = null, placedOnce = false;
  var popAt = {}, parts = [], floats = [];
  var raf = 0, last = 0, paused = false, tG = 0, endTimer = 0;
  var cell, bx, by, uiTop, uiH = 126, cardR = [], chipR = [], wgrad;
  var kx = 4, ky = 5;

  function st() { return { w: BW, h: BH, ter: ter, bld: bld, tpl: tpl }; }
  function legal(i) { return i >= 0 && ter[i] === 1 && bld[i] < 0; }
  function anyLegal() { for (var i = 0; i < N; i++) if (legal(i)) return true; return false; }

  function buildWaterMeta() {
    coast = []; shallow = []; edges = [];
    var seen = {}, D = [[-1, 0, 1], [1, 0, 3], [0, -1, 2], [0, 1, 0]];
    for (var i = 0; i < N; i++) coast.push(0);
    for (i = 0; i < N; i++) {
      if (!ter[i]) continue;
      var x = i % BW, y = (i / BW) | 0;
      for (var k = 0; k < 4; k++) {
        var nx = x + D[k][0], ny = y + D[k][1];
        var out = nx < 0 || ny < 0 || nx >= BW || ny >= BH;
        if (out || !ter[ny * BW + nx]) {
          coast[i] = 1;
          if (!out) {
            var wi = ny * BW + nx;
            if (!seen[wi]) { seen[wi] = 1; shallow.push(wi); }
            edges.push({ x: nx, y: ny, s: D[k][2] });
          }
        }
      }
    }
  }

  /* ---- deck ---- */
  function drawHand() {
    var p = Math.min(1, turn / (TURNS - 1));
    function pick() {
      var tot = 0, w = [], k, r;
      for (k = 0; k < BT.length; k++) { w.push(BT[k].w0 + (BT[k].w1 - BT[k].w0) * p); tot += w[k]; }
      r = Math.random() * tot;
      for (k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) return k; }
      return w.length - 1;
    }
    var a = pick(), b = pick(), gg = 0;
    while (b === a && gg++ < 6) b = pick();
    return [a, b];
  }

  /* ---- persistence ---- */
  function saveState() {
    api.save({
      v: 2, ter: ter, hs: hs, bld: bld, tpl: tpl, sc: score, tn: turn,
      hd: hand, se: sel, ud: undoLeft, rr: rerollLeft, sn: snap
    });
  }
  function newGame() {
    var isl = genIsland(mulberry32((Math.random() * 1e9) | 0));
    ter = isl.ter; hs = isl.hs;
    bld = []; tpl = [];
    for (var i = 0; i < N; i++) { bld.push(-1); tpl.push(0); }
    score = 0; turn = 0; undoLeft = 1; rerollLeft = 2;
    snap = null; over = false;
    hand = drawHand(); sel = 0;
    buildWaterMeta();
    api.score(0);
    saveState();
  }
  function tryLoad() {
    var s = api.load();
    if (!s || s.v !== 2 || !s.ter || s.ter.length !== N || !s.bld || s.bld.length !== N ||
        typeof s.tn !== 'number' || s.tn >= TURNS || !s.hd || s.hd.length !== 2) return false;
    ter = s.ter; hs = s.hs; bld = s.bld; tpl = s.tpl;
    score = Math.max(0, s.sc | 0); turn = s.tn; hand = s.hd; sel = s.se ? 1 : 0;
    undoLeft = s.ud | 0; rerollLeft = s.rr | 0; snap = s.sn || null; over = false;
    buildWaterMeta();
    api.score(score);
    return true;
  }

  /* ---- actions ---- */
  function previewFor(i) {
    if (pv && pv.i === i && pv.sel === sel && pv.rev === rev) return pv.pts;
    var r = scorePlace(st(), hand[sel], i % BW, (i / BW) | 0);
    pv = { i: i, sel: sel, rev: rev, pts: r.pts };
    return r.pts;
  }
  function cellCenter(i) {
    var x = i % BW, y = (i / BW) | 0;
    return { x: bx + x * cell + cell / 2, y: by + y * cell + cell / 2 - (low ? 0 : hs[i]) };
  }
  function spawnDust(i) {
    if (low) return;
    var c = cellCenter(i);
    for (var k = 0; k < 9; k++) {
      var a = Math.random() * Math.PI * 2, sp = 0.03 + Math.random() * 0.05;
      parts.push({ x: c.x, y: c.y + cell * 0.2, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp - 0.02, t: 0, life: 550 });
    }
  }
  function place(i) {
    if (over || !legal(i)) return;
    var t = hand[sel];
    var res = scorePlace(st(), t, i % BW, (i / BW) | 0);
    snap = { i: i, pts: res.pts, hand: hand.slice(), sel: sel, marks: res.marks.slice(), turn: turn };
    bld[i] = t;
    for (var k = 0; k < res.marks.length; k++) tpl[res.marks[k]] = 1;
    score += res.pts;
    api.score(score);
    popAt[i] = tG;
    spawnDust(i);
    var c = cellCenter(i);
    floats.push({ x: c.x, y: c.y - cell * 0.4, txt: '+' + res.pts, t: 0 });
    api.haptic(res.pts >= 15 ? 'success' : 'light');
    turn++; rev++;
    armedI = -1; hoverI = -1; placedOnce = true;
    if (turn >= TURNS || !anyLegal()) {
      over = true;
      api.save(null);
      endTimer = setTimeout(function () { api.gameOver(score, { win: true }); }, 750);
    } else {
      hand = drawHand();
      sel = 0;
      saveState();
    }
  }
  function undo() {
    if (over || !snap || undoLeft < 1) return;
    var s = snap;
    bld[s.i] = -1;
    for (var k = 0; k < s.marks.length; k++) tpl[s.marks[k]] = 0;
    delete popAt[s.i];
    score = Math.max(0, score - s.pts);
    turn = s.turn; hand = s.hand; sel = s.sel;
    undoLeft--; snap = null; rev++; armedI = -1;
    api.score(score);
    api.haptic('light');
    saveState();
  }
  function reroll() {
    if (over || rerollLeft < 1) return;
    rerollLeft--;
    hand = drawHand();
    sel = 0; rev++; armedI = -1;
    api.haptic('light');
    saveState();
  }

  /* ---- layout ---- */
  function layout() {
    uiTop = cv.H - uiH;
    cell = Math.floor(Math.min((cv.W - 12) / BW, (uiTop - 12) / BH));
    if (cell > 52) cell = 52;
    if (cell < 14) cell = 14;
    bx = Math.floor((cv.W - cell * BW) / 2);
    by = Math.floor((uiTop - cell * BH) / 2);
    wgrad = g.createLinearGradient(0, 0, 0, cv.H);
    wgrad.addColorStop(0, SEA0);
    wgrad.addColorStop(1, SEA1);
    chipR = [
      { x: 10, y: uiTop + 5, w: 56, h: 24, id: 'undo' },
      { x: 72, y: uiTop + 5, w: 56, h: 24, id: 'reroll' }
    ];
    var cw = (cv.W - 24) / 2;
    cardR = [
      { x: 8, y: uiTop + 34, w: cw, h: uiH - 42 },
      { x: 16 + cw, y: uiTop + 34, w: cw, h: uiH - 42 }
    ];
  }
  cv.onResize = function () { layout(); };

  function cellAt(px, py) {
    var x = Math.floor((px - bx) / cell), y = Math.floor((py - by) / cell);
    if (x < 0 || y < 0 || x >= BW || y >= BH) return -1;
    return y * BW + x;
  }

  /* ---- drawing helpers ---- */
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function tri(x1, y1, x2, y2, x3, y3) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.lineTo(x3, y3);
    g.closePath();
  }
  function tree(x, y, s) {
    g.fillStyle = '#7a5230';
    g.fillRect(x - s * 0.06, y, s * 0.12, s * 0.22);
    g.fillStyle = '#3f7d44';
    tri(x - s * 0.28, y + s * 0.05, x + s * 0.28, y + s * 0.05, x, y - s * 0.42);
    g.fill();
    g.fillStyle = '#4c9152';
    tri(x - s * 0.22, y - s * 0.14, x + s * 0.22, y - s * 0.14, x, y - s * 0.55);
    g.fill();
  }

  /* charming little vector buildings */
  function drawBld(t, cx, cy, s, ghost) {
    var by2 = cy + s * 0.3, gr;
    if (t === 0) { /* House */
      g.fillStyle = '#f4e6c3';
      g.fillRect(cx - s * 0.28, by2 - s * 0.34, s * 0.56, s * 0.34);
      gr = g.createLinearGradient(cx, by2 - s * 0.62, cx, by2 - s * 0.3);
      gr.addColorStop(0, '#e2694a');
      gr.addColorStop(1, '#b04a33');
      g.fillStyle = gr;
      tri(cx - s * 0.36, by2 - s * 0.32, cx + s * 0.36, by2 - s * 0.32, cx, by2 - s * 0.64);
      g.fill();
      g.fillStyle = '#ffd98a';
      g.fillRect(cx - s * 0.18, by2 - s * 0.26, s * 0.12, s * 0.11);
      g.fillStyle = '#7c5133';
      g.fillRect(cx + s * 0.05, by2 - s * 0.2, s * 0.13, s * 0.2);
    } else if (t === 1) { /* Farm */
      rr(cx - s * 0.34, cy - s * 0.26, s * 0.68, s * 0.56, 3);
      g.fillStyle = '#bd8850';
      g.fill();
      g.strokeStyle = '#96683c';
      g.lineWidth = Math.max(1, s * 0.05);
      for (var r2 = 0; r2 < 3; r2++) {
        g.beginPath();
        g.moveTo(cx - s * 0.28, cy - s * 0.12 + r2 * s * 0.16);
        g.lineTo(cx + s * 0.28, cy - s * 0.12 + r2 * s * 0.16);
        g.stroke();
      }
      g.fillStyle = '#6fae4f';
      for (r2 = 0; r2 < 4; r2++) {
        g.beginPath();
        g.arc(cx - s * 0.21 + r2 * s * 0.14, cy - s * 0.2 + (r2 % 2) * s * 0.16, s * 0.045, 0, 7);
        g.fill();
      }
    } else if (t === 2) { /* Mill */
      g.fillStyle = '#d9c3a0';
      tri(cx - s * 0.2, by2, cx + s * 0.2, by2, cx, by2 - s * 0.52);
      g.fill();
      g.fillStyle = '#a0563e';
      g.beginPath();
      g.arc(cx, by2 - s * 0.5, s * 0.09, 0, 7);
      g.fill();
      var ang = ghost ? 0.6 : tG * 0.0012;
      g.strokeStyle = '#f6f0df';
      g.lineWidth = Math.max(1.5, s * 0.06);
      for (var bl = 0; bl < 4; bl++) {
        var a2 = ang + bl * Math.PI / 2;
        g.beginPath();
        g.moveTo(cx, by2 - s * 0.5);
        g.lineTo(cx + Math.cos(a2) * s * 0.34, by2 - s * 0.5 + Math.sin(a2) * s * 0.34);
        g.stroke();
      }
      g.fillStyle = '#6d4a30';
      g.fillRect(cx - s * 0.05, by2 - s * 0.16, s * 0.1, s * 0.16);
    } else if (t === 3) { /* Well */
      g.strokeStyle = '#8f979e';
      g.lineWidth = Math.max(2, s * 0.11);
      g.beginPath();
      g.arc(cx, cy + s * 0.1, s * 0.2, 0, 7);
      g.stroke();
      g.fillStyle = '#2b3944';
      g.beginPath();
      g.arc(cx, cy + s * 0.1, s * 0.13, 0, 7);
      g.fill();
      g.strokeStyle = '#7a5230';
      g.lineWidth = Math.max(1, s * 0.05);
      g.beginPath();
      g.moveTo(cx - s * 0.18, cy + s * 0.02);
      g.lineTo(cx - s * 0.18, cy - s * 0.28);
      g.moveTo(cx + s * 0.18, cy + s * 0.02);
      g.lineTo(cx + s * 0.18, cy - s * 0.28);
      g.stroke();
      g.fillStyle = '#b04a33';
      tri(cx - s * 0.28, cy - s * 0.24, cx + s * 0.28, cy - s * 0.24, cx, cy - s * 0.44);
      g.fill();
    } else if (t === 4) { /* Lumberjack cabin + log pile */
      g.fillStyle = '#8d6746';
      g.fillRect(cx - s * 0.3, by2 - s * 0.32, s * 0.44, s * 0.32);
      g.strokeStyle = '#75543a';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - s * 0.3, by2 - s * 0.21);
      g.lineTo(cx + s * 0.14, by2 - s * 0.21);
      g.moveTo(cx - s * 0.3, by2 - s * 0.11);
      g.lineTo(cx + s * 0.14, by2 - s * 0.11);
      g.stroke();
      g.fillStyle = '#5c4128';
      tri(cx - s * 0.36, by2 - s * 0.3, cx + s * 0.2, by2 - s * 0.3, cx - s * 0.08, by2 - s * 0.5);
      g.fill();
      g.fillStyle = '#c19161';
      g.beginPath();
      g.arc(cx + s * 0.26, by2 - s * 0.08, s * 0.08, 0, 7);
      g.arc(cx + s * 0.36, by2 - s * 0.08, s * 0.08, 0, 7);
      g.fill();
    } else if (t === 5) { /* Mine */
      g.fillStyle = '#8e979f';
      g.beginPath();
      g.arc(cx, by2, s * 0.32, Math.PI, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#31373d';
      g.beginPath();
      g.arc(cx, by2, s * 0.16, Math.PI, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#7a5230';
      g.fillRect(cx - s * 0.19, by2 - s * 0.2, s * 0.38, s * 0.05);
    } else if (t === 6) { /* Market stall */
      g.fillStyle = '#c19161';
      g.fillRect(cx - s * 0.3, by2 - s * 0.24, s * 0.6, s * 0.24);
      for (var st2 = 0; st2 < 4; st2++) {
        g.fillStyle = st2 % 2 ? '#f6f0df' : '#e2574c';
        g.fillRect(cx - s * 0.34 + st2 * s * 0.17, by2 - s * 0.42, s * 0.17, s * 0.13);
      }
      g.fillStyle = '#6fae4f';
      g.beginPath();
      g.arc(cx - s * 0.12, by2 - s * 0.18, s * 0.055, 0, 7);
      g.fill();
      g.fillStyle = '#e8b64c';
      g.beginPath();
      g.arc(cx + s * 0.1, by2 - s * 0.18, s * 0.055, 0, 7);
      g.fill();
    } else if (t === 7) { /* Temple */
      g.fillStyle = '#d8d2c0';
      g.fillRect(cx - s * 0.34, by2 - s * 0.06, s * 0.68, s * 0.06);
      g.fillStyle = '#efe9d6';
      for (var col = 0; col < 3; col++) g.fillRect(cx - s * 0.24 + col * s * 0.2, by2 - s * 0.32, s * 0.09, s * 0.26);
      tri(cx - s * 0.34, by2 - s * 0.3, cx + s * 0.34, by2 - s * 0.3, cx, by2 - s * 0.52);
      g.fill();
      g.strokeStyle = '#c2bba4';
      g.lineWidth = 1;
      tri(cx - s * 0.34, by2 - s * 0.3, cx + s * 0.34, by2 - s * 0.3, cx, by2 - s * 0.52);
      g.stroke();
    } else if (t === 8) { /* Tower */
      g.fillStyle = '#aab3bc';
      g.fillRect(cx - s * 0.16, by2 - s * 0.54, s * 0.32, s * 0.54);
      for (var te = 0; te < 3; te++) g.fillRect(cx - s * 0.18 + te * s * 0.14, by2 - s * 0.62, s * 0.08, s * 0.09);
      g.fillStyle = '#39424b';
      g.fillRect(cx - s * 0.03, by2 - s * 0.42, s * 0.06, s * 0.14);
      g.fillStyle = '#8d959d';
      g.fillRect(cx - s * 0.16, by2 - s * 0.08, s * 0.32, s * 0.08);
    } else { /* Statue */
      g.fillStyle = '#cfc8b4';
      g.fillRect(cx - s * 0.22, by2 - s * 0.08, s * 0.44, s * 0.08);
      g.fillRect(cx - s * 0.14, by2 - s * 0.22, s * 0.28, s * 0.14);
      g.fillStyle = '#e8b64c';
      tri(cx - s * 0.1, by2 - s * 0.22, cx + s * 0.1, by2 - s * 0.22, cx, by2 - s * 0.46);
      g.fill();
      g.beginPath();
      g.arc(cx, by2 - s * 0.5, s * 0.07, 0, 7);
      g.fill();
    }
  }

  /* ---- render ---- */
  function draw() {
    var W = cv.W, H = cv.H, i, x, y, px, py;
    g.fillStyle = wgrad;
    g.fillRect(0, 0, W, H);

    /* shallow water halo around the island (static) */
    g.fillStyle = 'rgba(255,255,255,0.09)';
    for (i = 0; i < shallow.length; i++) {
      x = shallow[i] % BW; y = (shallow[i] / BW) | 0;
      rr(bx + x * cell + 1, by + y * cell + 1, cell - 2, cell - 2, 6);
      g.fill();
    }
    /* animated two-tone shoreline shimmer */
    if (!low) {
      for (i = 0; i < edges.length; i++) {
        var e = edges[i];
        var a1 = 0.10 + 0.10 * Math.sin(tG * 0.0022 + e.x * 1.4 + e.y * 2.1 + i * 0.7);
        var a0 = 0.08 + 0.08 * Math.sin(tG * 0.0017 + e.x * 2.2 + e.y * 1.2 + 2);
        px = bx + e.x * cell; py = by + e.y * cell;
        g.fillStyle = 'rgba(255,255,255,' + Math.max(0, a1).toFixed(3) + ')';
        if (e.s === 0) g.fillRect(px + cell * 0.15, py + 2, cell * 0.7, 3);
        else if (e.s === 2) g.fillRect(px + cell * 0.15, py + cell - 5, cell * 0.7, 3);
        else if (e.s === 1) g.fillRect(px + 2, py + cell * 0.15, 3, cell * 0.7);
        else g.fillRect(px + cell - 5, py + cell * 0.15, 3, cell * 0.7);
        g.fillStyle = 'rgba(140,220,235,' + Math.max(0, a0).toFixed(3) + ')';
        if (e.s === 0) g.fillRect(px + cell * 0.2, py + 6, cell * 0.6, 2);
        else if (e.s === 2) g.fillRect(px + cell * 0.2, py + cell - 9, cell * 0.6, 2);
        else if (e.s === 1) g.fillRect(px + 6, py + cell * 0.2, 2, cell * 0.6);
        else g.fillRect(px + cell - 9, py + cell * 0.2, 2, cell * 0.6);
      }
    }

    /* land tiles (fake 2.5D: darker side lip under each top) */
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      i = y * BW + x;
      if (!ter[i]) continue;
      var h0 = low ? 0 : hs[i];
      px = bx + x * cell; py = by + y * cell - h0;
      if (!low) {
        g.fillStyle = coast[i] ? SAND : SIDE;
        rr(px + 1, py + 5, cell - 2, cell - 2, 5);
        g.fill();
      }
      g.fillStyle = GRASS[(x * 7 + y * 13) % 3];
      rr(px + 1, py + 1, cell - 2, cell - 2, 5);
      g.fill();
      if (coast[i]) {
        g.strokeStyle = 'rgba(232,213,150,0.55)';
        g.lineWidth = 1.5;
        rr(px + 1.6, py + 1.6, cell - 3.2, cell - 3.2, 4);
        g.stroke();
      }
      if (ter[i] === 2) {
        tree(px + cell * 0.34, py + cell * 0.52, cell * 0.85);
        tree(px + cell * 0.66, py + cell * 0.66, cell * 0.7);
      } else if (ter[i] === 3) {
        g.fillStyle = '#98a1a8';
        tri(px + cell * 0.14, py + cell * 0.82, px + cell * 0.86, py + cell * 0.82, px + cell * 0.5, py + cell * 0.14);
        g.fill();
        g.fillStyle = '#7d868d';
        tri(px + cell * 0.5, py + cell * 0.14, px + cell * 0.86, py + cell * 0.82, px + cell * 0.56, py + cell * 0.82);
        g.fill();
        g.fillStyle = '#eef2f5';
        tri(px + cell * 0.4, py + cell * 0.34, px + cell * 0.6, py + cell * 0.34, px + cell * 0.5, py + cell * 0.14);
        g.fill();
      }
    }

    /* legality glow under preview cell */
    var pvI = armedI >= 0 ? armedI : hoverI;
    if (pvI >= 0 && !over) {
      var ok = legal(pvI);
      x = pvI % BW; y = (pvI / BW) | 0;
      px = bx + x * cell; py = by + y * cell - (low || !ter[pvI] ? 0 : hs[pvI]);
      var glow = 0.55 + (low ? 0 : 0.2 * Math.sin(tG * 0.008));
      g.strokeStyle = ok ? C.good : C.bad;
      g.lineWidth = 2.5;
      g.globalAlpha = glow;
      rr(px + 1, py + 1, cell - 2, cell - 2, 5);
      g.stroke();
      g.globalAlpha = 0.18;
      g.fillStyle = ok ? C.good : C.bad;
      rr(px + 1, py + 1, cell - 2, cell - 2, 5);
      g.fill();
      g.globalAlpha = 1;
    }

    /* buildings (with pop-in bounce) */
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      i = y * BW + x;
      if (!ter[i] || bld[i] < 0) continue;
      var cc = cellCenter(i), sc = 1;
      if (popAt[i] != null) {
        var u = (tG - popAt[i]) / 350;
        if (u >= 1) { delete popAt[i]; }
        else {
          u = Math.max(0, u);
          var q = u - 1;
          sc = 1 + 2.70158 * q * q * q + 1.70158 * q * q; /* easeOutBack */
          sc = Math.max(0.05, sc);
        }
      }
      drawBld(bld[i], cc.x, cc.y, cell * 0.92 * sc, false);
    }

    /* ghost preview + exact points badge (the core UX) */
    if (pvI >= 0 && !over && legal(pvI)) {
      var c2 = cellCenter(pvI);
      var bob = low ? 0 : 2 * Math.sin(tG * 0.006);
      g.globalAlpha = 0.72;
      drawBld(hand[sel], c2.x, c2.y - bob, cell * 0.92, true);
      g.globalAlpha = 1;
    }
    if (pvI >= 0 && !over) {
      var c3 = cellCenter(pvI);
      var okB = legal(pvI);
      var txt = okB ? '+' + previewFor(pvI) : '✕';
      g.font = 'bold 13px sans-serif';
      var tw = Math.max(30, g.measureText(txt).width + 16);
      var byy = c3.y - cell * 0.78;
      if (byy < 14) byy = c3.y + cell * 0.72;
      g.fillStyle = 'rgba(15,22,30,0.78)';
      rr(c3.x - tw / 2, byy - 11, tw, 21, 10);
      g.fill();
      g.fillStyle = okB ? C.good : C.bad;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, c3.x, byy + 0.5);
    }

    /* dust + floating score labels */
    if (!low) {
      for (i = parts.length - 1; i >= 0; i--) {
        var pp = parts[i], uu = pp.t / pp.life;
        if (uu >= 1) { parts.splice(i, 1); continue; }
        g.globalAlpha = 0.5 * (1 - uu);
        g.fillStyle = '#e2cf9a';
        g.beginPath();
        g.arc(pp.x + pp.vx * pp.t, pp.y + pp.vy * pp.t + 0.00006 * pp.t * pp.t, 2.6 * (1 - uu * 0.5), 0, 7);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    for (i = floats.length - 1; i >= 0; i--) {
      var ff = floats[i], fu = ff.t / 950;
      if (fu >= 1) { floats.splice(i, 1); continue; }
      g.globalAlpha = 1 - fu * fu;
      g.font = 'bold ' + Math.round(15 + cell * 0.1) + 'px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 3;
      g.strokeText(ff.txt, ff.x, ff.y - 40 * fu);
      g.fillStyle = C.good;
      g.fillText(ff.txt, ff.x, ff.y - 40 * fu);
    }
    g.globalAlpha = 1;

    /* slow day-night tint over the island */
    if (!low) {
      var na = 0.12 * 0.5 * (1 - Math.cos(tG * Math.PI * 2 / 80000));
      if (na > 0.005) {
        g.fillStyle = 'rgba(18,26,68,' + na.toFixed(3) + ')';
        g.fillRect(0, 0, W, uiTop);
      }
    }

    /* ---- bottom UI ---- */
    g.fillStyle = C.bg;
    g.fillRect(0, uiTop, W, uiH);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, uiTop, W, 1);

    /* chips: undo / reroll + turns left */
    for (i = 0; i < 2; i++) {
      var ch = chipR[i];
      var cnt = i === 0 ? undoLeft : rerollLeft;
      var on = !over && cnt > 0 && (i === 1 || !!snap);
      g.globalAlpha = on ? 1 : 0.35;
      g.fillStyle = C.panel;
      rr(ch.x, ch.y, ch.w, ch.h, 12);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      rr(ch.x, ch.y, ch.w, ch.h, 12);
      g.stroke();
      g.fillStyle = C.text;
      g.font = 'bold 12px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText((i === 0 ? '↶ ' : '⟳ ') + cnt, ch.x + ch.w / 2, ch.y + ch.h / 2 + 0.5);
      g.globalAlpha = 1;
    }
    g.fillStyle = C.muted;
    g.font = '12px sans-serif';
    g.textAlign = 'right';
    g.fillText(api.t('moves') + ': ' + (TURNS - turn), W - 12, uiTop + 17);

    /* hand cards */
    for (i = 0; i < 2; i++) {
      var cr = cardR[i], t3 = hand[i], B2 = BT[t3];
      g.fillStyle = C.panel;
      rr(cr.x, cr.y, cr.w, cr.h, 10);
      g.fill();
      g.strokeStyle = i === sel ? C.accent : 'rgba(255,255,255,0.07)';
      g.lineWidth = i === sel ? 2 : 1;
      rr(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2, 9);
      g.stroke();
      if (i === sel) {
        g.globalAlpha = 0.07;
        g.fillStyle = C.accent;
        rr(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2, 9);
        g.fill();
        g.globalAlpha = 1;
      }
      drawBld(t3, cr.x + 26, cr.y + cr.h / 2 - 2, 36, true);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 13px sans-serif';
      g.fillText(ru ? B2.ru : B2.en, cr.x + 48, cr.y + cr.h / 2 - 10);
      g.fillStyle = C.muted;
      g.font = '10px sans-serif';
      g.fillText(ru ? B2.hr : B2.he, cr.x + 48, cr.y + cr.h / 2 + 8);
    }

    /* first-turn hint */
    if (!placedOnce && !over) {
      g.fillStyle = C.muted;
      g.font = '11px sans-serif';
      g.textAlign = 'center';
      g.fillText(
        ru ? 'Выбери карту · коснись клетки дважды' : 'Pick a card · tap a tile twice to build',
        W / 2, uiTop - 8
      );
    }
  }

  /* ---- input ---- */
  function onDown(e) {
    if (over) return;
    var r = cv.canvas.getBoundingClientRect();
    var px = e.clientX - r.left, py = e.clientY - r.top, i, k;
    for (k = 0; k < chipR.length; k++) {
      var ch = chipR[k];
      if (px >= ch.x - 4 && px <= ch.x + ch.w + 4 && py >= ch.y - 4 && py <= ch.y + ch.h + 4) {
        if (ch.id === 'undo') undo(); else reroll();
        return;
      }
    }
    for (k = 0; k < 2; k++) {
      var cr = cardR[k];
      if (px >= cr.x && px <= cr.x + cr.w && py >= cr.y && py <= cr.y + cr.h) {
        if (sel !== k) { sel = k; api.haptic('light'); }
        return;
      }
    }
    i = cellAt(px, py);
    if (i < 0 || !ter[i]) { armedI = -1; return; }
    if (!legal(i)) { armedI = i; return; }
    if (e.pointerType === 'mouse' || armedI === i) place(i);
    else armedI = i;
  }
  function onMove(e) {
    if (e.pointerType !== 'mouse' || over) return;
    var r = cv.canvas.getBoundingClientRect();
    var i = cellAt(e.clientX - r.left, e.clientY - r.top);
    hoverI = (i >= 0 && ter[i]) ? i : -1;
  }
  function onLeave() { hoverI = -1; }
  function onKey(e) {
    if (over) return;
    var k = e.key, moved = false;
    if (k === '1') { sel = 0; }
    else if (k === '2') { sel = 1; }
    else if (k === 'r' || k === 'R' || k === 'к' || k === 'К') reroll();
    else if (k === 'u' || k === 'U' || k === 'г' || k === 'Г') undo();
    else if (k === 'ArrowLeft') { kx = Math.max(0, kx - 1); moved = true; }
    else if (k === 'ArrowRight') { kx = Math.min(BW - 1, kx + 1); moved = true; }
    else if (k === 'ArrowUp') { ky = Math.max(0, ky - 1); moved = true; }
    else if (k === 'ArrowDown') { ky = Math.min(BH - 1, ky + 1); moved = true; }
    else if (k === ' ' || k === 'Enter') {
      if (armedI >= 0 && legal(armedI)) place(armedI);
      e.preventDefault();
      return;
    } else return;
    if (moved) { armedI = ky * BW + kx; e.preventDefault(); }
  }
  cv.canvas.addEventListener('pointerdown', onDown);
  cv.canvas.addEventListener('pointermove', onMove);
  cv.canvas.addEventListener('pointerleave', onLeave);
  window.addEventListener('keydown', onKey);

  /* ---- main loop ---- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(50, ts - last);
    last = ts;
    if (paused) return;
    tG += dt;
    for (var i = 0; i < parts.length; i++) parts[i].t += dt;
    for (i = 0; i < floats.length; i++) floats[i].t += dt;
    draw();
  }

  layout();
  if (!tryLoad()) newGame();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      clearTimeout(endTimer);
      cv.canvas.removeEventListener('pointerdown', onDown);
      cv.canvas.removeEventListener('pointermove', onMove);
      cv.canvas.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});

/* test hook (node only; inert in browser) */
if (typeof module === 'object' && module.exports) {
  module.exports = { genIsland: genIsland, scorePlace: scorePlace, mulberry32: mulberry32, BW: BW, BH: BH, N: N };
}
})();
