/* Ludo — classic race vs 3 AI (you are red). MG game contract. */
(function () {
'use strict';

/* ===== pure game core (exported at bottom for scratch tests) ===== */
var START = [0, 13, 26, 39];                 // global track index of each player's start cell
var SAFE = { 0: 1, 8: 1, 13: 1, 21: 1, 26: 1, 34: 1, 39: 1, 47: 1 }; // 8 star cells
var HOME = 56;                               // relative pos: 0..50 track, 51..55 column, 56 home

function globalOf(p, r) { return (START[p] + r) % 52; }

// token indices of player p that may legally move with this roll
function movable(pos, p, roll) {
  var out = [];
  for (var i = 0; i < 4; i++) {
    var r = pos[p][i];
    if (r === -1) { if (roll === 6) out.push(i); }
    else if (r < HOME && r + roll <= HOME) out.push(i); // exact roll to finish
  }
  return out;
}

function enemiesAt(pos, p, gc) {
  var res = [];
  for (var q = 0; q < 4; q++) {
    if (q === p) continue;
    for (var j = 0; j < 4; j++) {
      var t = pos[q][j];
      if (t >= 0 && t <= 50 && globalOf(q, t) === gc) res.push({ p: q, i: j });
    }
  }
  return res;
}

// apply the move (mutates pos); returns {from, dest, captured:[{p,i}], finished}
function doMove(pos, p, i, roll) {
  var from = pos[p][i];
  var dest = from === -1 ? 0 : from + roll;
  pos[p][i] = dest;
  var captured = [];
  if (dest <= 50) {
    var gc = globalOf(p, dest);
    if (!SAFE[gc]) {
      var en = enemiesAt(pos, p, gc), cnt = [0, 0, 0, 0], k;
      for (k = 0; k < en.length; k++) cnt[en[k].p]++;
      for (k = 0; k < en.length; k++) if (cnt[en[k].p] === 1) { // singles only
        pos[en[k].p][en[k].i] = -1;
        captured.push(en[k]);
      }
    }
  }
  return { from: from, dest: dest, captured: captured, finished: dest === HOME };
}

// is a token of p at relative r threatened by an enemy within 6 behind?
function inDanger(pos, p, r) {
  if (r < 0 || r > 50) return false;
  var gc = globalOf(p, r);
  if (SAFE[gc]) return false;
  for (var q = 0; q < 4; q++) {
    if (q === p) continue;
    for (var j = 0; j < 4; j++) {
      var t = pos[q][j];
      if (t >= 0 && t <= 50) {
        var d = (gc - globalOf(q, t) + 52) % 52;
        if (d >= 1 && d <= 6) return true;
      }
    }
  }
  return false;
}

// heuristic: capture > escape danger > enter home column > advance furthest > leave base
function aiPick(pos, p, roll, moves) {
  var best = moves[0], bs = -1e9;
  for (var k = 0; k < moves.length; k++) {
    var i = moves[k], r = pos[p][i];
    var dest = r === -1 ? 0 : r + roll;
    var s = r === -1 ? -5 : r; // advance furthest; leaving base ranks last
    if (dest <= 50) {
      var gc = globalOf(p, dest);
      if (!SAFE[gc]) {
        var en = enemiesAt(pos, p, gc), cnt = [0, 0, 0, 0], m;
        for (m = 0; m < en.length; m++) cnt[en[m].p]++;
        for (m = 0; m < 4; m++) if (cnt[m] === 1) s += 10000; // capture!
        if (inDanger(pos, p, dest)) s -= 700;                 // avoid landing in danger
      } else s += 60;                                          // star = nice
    }
    if (inDanger(pos, p, r)) s += 4000;                        // escape danger
    if (dest >= 51) s += 1800;                                 // enter home column
    if (dest === HOME) s += 900;
    if (s > bs) { bs = s; best = i; }
  }
  return best;
}

/* ===== 15x15 board geometry ===== */
var TRACK = (function () {
  var t = [], i;
  for (i = 1; i <= 5; i++) t.push([i, 6]);
  for (i = 5; i >= 0; i--) t.push([6, i]);
  t.push([7, 0], [8, 0]);
  for (i = 1; i <= 5; i++) t.push([8, i]);
  for (i = 9; i <= 14; i++) t.push([i, 6]);
  t.push([14, 7], [14, 8]);
  for (i = 13; i >= 9; i--) t.push([i, 8]);
  for (i = 9; i <= 14; i++) t.push([8, i]);
  t.push([7, 14], [6, 14]);
  for (i = 13; i >= 9; i--) t.push([6, i]);
  for (i = 5; i >= 0; i--) t.push([i, 8]);
  t.push([0, 7], [0, 6]);
  return t; // 52 cells, clockwise; index 0 = red start (1,6)
})();
var HOMECOL = [
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]
];
var QUAD = [[0, 0], [9, 0], [9, 9], [0, 9]];
var HOMESPOT = [[6.15, 7], [7, 6.15], [7.85, 7], [7, 7.85]];
var TAU = 6.28319;

MG.register('ludo', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var cv = api.createCanvas(), g = cv.g;
  var PC = ['#e04a3a', '#3fae4a', '#eec33b', '#3a7fe0']; // classic token hues
  var PD = ['#96271c', '#256f2e', '#a3801b', '#1d54a3'];
  var NAMES = RU ? ['Красный', 'Зелёный', 'Жёлтый', 'Синий'] : ['Red', 'Green', 'Yellow', 'Blue'];
  var PIP = [[], [[0, 0]], [[-1, -1], [1, 1]], [[-1, -1], [0, 0], [1, 1]],
    [[-1, -1], [1, -1], [-1, 1], [1, 1]], [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]];

  var TB = 62, DH = 90;
  var B = 60, s = 4, ox = 0, oy = 0;
  var bcv = document.createElement('canvas');

  var pos, fin, hist, turn, sixes;
  var state = 'wait', msg = '', legal = [], chooseRoll = 0, chooseGen = 0;
  var rollVal = 6, rollFace = 6, rollT = 0, rollDur = 0, rollTick = 0;
  var anim = null, flashes = [];
  var hit0 = [null, null, null, null];
  var raf = 0, last = 0, paused = false, timers = [], queue = [];

  // tracked setTimeout that defers callbacks while paused
  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timers.indexOf(id);
      if (k >= 0) timers.splice(k, 1);
      if (paused) { queue.push(fn); return; }
      fn();
    }, ms);
    timers.push(id);
  }

  /* ---------- layout + static board prerender ---------- */
  function rr(b, x, y, w, h, r) {
    b.beginPath();
    b.moveTo(x + r, y);
    b.arcTo(x + w, y, x + w, y + h, r);
    b.arcTo(x + w, y + h, x, y + h, r);
    b.arcTo(x, y + h, x, y, r);
    b.arcTo(x, y, x + w, y, r);
    b.closePath();
  }

  function prerender() {
    var d = cv.dpr || 1, i, p, q;
    bcv.width = Math.max(2, Math.round(B * d));
    bcv.height = bcv.width;
    var b = bcv.getContext('2d');
    b.setTransform(d, 0, 0, d, 0, 0);
    b.fillStyle = C.panel;
    b.fillRect(0, 0, B, B);
    b.lineWidth = 1;
    b.strokeStyle = C.muted;
    for (i = 0; i < 52; i++) {
      var t = TRACK[i];
      b.globalAlpha = 1;
      b.fillStyle = C.bg;
      b.fillRect(t[0] * s, t[1] * s, s, s);
      b.globalAlpha = 0.35;
      b.strokeRect(t[0] * s + 0.5, t[1] * s + 0.5, s - 1, s - 1);
    }
    for (p = 0; p < 4; p++) {                       // colored home columns
      b.fillStyle = PC[p];
      for (i = 0; i < 5; i++) {
        var hc = HOMECOL[p][i];
        b.globalAlpha = 0.85;
        b.fillRect(hc[0] * s, hc[1] * s, s, s);
        b.globalAlpha = 0.3;
        b.strokeRect(hc[0] * s + 0.5, hc[1] * s + 0.5, s - 1, s - 1);
      }
      b.globalAlpha = 0.9;                          // colored start cell
      var sc = TRACK[START[p]];
      b.fillStyle = PC[p];
      b.fillRect(sc[0] * s, sc[1] * s, s, s);
    }
    b.globalAlpha = 1;
    b.textAlign = 'center';                          // stars on safe cells
    b.textBaseline = 'middle';
    b.font = Math.round(s * 0.62) + 'px sans-serif';
    for (var key in SAFE) {
      var gi = +key, cell = TRACK[gi];
      b.fillStyle = START.indexOf(gi) >= 0 ? 'rgba(255,255,255,0.85)' : C.muted;
      b.fillText('★', (cell[0] + 0.5) * s, (cell[1] + 0.55) * s);
    }
    for (p = 0; p < 4; p++) {                        // base quadrants
      q = QUAD[p];
      b.fillStyle = PC[p];
      b.fillRect(q[0] * s, q[1] * s, 6 * s, 6 * s);
      b.fillStyle = C.panel;
      rr(b, (q[0] + 1) * s, (q[1] + 1) * s, 4 * s, 4 * s, s * 0.35);
      b.fill();
      for (i = 0; i < 4; i++) {
        b.beginPath();
        b.arc((q[0] + 2 + (i % 2) * 2) * s, (q[1] + 2 + (i >> 1) * 2) * s, s * 0.6, 0, TAU);
        b.fillStyle = C.bg;
        b.fill();
        b.lineWidth = 2;
        b.strokeStyle = PC[p];
        b.stroke();
      }
    }
    b.fillStyle = C.panel;                           // center triangle square
    b.fillRect(6 * s, 6 * s, 3 * s, 3 * s);
    var tri = [[[6, 6], [6, 9]], [[6, 6], [9, 6]], [[9, 6], [9, 9]], [[6, 9], [9, 9]]];
    for (p = 0; p < 4; p++) {
      b.beginPath();
      b.moveTo(tri[p][0][0] * s, tri[p][0][1] * s);
      b.lineTo(tri[p][1][0] * s, tri[p][1][1] * s);
      b.lineTo(7.5 * s, 7.5 * s);
      b.closePath();
      b.fillStyle = PC[p];
      b.fill();
    }
    b.lineWidth = 2;
    b.strokeStyle = C.muted;
    b.globalAlpha = 0.5;
    b.strokeRect(1, 1, B - 2, B - 2);
    b.globalAlpha = 1;
  }

  function layout() {
    B = Math.max(60, Math.floor(Math.min(cv.W - 8, cv.H - TB - DH - 6)));
    s = B / 15;
    ox = (cv.W - B) / 2;
    oy = TB + Math.max(2, (cv.H - TB - DH - B) / 2);
    prerender();
  }
  cv.onResize = layout;

  /* ---------- coordinates ---------- */
  function relCoord(p, r) {
    if (r <= 50) { var t = TRACK[globalOf(p, r)]; return [t[0], t[1]]; }
    if (r <= 55) { var h = HOMECOL[p][r - 51]; return [h[0], h[1]]; }
    return [HOMESPOT[p][0], HOMESPOT[p][1]];
  }
  function baseSpot(p, i) {
    var q = QUAD[p];
    return [q[0] + 1.5 + (i % 2) * 2, q[1] + 1.5 + (i >> 1) * 2];
  }
  function tokenCoord(p, i) {
    var r = pos[p][i];
    return r === -1 ? baseSpot(p, i) : relCoord(p, r);
  }
  function px(c) { return [ox + (c[0] + 0.5) * s, oy + (c[1] + 0.5) * s]; }

  /* ---------- state & flow ---------- */
  function newGame() {
    pos = [[-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1], [-1, -1, -1, -1]];
    fin = [];
    hist = [[], [], [], []];
    turn = 0;
    sixes = 0;
  }
  function saveState() {
    if (state === 'over') return;
    api.save({ v: 1, pos: pos, fin: fin, hist: hist, turn: turn, sixes: sixes });
  }
  function loadState() {
    var d = api.load();
    if (!d || d.v !== 1 || !d.pos || d.pos.length !== 4) return false;
    for (var p = 0; p < 4; p++) {
      if (!d.pos[p] || d.pos[p].length !== 4) return false;
      for (var i = 0; i < 4; i++) {
        var r = d.pos[p][i];
        if (typeof r !== 'number' || r < -1 || r > HOME) return false;
      }
    }
    fin = d.fin || [];
    if (fin.indexOf(0) >= 0 || fin.length >= 3) return false;
    pos = d.pos;
    hist = (d.hist && d.hist.length === 4) ? d.hist : [[], [], [], []];
    turn = d.turn | 0;
    if (turn < 0 || turn > 3 || fin.indexOf(turn) >= 0) turn = 0;
    sixes = d.sixes | 0;
    return true;
  }
  function homeCount(p) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (pos[p][i] === HOME) n++;
    return n;
  }

  function beginTurn() {
    if (state === 'over') return;
    if (turn === 0) { state = 'idle'; msg = api.t('your_turn'); }
    else { state = 'wait'; msg = api.t('thinking'); later(startRoll, api.lowEnd ? 200 : 380); }
  }
  function beginSame() {
    if (state === 'over') return;
    if (turn === 0) { state = 'idle'; msg = RU ? 'Ещё бросок!' : 'Roll again!'; }
    else { state = 'wait'; later(startRoll, api.lowEnd ? 140 : 280); }
  }
  function nextTurn() {
    if (state === 'over') return;
    sixes = 0;
    var gc = 0;
    do { turn = (turn + 1) % 4; } while (fin.indexOf(turn) >= 0 && ++gc < 8);
    saveState();
    beginTurn();
  }

  function startRoll() {
    if (state === 'over') return;
    state = 'rolling';
    rollVal = 1 + ((Math.random() * 6) | 0);
    rollT = 0;
    rollTick = 0;
    rollDur = turn === 0 ? (api.lowEnd ? 280 : 520) : (api.lowEnd ? 150 : 300);
    msg = NAMES[turn];
  }

  function handleRoll(v) {
    var p = turn;
    hist[p].push(v);
    if (hist[p].length > 3) hist[p].shift();
    if (v === 6) sixes++; else sixes = 0;
    if (sixes >= 3) {                                 // three 6s => turn forfeited
      sixes = 0;
      msg = RU ? 'Три шестёрки — ход сгорает!' : 'Three sixes — turn lost!';
      if (p === 0) api.haptic('error');
      state = 'wait';
      later(nextTurn, 900);
      return;
    }
    legal = movable(pos, p, v);
    if (!legal.length) {
      msg = RU ? 'Нет хода' : 'No moves';
      state = 'wait';
      later(v === 6 ? beginSame : nextTurn, 650);
      return;
    }
    if (p !== 0) {
      var mi = aiPick(pos, p, v, legal);
      state = 'wait';
      later(function () { startMove(p, mi, v); }, api.lowEnd ? 120 : 240);
      return;
    }
    if (legal.length === 1) {
      state = 'wait';
      later(function () { startMove(0, legal[0], v); }, 320);
      return;
    }
    chooseRoll = v;                                   // player picks a token
    state = 'choosing';
    msg = RU ? 'Выбери фишку' : 'Pick a token';
    var gen = ++chooseGen;
    later(function () {                               // auto-move after 4s
      if (state === 'choosing' && gen === chooseGen)
        startMove(0, aiPick(pos, 0, chooseRoll, legal), chooseRoll);
    }, 4000);
  }

  function startMove(p, i, v) {
    if (state === 'over') return;
    state = 'moving';
    var from = pos[p][i];
    var path = [];
    if (from === -1) path.push(relCoord(p, 0));
    else for (var r = from + 1; r <= from + v; r++) path.push(relCoord(p, r));
    anim = {
      p: p, i: i, v: v, path: path, seg: 0, t: 0,
      ms: p === 0 ? (api.lowEnd ? 80 : 115) : (api.lowEnd ? 55 : 75),
      start: from === -1 ? baseSpot(p, i) : relCoord(p, from)
    };
  }

  function commitMove(a) {
    var res = doMove(pos, a.p, a.i, a.v);
    if (res.captured.length) {
      api.haptic('medium');
      var cc = relCoord(a.p, res.dest);
      flashes.push({ x: cc[0], y: cc[1], t: 0 });
    }
    api.score(homeCount(0) * 50);
    if (res.finished && a.p === 0 && homeCount(0) < 4) api.haptic('light');
    if (homeCount(a.p) === 4 && fin.indexOf(a.p) < 0) {
      fin.push(a.p);
      if (a.p === 0) { endGame(fin.length - 1); return; }
      if (fin.length === 3 && fin.indexOf(0) < 0) { endGame(3); return; }
      msg = NAMES[a.p] + ' 🏁';
      saveState();
      later(nextTurn, 600);
      return;
    }
    saveState();
    if (a.v === 6) beginSame(); else nextTurn();
  }

  function endGame(place) {                            // place 0..3
    state = 'over';
    anim = null;
    legal = [];
    var score = [200, 120, 60, 20][place];
    msg = place === 0 ? api.t('you_win') :
      place === 3 ? api.t('you_lose') : (RU ? 'Место: ' : 'Place: ') + (place + 1);
    api.save(null);
    api.score(score);
    api.haptic(place === 0 ? 'success' : place === 3 ? 'error' : 'medium');
    later(function () { api.gameOver(score, { win: place === 0 }); }, 1000);
  }

  /* ---------- input ---------- */
  function onDown(e) {
    if (paused || state === 'over' || turn !== 0) return;
    if (state === 'idle') { startRoll(); return; }
    if (state !== 'choosing') return;
    var rct = cv.canvas.getBoundingClientRect();
    var x = e.clientX - rct.left, y = e.clientY - rct.top;
    var best = -1, bd = 1e9;
    for (var k = 0; k < legal.length; k++) {
      var h = hit0[legal[k]];
      if (!h) continue;
      var d = (h[0] - x) * (h[0] - x) + (h[1] - y) * (h[1] - y);
      if (d < bd) { bd = d; best = legal[k]; }
    }
    if (best >= 0 && bd < s * s * 0.95) {
      chooseGen++;
      startMove(0, best, chooseRoll);
    }
  }
  cv.canvas.addEventListener('pointerdown', onDown);

  function onKey(e) {
    if (paused || state === 'over' || turn !== 0) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'idle') { startRoll(); e.preventDefault(); }
      return;
    }
    var n = parseInt(e.key, 10);
    if (state === 'choosing' && n >= 1 && n <= 4 && legal.indexOf(n - 1) >= 0) {
      chooseGen++;
      startMove(0, n - 1, chooseRoll);
    }
  }
  window.addEventListener('keydown', onKey);

  /* ---------- update & draw ---------- */
  function update(dt) {
    if (state === 'rolling') {
      rollT += dt;
      rollTick += dt;
      if (rollTick > 70) { rollTick = 0; rollFace = 1 + ((Math.random() * 6) | 0); }
      if (rollT >= rollDur) { rollFace = rollVal; handleRoll(rollVal); }
    }
    if (anim) {
      anim.t += dt / anim.ms;
      while (anim && anim.t >= 1) {
        if (anim.seg >= anim.path.length - 1) {
          var a = anim;
          anim = null;
          commitMove(a);
        } else { anim.t -= 1; anim.seg++; }
      }
    }
    for (var i = flashes.length - 1; i >= 0; i--) {
      flashes[i].t += dt;
      if (flashes[i].t > 420) flashes.splice(i, 1);
    }
  }

  function drawToken(x, y, p, rad) {
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fillStyle = PC[p];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = PD[p];
    g.stroke();
    g.beginPath();
    g.arc(x - rad * 0.28, y - rad * 0.32, rad * 0.3, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fill();
  }

  function drawTokens(now) {
    var groups = {}, p, i, k, key;
    for (p = 0; p < 4; p++) for (i = 0; i < 4; i++) {
      if (anim && anim.p === p && anim.i === i) continue;
      var c = tokenCoord(p, i);
      key = c[0] + '_' + c[1];
      (groups[key] || (groups[key] = [])).push({ p: p, i: i, c: c });
    }
    for (key in groups) {
      var arr = groups[key], n = arr.length;
      for (k = 0; k < n; k++) {
        var e = arr[k], cc = px(e.c);
        var x = cc[0] + (n > 1 ? (k - (n - 1) / 2) * s * 0.3 : 0);
        var rad = s * (n > 1 ? 0.29 : 0.37) * (pos[e.p][e.i] === HOME ? 0.75 : 1);
        drawToken(x, cc[1], e.p, rad);
        if (e.p === 0) hit0[e.i] = [x, cc[1]];
      }
    }
    if (anim) {                                       // moving token, cell-by-cell hops
      var fr = anim.seg === 0 ? anim.start : anim.path[anim.seg - 1];
      var to = anim.path[anim.seg];
      var tt = Math.min(1, anim.t);
      var pp = px([fr[0] + (to[0] - fr[0]) * tt, fr[1] + (to[1] - fr[1]) * tt]);
      var hop = Math.sin(tt * Math.PI) * s * 0.45;
      drawToken(pp[0], pp[1] - hop, anim.p, s * 0.4);
      if (anim.p === 0) hit0[anim.i] = pp;
    }
    if (state === 'choosing') {                       // highlight tappable tokens
      var pul = 2 + Math.sin(now / 140) * 1.6;
      g.lineWidth = 3;
      g.strokeStyle = C.accent;
      for (k = 0; k < legal.length; k++) {
        var h = hit0[legal[k]];
        if (!h) continue;
        g.beginPath();
        g.arc(h[0], h[1], s * 0.5 + pul, 0, TAU);
        g.stroke();
      }
    }
  }

  function drawTop(now) {
    var w4 = cv.W / 4;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (var p = 0; p < 4; p++) {
      var cx = w4 * p + w4 / 2;
      if (p === turn && state !== 'over') {
        g.beginPath();
        g.arc(cx, 22, 17 + Math.sin(now / 200) * 1.5, 0, TAU);
        g.strokeStyle = C.accent;
        g.lineWidth = 2;
        g.stroke();
      }
      g.beginPath();
      g.arc(cx, 22, 14, 0, TAU);
      g.fillStyle = PC[p];
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = PD[p];
      g.stroke();
      g.font = '14px sans-serif';
      g.fillText(p === 0 ? '🙂' : '🤖', cx, 23);
      var fi = fin.indexOf(p);
      if (fi >= 0) {
        g.font = '12px sans-serif';
        g.fillText(['🥇', '🥈', '🥉', '🏁'][fi], cx + 17, 11);
      }
      g.font = '11px sans-serif';                     // dice history
      g.fillStyle = C.muted;
      g.fillText(hist[p].join(' '), cx, 44);
      for (var i = 0; i < 4; i++) {                   // home pips
        g.beginPath();
        g.arc(cx - 10.5 + i * 7, 55, 2.4, 0, TAU);
        if (pos[p][i] === HOME) { g.fillStyle = PC[p]; g.fill(); }
        else {
          g.globalAlpha = 0.5;
          g.lineWidth = 1;
          g.strokeStyle = C.muted;
          g.stroke();
          g.globalAlpha = 1;
        }
      }
    }
  }

  function drawBottom(now) {
    var top = oy + B;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 14px sans-serif';
    g.fillStyle = C.text;
    g.fillText(msg, cv.W / 2, top + 13);
    var D = 46, dx = cv.W / 2 - D / 2, dy = top + 24;
    if (state === 'idle' && turn === 0) {
      g.globalAlpha = 0.5 + 0.4 * Math.sin(now / 200);
      g.lineWidth = 4;
      g.strokeStyle = C.accent;
      rr(g, dx - 4, dy - 4, D + 8, D + 8, 12);
      g.stroke();
      g.globalAlpha = 1;
      g.font = '12px sans-serif';
      g.fillStyle = C.muted;
      g.fillText('👆 ' + api.t('tap_now'), cv.W / 2, dy + D + 11);
    }
    rr(g, dx, dy, D, D, 10);
    g.fillStyle = C.panel2;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = PC[turn];
    g.stroke();
    var pips = PIP[state === 'rolling' ? rollFace : rollVal];
    g.fillStyle = C.text;
    for (var k = 0; k < pips.length; k++) {
      g.beginPath();
      g.arc(dx + D / 2 + pips[k][0] * D * 0.26, dy + D / 2 + pips[k][1] * D * 0.26, D * 0.07, 0, TAU);
      g.fill();
    }
  }

  function draw(now) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.drawImage(bcv, ox, oy, B, B);
    drawTop(now);
    drawTokens(now);
    for (var i = 0; i < flashes.length; i++) {        // capture flashes
      var f = flashes[i], q = f.t / 420, pp = px([f.x, f.y]);
      g.globalAlpha = Math.max(0, 1 - q);
      g.lineWidth = 3;
      g.strokeStyle = C.bad;
      g.beginPath();
      g.arc(pp[0], pp[1], s * (0.35 + q * 0.9), 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
    drawBottom(now);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = last ? Math.min(80, ts - last) : 16;
    last = ts;
    update(dt);
    draw(ts);
  }

  layout();
  if (!loadState()) newGame();
  api.score(homeCount(0) * 50);
  beginTurn();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      queue.length = 0;
      window.removeEventListener('keydown', onKey);
      cv.canvas.removeEventListener('pointerdown', onDown);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () {
      paused = false;
      last = 0;
      var q = queue;
      queue = [];
      for (var i = 0; i < q.length; i++) q[i]();
    }
  };
});

/* test hook (no-op in browser) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    START: START, SAFE: SAFE, HOME: HOME, TRACK: TRACK,
    globalOf: globalOf, movable: movable, doMove: doMove,
    inDanger: inDanger, aiPick: aiPick
  };
}
})();
