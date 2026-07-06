/* Backgammon — light checkers (you, moving counterclockwise) vs dark AI. MG game module. */
(function () {
'use strict';

/* ============ pure rules engine (exercised by tests via factory._E) ============
   State: { b: Array(24) (+n = n player checkers, -n = n AI), bar:[p,a], off:[p,a] }.
   Player side = +1, home = points 0..5 (points 1..6), moves 23 -> 0.
   AI side = -1, home = 18..23, moves 0 -> 23.
   Move: { f: origin point | 24 (bar), t: dest point | -1 (bear-off), d: die }. */

function startState() {
  var b = [], i;
  for (i = 0; i < 24; i++) b.push(0);
  b[23] = 2; b[12] = 5; b[7] = 3; b[5] = 5;
  b[0] = -2; b[11] = -5; b[16] = -3; b[18] = -5;
  return { b: b, bar: [0, 0], off: [0, 0] };
}

function cloneS(s) { return { b: s.b.slice(), bar: s.bar.slice(), off: s.off.slice() }; }

function allHome(st, side) {
  var i;
  if (side > 0) {
    if (st.bar[0]) return false;
    for (i = 6; i < 24; i++) if (st.b[i] > 0) return false;
  } else {
    if (st.bar[1]) return false;
    for (i = 0; i < 18; i++) if (st.b[i] < 0) return false;
  }
  return true;
}

/* no own checkers farther from bear-off than point f (within home) */
function isHighest(st, side, f) {
  var i;
  if (side > 0) { for (i = f + 1; i < 6; i++) if (st.b[i] > 0) return false; }
  else { for (i = 18; i < f; i++) if (st.b[i] < 0) return false; }
  return true;
}

/* legal single-die moves (bar re-entry forced; bear-off exact-or-higher-from-highest) */
function movesFor(st, side, die) {
  var out = [], b = st.b, t, f, pip, home;
  if (st.bar[side > 0 ? 0 : 1] > 0) {
    t = side > 0 ? 24 - die : die - 1;
    if (side * b[t] >= -1) out.push({ f: 24, t: t });
    return out;
  }
  home = allHome(st, side);
  for (f = 0; f < 24; f++) {
    if (side * b[f] <= 0) continue;
    t = f - side * die;
    if (t >= 0 && t < 24) {
      if (side * b[t] >= -1) out.push({ f: f, t: t });
    } else if (home) {
      pip = side > 0 ? f + 1 : 24 - f;
      if (pip === die || (pip < die && isHighest(st, side, f))) out.push({ f: f, t: -1 });
    }
  }
  return out;
}

/* mutates st; returns true when an opposing blot was hit to the bar */
function doMove(st, side, m) {
  var me = side > 0 ? 0 : 1, hit = false;
  if (m.f === 24) st.bar[me]--; else st.b[m.f] -= side;
  if (m.t === -1) st.off[me]++;
  else {
    if (st.b[m.t] === -side) { st.b[m.t] = 0; st.bar[1 - me]++; hit = true; }
    st.b[m.t] += side;
  }
  return hit;
}

/* All maximal move sequences for a roll. Enforces maximum-dice-usage and the
   higher-die rule (when both dice are individually playable but not together). */
function turnSeqs(st, side, dice) {
  var leaves = [], max = 0, orders, o, i;
  if (dice.length === 2 && dice[0] !== dice[1]) orders = [[dice[0], dice[1]], [dice[1], dice[0]]];
  else orders = [dice.slice()];
  function rec(s, ds, path) {
    var mv, k, s2, m;
    if (ds.length && leaves.length < 20000) {
      mv = movesFor(s, side, ds[0]);
      if (mv.length) {
        for (k = 0; k < mv.length; k++) {
          s2 = cloneS(s);
          m = { f: mv[k].f, t: mv[k].t, d: ds[0] };
          m.hit = doMove(s2, side, m);
          rec(s2, ds.slice(1), path.concat([m]));
        }
        return;
      }
    }
    if (path.length > max) max = path.length;
    leaves.push({ ms: path, st: s });
  }
  for (o = 0; o < orders.length; o++) rec(cloneS(st), orders[o], []);
  var list = [];
  for (i = 0; i < leaves.length; i++) if (leaves[i].ms.length === max) list.push(leaves[i]);
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    var hi = dice[0] > dice[1] ? dice[0] : dice[1], hiL = [];
    for (i = 0; i < list.length; i++) if (list[i].ms[0].d === hi) hiL.push(list[i]);
    if (hiL.length) list = hiL;
  }
  return { max: max, list: list };
}

function pips(st, side) {
  var p, i;
  if (side > 0) { p = st.bar[0] * 25; for (i = 0; i < 24; i++) if (st.b[i] > 0) p += st.b[i] * (i + 1); }
  else { p = st.bar[1] * 25; for (i = 0; i < 24; i++) if (st.b[i] < 0) p -= st.b[i] * (24 - i); }
  return p;
}

/* direct shots at own blot on point i (+ entry-from-bar shots) */
function shots(st, side, i) {
  var n = 0, d, j;
  for (d = 1; d <= 6; d++) { j = i - side * d; if (j >= 0 && j < 24 && st.b[j] * side < 0) n++; }
  if ((side > 0 ? st.bar[1] : st.bar[0]) > 0 && (side > 0 ? i < 6 : i >= 18)) n++;
  return n;
}

/* heuristic: race + bear-off progress + bar + points made / home board / anchors
   - blot exposure. Higher = better for `side`. */
function evalSt(st, side) {
  var me = side > 0 ? 0 : 1, op = 1 - me, s, i, v, homePts = 0;
  if (st.off[me] === 15) return 1e6;
  if (st.off[op] === 15) return -1e6;
  s = pips(st, -side) - pips(st, side);
  s += (st.off[me] - st.off[op]) * 28;
  s += (st.bar[op] - st.bar[me]) * 16;
  for (i = 0; i < 24; i++) {
    v = st.b[i] * side;
    if (v >= 2) {
      s += 4;
      if (side > 0 ? i < 6 : i >= 18) { s += 5; homePts++; }
      else if (side > 0 ? i >= 18 : i < 6) s += 5;
      if (v > 4) s -= (v - 4) * 2;
    } else if (v === 1) s -= 5 + 3 * shots(st, side, i);
    else if (v === -1) s += 2 + 1.5 * shots(st, -side, i);
  }
  s += homePts * 3 * st.bar[op];
  return s;
}

/* AI: enumerate maximal sequences, dedupe by resulting position, pick best eval */
function aiPick(st, dice) {
  var T = turnSeqs(st, -1, dice);
  if (!T.max) return null;
  var seen = {}, best = null, bestV = -Infinity, i, q, k, v;
  for (i = 0; i < T.list.length && i < 900; i++) {
    q = T.list[i];
    k = q.st.b.join(',') + '|' + q.st.bar.join(',') + '|' + q.st.off.join(',');
    if (seen[k]) continue;
    seen[k] = 1;
    v = evalSt(q.st, -1);
    if (v > bestV) { bestV = v; best = q; }
  }
  return best.ms;
}

/* ============ game module ============ */

function game(container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var cv = api.createCanvas(), g = cv.g;
  var destroyed = false, paused = false, timers = {}, tseq = 0, raf = 0;

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
  function clearTimers() { for (var k in timers) clearTimeout(timers[k]); timers = {}; }
  function nowMs() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function r6() { return 1 + Math.floor(Math.random() * 6); }

  /* ---- derived colors ---- */
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
  var woodBg = blend(C.panel, '#6b4a28', 0.35);
  var frameC = blend(woodBg, '#000000', 0.4);
  var triA = blend(C.accent, C.panel, 0.6);
  var triB = blend(C.panel2, '#000000', 0.3);
  var barBg = blend(C.panel, '#000000', 0.42);
  var lightC = blend('#ffffff', C.panel, 0.15);
  var darkC = blend('#000000', C.panel2, 0.3);
  var darkHi = blend('#ffffff', darkC, 0.62);
  var dieFace = blend('#ffffff', C.panel, 0.06);
  var dieDark = blend('#000000', C.panel2, 0.25);

  /* ---- geometry ---- */
  var TOP = 34, bx, by, bw, bh, pw, barW, trayW, triH, midY, rr, sp, rollRect;
  function layout() {
    bx = 6; by = TOP; bw = cv.W - 12; bh = cv.H - TOP - 8;
    trayW = Math.max(24, Math.floor(bw * 0.085));
    barW = Math.max(20, Math.floor(bw * 0.07));
    pw = (bw - trayW - barW) / 12;
    triH = bh * 0.42;
    midY = by + bh / 2;
    rr = Math.min(pw * 0.46, triH / 9.8);
    sp = rr * 1.9;
    rollRect = { x: cv.W / 2 - 56, y: midY - 20, w: 112, h: 40 };
  }
  cv.onResize = function () { layout(); };
  function colX(c) { return bx + c * pw + (c >= 6 ? barW : 0); }
  function ptCol(i) { return i < 12 ? 11 - i : i - 12; }
  function trayX() { return bx + 12 * pw + barW; }
  function stackPos(i, k) {
    var x = colX(ptCol(i)) + pw / 2;
    return { x: x, y: i >= 12 ? by + rr + 2 + k * sp : by + bh - rr - 2 - k * sp };
  }
  function barPos(side, k) {
    var x = bx + 6 * pw + barW / 2;
    return { x: x, y: side > 0 ? midY + rr * 1.7 + k * rr * 1.75 : midY - rr * 1.7 - k * rr * 1.75 };
  }
  function offH() { return Math.max(4, Math.min(rr * 0.9, (bh / 2 - 14) / 15 - 1)); }
  function offPos(me, k) {
    var hh = offH(), x = trayX() + trayW / 2;
    return me === 0 ? { x: x, y: by + bh - 5 - hh / 2 - k * (hh + 1) } : { x: x, y: by + 5 + hh / 2 + k * (hh + 1) };
  }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  /* ---- state ---- */
  var S, turn, phase, faces, rem, dOwner, T, sel, dests, origins, over;
  var rolling = null, anim = null, banner = null, lastT = nowMs();

  function setDice(d1, d2, owner) {
    var vs = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2], i;
    faces = []; rem = []; dOwner = owner;
    for (i = 0; i < vs.length; i++) { faces.push({ v: vs[i], u: false }); rem.push(vs[i]); }
  }
  function useDie(d) {
    var i = rem.indexOf(d);
    if (i >= 0) rem.splice(i, 1);
    for (i = 0; i < faces.length; i++) if (!faces[i].u && faces[i].v === d) { faces[i].u = true; break; }
  }
  function showBanner(txt) { banner = { txt: txt, until: nowMs() + 1500 }; }
  function saveNow() {
    if (over) return;
    api.save({ b: S.b, br: S.bar, of: S.off, t: turn, r: turn === 1 ? rem.slice() : [] });
  }
  function validSave(s) {
    if (!s || !s.b || s.b.length !== 24 || !s.br || s.br.length !== 2 || !s.of || s.of.length !== 2) return false;
    if (s.t !== 1 && s.t !== -1) return false;
    var p = 0, a = 0, i, v;
    for (i = 0; i < 24; i++) { v = s.b[i]; if (typeof v !== 'number' || v !== (v | 0)) return false; if (v > 0) p += v; else a -= v; }
    for (i = 0; i < 2; i++) { v = s.br[i]; if (v !== (v | 0) || v < 0) return false; v = s.of[i]; if (v !== (v | 0) || v < 0) return false; }
    p += s.br[0] + s.of[0]; a += s.br[1] + s.of[1];
    if (p !== 15 || a !== 15 || s.of[0] >= 15 || s.of[1] >= 15) return false;
    if (s.r) { if (s.r.length > 4) return false; for (i = 0; i < s.r.length; i++) { v = s.r[i]; if (!(v >= 1 && v <= 6)) return false; } }
    return true;
  }

  /* ---- turn flow ---- */
  function computeOrigins() {
    origins = {};
    for (var i = 0; i < T.list.length; i++) origins[T.list[i].ms[0].f] = 1;
  }
  function computeDests(o) {
    dests = {};
    var s, k, ms, pos, m, key, chain;
    for (s = 0; s < T.list.length; s++) {
      ms = T.list[s].ms; pos = o; chain = [];
      for (k = 0; k < ms.length; k++) {
        m = ms[k];
        if (m.f !== pos) break;
        chain.push(m);
        key = m.t === -1 ? 'off' : m.t;
        if (!dests[key] || dests[key].length > chain.length) dests[key] = chain.slice();
        if (m.t === -1) break;
        pos = m.t;
      }
    }
  }
  function setSel(o) { sel = o; computeDests(o); }
  function autoSel() {
    var ks = [], k;
    for (k in origins) ks.push(k);
    if (ks.length === 1) setSel(ks[0] === '24' ? 24 : +ks[0]);
  }

  function doRoll(ai) {
    if (rolling) return;
    api.haptic('light');
    phase = 'rolling';
    sel = null; dests = null;
    rolling = { until: nowMs() + 520, ai: ai, cb: function () {
      setDice(r6(), r6(), ai ? -1 : 1);
      if (ai) aiMoves(); else beginPlayerMove();
    } };
  }

  function beginPlayerMove() {
    T = turnSeqs(S, 1, rem);
    if (!T.max) {
      showBanner(RU ? 'Нет ходов — пропуск' : 'No moves — skip');
      phase = 'wait'; turn = -1; saveNow();
      later(aiTurn, 1200);
      return;
    }
    phase = 'move'; sel = null; dests = null;
    computeOrigins(); autoSel(); saveNow();
  }

  function playChain(chain) {
    sel = null; dests = null; phase = 'anim';
    var k = 0;
    function hop() {
      var m = chain[k];
      animate(m, 1, function () {
        var hit = doMove(S, 1, m);
        useDie(m.d);
        if (hit) api.haptic('medium');
        else if (m.t === -1) api.haptic('light');
        api.score(S.off[0] * 10);
        if (S.off[0] === 15) return endGame(true);
        k++;
        if (k < chain.length) hop();
        else afterPlayerMove();
      });
    }
    hop();
  }

  function afterPlayerMove() {
    if (rem.length) {
      T = turnSeqs(S, 1, rem);
      if (T.max > 0) {
        phase = 'move'; sel = null; dests = null;
        computeOrigins(); autoSel(); saveNow();
        return;
      }
      showBanner(RU ? 'Нет ходов' : 'No moves');
    }
    phase = 'wait'; turn = -1; saveNow();
    later(aiTurn, rem.length ? 1100 : 500);
  }

  function aiTurn() {
    if (over) return;
    turn = -1;
    doRoll(true);
  }

  function aiMoves() {
    var seq = aiPick(S, rem);
    if (!seq) {
      showBanner(RU ? 'У ИИ нет ходов' : 'AI has no moves');
      phase = 'wait';
      later(playerTurn, 1200);
      return;
    }
    phase = 'ai';
    var k = 0;
    function hop() {
      if (over || destroyed) return;
      var m = seq[k];
      animate(m, -1, function () {
        var hit = doMove(S, -1, m);
        useDie(m.d);
        if (hit) api.haptic('light');
        if (S.off[1] === 15) return endGame(false);
        k++;
        if (k < seq.length) later(hop, 120);
        else later(playerTurn, 400);
      });
    }
    later(hop, 260);
  }

  function playerTurn() {
    if (over) return;
    turn = 1; phase = 'roll'; sel = null; dests = null;
    saveNow();
  }

  function endGame(pWin) {
    over = true; phase = 'over'; sel = null; dests = null;
    clearTimers();
    api.save(null);
    if (pWin) {
      var sc = 150 + (S.off[1] === 0 ? 50 : 0);
      api.score(sc);
      api.haptic('success');
      api.gameOver(sc, { win: true });
    } else {
      api.haptic('error');
      api.gameOver(15, { win: false });
    }
  }

  function firstRoll() {
    var d1 = r6(), d2 = r6();
    while (d1 === d2) { d1 = r6(); d2 = r6(); }
    if (d1 > d2) {
      setDice(d1, d2, 1);
      turn = 1;
      showBanner(RU ? 'Вы ходите первым' : 'You go first');
      beginPlayerMove();
    } else {
      setDice(d1, d2, -1);
      turn = -1; phase = 'wait';
      showBanner(RU ? 'ИИ ходит первым' : 'AI goes first');
      later(aiMoves, 1100);
    }
  }

  function newGame(useSaved) {
    clearTimers();
    anim = null; rolling = null; banner = null; over = false;
    sel = null; dests = null; origins = {}; T = null;
    faces = null; rem = []; dOwner = 1;
    api.score(0);
    var s = useSaved ? api.load() : null;
    if (s && validSave(s)) {
      S = { b: s.b.slice(), bar: s.br.slice(), off: s.of.slice() };
      turn = s.t;
      api.score(S.off[0] * 10);
      if (turn === 1) {
        if (s.r && s.r.length) {
          faces = []; rem = []; dOwner = 1;
          for (var i = 0; i < s.r.length; i++) { faces.push({ v: s.r[i], u: false }); rem.push(s.r[i]); }
          beginPlayerMove();
        } else playerTurn();
      } else {
        phase = 'wait';
        later(aiTurn, 700);
      }
    } else {
      S = startState();
      firstRoll();
    }
  }

  /* ---- animation ---- */
  function animate(m, side, cb) {
    var me = side > 0 ? 0 : 1, from, to, cnt, dv, dk;
    if (m.f === 24) { cnt = S.bar[me]; from = barPos(side, Math.min(cnt, 4) - 1); }
    else { cnt = Math.abs(S.b[m.f]); from = stackPos(m.f, Math.min(cnt, 5) - 1); }
    if (m.t === -1) to = offPos(me, S.off[me]);
    else {
      dv = S.b[m.t] * side;
      dk = dv > 0 ? Math.min(dv, 4) : 0;
      to = stackPos(m.t, dk);
    }
    anim = { m: m, side: side, x0: from.x, y0: from.y, x1: to.x, y1: to.y, t0: nowMs(), dur: api.lowEnd ? 130 : 210, cb: cb };
  }

  /* ---- drawing ---- */
  var PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function rrect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawChecker(x, y, side, ring) {
    var gr = g.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.15, x, y, rr);
    if (side > 0) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, lightC); }
    else { gr.addColorStop(0, darkHi); gr.addColorStop(1, darkC); }
    g.beginPath();
    g.arc(x, y, rr, 0, 6.2832);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.stroke();
    if (ring) {
      g.lineWidth = 2.5;
      g.strokeStyle = C.accent;
      g.beginPath();
      g.arc(x, y, rr + 2, 0, 6.2832);
      g.stroke();
    }
  }
  function stackLabel(x, y, n, side) {
    g.font = 'bold ' + Math.max(9, rr) + 'px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = side > 0 ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)';
    g.fillText(String(n), x, y + 0.5);
  }
  function drawTri(i) {
    var c = ptCol(i), top = i >= 12;
    var x = colX(c), baseY = top ? by : by + bh, dir = top ? 1 : -1;
    g.beginPath();
    g.moveTo(x + 1, baseY);
    g.lineTo(x + pw - 1, baseY);
    g.lineTo(x + pw / 2, baseY + dir * triH);
    g.closePath();
    g.fillStyle = i % 2 === 0 ? triA : triB;
    g.fill();
    if (dests && dests[i] !== undefined) {
      g.globalAlpha = 0.28;
      g.fillStyle = C.good;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = 2;
      g.strokeStyle = C.good;
      g.stroke();
    } else if (phase === 'move' && origins && origins[i] && sel === null) {
      g.globalAlpha = 0.55;
      g.lineWidth = 1.5;
      g.strokeStyle = C.accent;
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  function drawStack(i) {
    var v = S.b[i];
    if (!v) return;
    var side = v > 0 ? 1 : -1, n = Math.abs(v);
    if (anim && anim.m.f === i) n--;
    if (!n) return;
    var nD = Math.min(n, 5), k, p = null;
    for (k = 0; k < nD; k++) {
      p = stackPos(i, k);
      drawChecker(p.x, p.y, side, sel === i && k === nD - 1);
    }
    if (n > 5 && p) stackLabel(p.x, p.y, n, side);
  }
  function drawBarSide(side) {
    var me = side > 0 ? 0 : 1, n = S.bar[me];
    if (anim && anim.m.f === 24 && anim.side === side) n--;
    if (!n) return;
    var nD = Math.min(n, 4), k, p = null;
    for (k = 0; k < nD; k++) {
      p = barPos(side, k);
      drawChecker(p.x, p.y, side, sel === 24 && side === 1 && k === nD - 1);
    }
    if (n > 4 && p) stackLabel(p.x, p.y, n, side);
  }
  function drawOff() {
    var hh = offH(), w = trayW - 8, x = trayX() + 4, me, k, n, p, col;
    for (me = 0; me < 2; me++) {
      n = S.off[me];
      col = me === 0 ? lightC : darkC;
      for (k = 0; k < n; k++) {
        p = offPos(me, k);
        g.fillStyle = col;
        rrect(x, p.y - hh / 2, w, hh, 2);
        g.fill();
        g.lineWidth = 0.5;
        g.strokeStyle = 'rgba(0,0,0,.4)';
        g.stroke();
      }
    }
    g.font = 'bold 10px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = C.muted;
    g.fillText(String(S.off[1]), trayX() + trayW / 2, midY - 10);
    g.fillText(String(S.off[0]), trayX() + trayW / 2, midY + 10);
    if (dests && dests.off) {
      g.lineWidth = 2;
      g.strokeStyle = C.good;
      g.strokeRect(trayX() + 1, midY + 2, trayW - 2, bh / 2 - 3);
    }
  }
  function drawDie(cx, cy, s, v, dim, darkDie) {
    g.globalAlpha = dim ? 0.3 : 1;
    rrect(cx - s / 2, cy - s / 2, s, s, s * 0.2);
    g.fillStyle = darkDie ? dieDark : dieFace;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,.5)';
    g.stroke();
    var pp = PIPS[v] || [], k, col, row, pr = s * 0.09;
    g.fillStyle = darkDie ? dieFace : dieDark;
    for (k = 0; k < pp.length; k++) {
      col = pp[k] % 3; row = (pp[k] / 3) | 0;
      g.beginPath();
      g.arc(cx + (col - 1) * s * 0.27, cy + (row - 1) * s * 0.27, pr, 0, 6.2832);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawDice(t) {
    var base = Math.min(32, pw * 1.5), n, ds, i, cxh, x;
    if (rolling) {
      n = 2; ds = base;
      cxh = rolling.ai ? bx + 3 * pw : bx + 9 * pw + barW;
      for (i = 0; i < n; i++) {
        x = cxh + (i - (n - 1) / 2) * (ds + 8);
        drawDie(x, midY, ds, 1 + (((t / 60) | 0) + i * 3) % 6, false, rolling.ai);
      }
      return;
    }
    if (faces && faces.length) {
      n = faces.length;
      ds = Math.min(base, (6 * pw - 12) / n - 6);
      cxh = dOwner === -1 ? bx + 3 * pw : bx + 9 * pw + barW;
      for (i = 0; i < n; i++) {
        x = cxh + (i - (n - 1) / 2) * (ds + 6);
        drawDie(x, midY, ds, faces[i].v, faces[i].u, dOwner === -1);
      }
    }
    if (phase === 'roll') {
      rrect(rollRect.x, rollRect.y, rollRect.w, rollRect.h, 12);
      g.fillStyle = C.accent;
      g.fill();
      g.fillStyle = C.bg;
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🎲 ' + (RU ? 'Бросок' : 'Roll'), rollRect.x + rollRect.w / 2, rollRect.y + rollRect.h / 2 + 1);
    }
  }
  function drawBanner(t) {
    if (!banner) return;
    if (t > banner.until) { banner = null; return; }
    var a = Math.min(1, (banner.until - t) / 300);
    g.globalAlpha = a;
    g.font = 'bold 14px sans-serif';
    var w = g.measureText(banner.txt).width + 30;
    rrect(cv.W / 2 - w / 2, midY - 76, w, 34, 10);
    g.fillStyle = C.panel2;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = C.accent;
    g.stroke();
    g.fillStyle = C.text;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(banner.txt, cv.W / 2, midY - 58);
    g.globalAlpha = 1;
  }
  function draw(t) {
    var i;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.font = 'bold 13px sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = turn === 1 && !over ? C.accent : C.muted;
    g.fillText('⚪ ' + pips(S, 1), 10, TOP / 2);
    g.textAlign = 'right';
    g.fillStyle = turn === -1 && !over ? C.accent : C.muted;
    g.fillText(pips(S, -1) + ' ⚫', cv.W - 48, TOP / 2);
    g.textAlign = 'center';
    g.fillStyle = C.text;
    var st = '';
    if (!over) {
      if (phase === 'move' || phase === 'roll' || (phase === 'anim')) st = api.t('your_turn');
      else if (phase === 'ai' || (rolling && rolling.ai) || (phase === 'wait' && turn === -1)) st = api.t('thinking');
    }
    g.fillText(st, cv.W / 2, TOP / 2);

    g.fillStyle = frameC;
    g.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    g.fillStyle = woodBg;
    g.fillRect(bx, by, bw, bh);
    g.fillStyle = barBg;
    g.fillRect(bx + 6 * pw, by, barW, bh);
    g.fillRect(trayX(), by, trayW, bh);
    for (i = 0; i < 24; i++) drawTri(i);
    for (i = 0; i < 24; i++) drawStack(i);
    drawBarSide(1);
    drawBarSide(-1);
    drawOff();
    drawDice(t);
    drawBanner(t);
    if (anim) {
      var p = Math.min(1, (t - anim.t0) / anim.dur);
      var e = p * (2 - p);
      drawChecker(anim.x0 + (anim.x1 - anim.x0) * e, anim.y0 + (anim.y1 - anim.y0) * e - Math.sin(p * 3.1416) * rr * 1.2, anim.side, false);
    }
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    var t = nowMs(), dt = t - lastT;
    lastT = t;
    if (paused) {
      if (anim) anim.t0 += dt;
      if (rolling) rolling.until += dt;
      if (banner) banner.until += dt;
      draw(t);
      return;
    }
    if (rolling && t >= rolling.until) {
      var rcb = rolling.cb;
      rolling = null;
      rcb();
    }
    if (anim && t >= anim.t0 + anim.dur) {
      var a = anim;
      anim = null;
      a.cb();
    }
    draw(t);
  }

  /* ---- input ---- */
  function hitTest(x, y) {
    if (y < by || y > by + bh) return null;
    if (x >= trayX() && x <= trayX() + trayW) return { k: 'off' };
    var bxr = bx + 6 * pw;
    if (x >= bxr && x <= bxr + barW) return { k: 'bar' };
    if (x < bx || x > trayX()) return null;
    var xx = x - bx;
    if (x > bxr) xx -= barW;
    var c = Math.floor(xx / pw);
    if (c < 0 || c > 11) return null;
    return { k: 'pt', i: y < midY ? 12 + c : 11 - c };
  }
  function onPoint(x, y) {
    if (over || destroyed || paused) return;
    if (phase === 'roll') {
      if (inRect(x, y, rollRect)) doRoll(false);
      return;
    }
    if (phase !== 'move') return;
    var h = hitTest(x, y);
    if (!h) { sel = null; dests = null; return; }
    if (h.k === 'off') {
      if (dests && dests.off) playChain(dests.off);
      return;
    }
    if (h.k === 'bar') {
      if (origins[24]) setSel(24);
      return;
    }
    if (dests && dests[h.i] !== undefined) { playChain(dests[h.i]); return; }
    if (h.i === sel) { sel = null; dests = null; return; }
    if (origins[h.i]) { setSel(h.i); return; }
    sel = null; dests = null;
  }
  function onDown(e) {
    var rect = cv.canvas.getBoundingClientRect();
    var cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
    var cy = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
    onPoint(cx - rect.left, cy - rect.top);
    if (e.cancelable && e.type === 'touchstart') e.preventDefault();
  }
  var evts = window.PointerEvent ? ['pointerdown'] : ['touchstart', 'mousedown'];
  for (var ei = 0; ei < evts.length; ei++) cv.canvas.addEventListener(evts[ei], onDown);
  function onKey(e) {
    if ((e.key === ' ' || e.key === 'Enter') && phase === 'roll' && !paused && !over) {
      doRoll(false);
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);

  /* ---- restart button ---- */
  var btn = document.createElement('button');
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  btn.style.cssText = 'position:absolute;top:4px;right:6px;z-index:5;border:0;border-radius:8px;' +
    'padding:3px 10px;font-size:18px;line-height:1.4;cursor:pointer;background:' + C.panel2 + ';color:' + C.text;
  container.appendChild(btn);
  btn.onclick = function () {
    api.haptic('light');
    api.save(null);
    newGame(false);
  };

  layout();
  newGame(true);
  raf = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimers();
      window.removeEventListener('keydown', onKey);
      for (var i = 0; i < evts.length; i++) cv.canvas.removeEventListener(evts[i], onDown);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
}

game._E = {
  start: startState,
  clone: cloneS,
  movesFor: movesFor,
  doMove: doMove,
  seqs: turnSeqs,
  pips: pips,
  evalSt: evalSt,
  aiPick: aiPick,
  allHome: allHome
};
MG.register('backgammon', game);
})();
