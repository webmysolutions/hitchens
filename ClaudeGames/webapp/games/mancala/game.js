/* Mancala — Kalah(6,4) vs minimax AI. MG game module. */
(function () {
'use strict';

/* Pits: 0-5 player, 6 player store, 7-12 AI, 13 AI store. Sowing is CCW. */
function sideSum(p, s) {
  var a = s === 1 ? 0 : 7, t = 0;
  for (var i = a; i < a + 6; i++) t += p[i];
  return t;
}
function sowQ(p, i, side) { /* mutates p; returns 1 on extra turn */
  var n = p[i], pos = i, skip = side === 1 ? 13 : 6;
  p[i] = 0;
  while (n > 0) {
    pos = (pos + 1) % 14;
    if (pos === skip) continue;
    p[pos]++; n--;
  }
  var store = side === 1 ? 6 : 13;
  if (pos === store) return 1;
  var own = side === 1 ? pos < 6 : (pos > 6 && pos < 13);
  if (own && p[pos] === 1) { /* landed in own empty pit: capture it + opposite */
    p[store] += p[pos] + p[12 - pos];
    p[pos] = 0;
    p[12 - pos] = 0;
  }
  return 0;
}
function sweep(p) { /* one side ran out: both sweep leftovers to own store */
  var i;
  for (i = 0; i < 6; i++) { p[6] += p[i]; p[i] = 0; }
  for (i = 7; i < 13; i++) { p[13] += p[i]; p[i] = 0; }
}
function evalP(p) { /* + good for AI: store lead + extra-turn potential */
  var s = (p[13] - p[6]) * 4, i;
  for (i = 7; i < 13; i++) if (p[i] === 13 - i) s += 3;
  for (i = 0; i < 6; i++) if (p[i] === 6 - i) s -= 3;
  return s;
}
function mm(p, side, depth, alpha, beta) {
  if (sideSum(p, 1) === 0 || sideSum(p, -1) === 0) {
    var q = p.slice();
    sweep(q);
    var d = q[13] - q[6];
    return d > 0 ? 9000 + d : d < 0 ? -9000 + d : 0;
  }
  if (depth <= 0) return evalP(p);
  var a = side === 1 ? 0 : 7, i, q2, v, ex;
  if (side === -1) {
    var best = -1e9;
    for (i = a; i < a + 6; i++) {
      if (!p[i]) continue;
      q2 = p.slice();
      ex = sowQ(q2, i, -1);
      v = mm(q2, ex ? -1 : 1, depth - 1, alpha, beta);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  var worst = 1e9;
  for (i = a; i < a + 6; i++) {
    if (!p[i]) continue;
    q2 = p.slice();
    ex = sowQ(q2, i, 1);
    v = mm(q2, ex ? 1 : -1, depth - 1, alpha, beta);
    if (v < worst) worst = v;
    if (v < beta) beta = v;
    if (alpha >= beta) break;
  }
  return worst;
}

MG.register('mancala', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var cv = api.createCanvas(), g = cv.g;
  var destroyed = false, paused = false, timers = {}, tseq = 0;

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
  var seedCol = blend(C.accent, '#ffffff', 0.25);
  var pitCol = blend(C.panel2, '#000000', 0.12);

  /* deterministic sunflower offsets for seed dots */
  var OFF = [];
  (function () {
    for (var k = 0; k < 24; k++) {
      var a = k * 2.399963, r = Math.sqrt((k + 0.6) / 24);
      OFF.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  })();

  /* ---------- DOM bar ---------- */
  function el(tag) { return document.createElement(tag); }
  var bar = el('div');
  bar.style.cssText = 'position:absolute;left:0;top:0;right:0;height:44px;display:flex;align-items:center;gap:8px;padding:0 10px;z-index:2;box-sizing:border-box';
  function chip() {
    var c = el('span');
    c.style.cssText = 'padding:3px 10px;border-radius:10px;font-size:14px;font-weight:bold;background:' + C.panel2 + ';color:' + C.text + ';border:2px solid transparent;white-space:nowrap';
    return c;
  }
  var pChip = chip(), aChip = chip(), st = el('span'), btn = el('button');
  st.style.cssText = 'flex:1;text-align:center;font-size:13px;color:' + C.muted + ';overflow:hidden;white-space:nowrap';
  btn.style.cssText = 'border:0;border-radius:8px;padding:5px 12px;font-size:20px;line-height:1;cursor:pointer;background:' + C.panel2 + ';color:' + C.text;
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  bar.appendChild(pChip); bar.appendChild(st); bar.appendChild(aChip); bar.appendChild(btn);
  container.appendChild(bar);

  /* ---------- layout ---------- */
  var BT = 48, u, gp, bw, x0, cy, rY;
  function layout() {
    u = Math.min((cv.W - 20) / 7.8, (cv.H - BT - 60) / 3.1, 76);
    gp = u * 0.1;
    bw = u * 0.95 * 2 + u * 6 + gp * 7;
    x0 = (cv.W - bw) / 2;
    cy = BT + (cv.H - BT) / 2;
    rY = [cy - u * 0.63, cy + u * 0.63];
  }
  cv.onResize = function () { layout(); draw(); };
  function pitX(j) { return x0 + u * 0.95 + gp * (j + 1) + u * j + u * 0.5; }
  function pos(i) { /* center of pit/store i */
    if (i === 6) return { x: x0 + bw - u * 0.475, y: cy, st: 1 };
    if (i === 13) return { x: x0 + u * 0.475, y: cy, st: 1 };
    if (i < 6) return { x: pitX(i), y: rY[1] };
    return { x: pitX(12 - i), y: rY[0] };
  }
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  var P, turn, over, busy, lastDrop, capFx = null;

  function drawSeeds(x, y, n, sx, sy) {
    var m = Math.min(n, 24), k;
    g.fillStyle = seedCol;
    for (k = 0; k < m; k++) {
      g.beginPath();
      g.arc(x + OFF[k][0] * sx, y + OFF[k][1] * sy, u * 0.062, 0, 6.2832);
      g.fill();
    }
  }
  function draw() {
    var i, p;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.fillStyle = C.panel;
    rr(x0 - 10, cy - u * 1.45, bw + 20, u * 2.9, 16);
    g.fill();
    /* side labels */
    g.font = 'bold ' + Math.round(u * 0.24) + 'px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = C.muted;
    g.fillText('🤖', x0 + u * 0.475, cy - u * 1.66);
    g.fillText(RU ? 'Ты' : 'You', x0 + bw - u * 0.475, cy + u * 1.66);
    /* stores */
    for (i = 6; i < 14; i += 7) {
      p = pos(i);
      g.fillStyle = pitCol;
      rr(p.x - u * 0.44, cy - u * 1.28, u * 0.88, u * 2.56, u * 0.42);
      g.fill();
      drawSeeds(p.x, p.y, P[i], u * 0.26, u * 1.0);
      g.fillStyle = C.text;
      g.font = 'bold ' + Math.round(u * 0.28) + 'px sans-serif';
      g.fillText(P[i], p.x, i === 6 ? cy - u * 1.05 : cy + u * 1.05);
    }
    /* pits */
    var canPlay = !over && !busy && turn === 1;
    for (i = 0; i < 13; i++) {
      if (i === 6) continue;
      p = pos(i);
      g.fillStyle = pitCol;
      g.beginPath();
      g.arc(p.x, p.y, u * 0.5, 0, 6.2832);
      g.fill();
      if (canPlay && i < 6 && P[i] > 0) {
        g.strokeStyle = C.accent;
        g.lineWidth = Math.max(2, u * 0.045);
        g.beginPath();
        g.arc(p.x, p.y, u * 0.5, 0, 6.2832);
        g.stroke();
      }
      if (lastDrop === i) {
        g.strokeStyle = C.good;
        g.lineWidth = Math.max(2, u * 0.05);
        g.beginPath();
        g.arc(p.x, p.y, u * 0.56, 0, 6.2832);
        g.stroke();
      }
      if (capFx && Date.now() - capFx.t0 < 450 && capFx.p.indexOf(i) >= 0) {
        g.globalAlpha = 0.5;
        g.fillStyle = C.good;
        g.beginPath();
        g.arc(p.x, p.y, u * 0.5, 0, 6.2832);
        g.fill();
        g.globalAlpha = 1;
      }
      drawSeeds(p.x, p.y, P[i], u * 0.33, u * 0.33);
      g.fillStyle = C.muted;
      g.font = 'bold ' + Math.round(u * 0.22) + 'px sans-serif';
      g.fillText(P[i], p.x, i < 6 ? p.y + u * 0.72 : p.y - u * 0.72);
    }
  }

  function upd() {
    pChip.textContent = '🌰 ' + P[6];
    aChip.textContent = '🌰 ' + P[13];
    pChip.style.borderColor = (!over && turn === 1) ? C.accent : 'transparent';
    aChip.style.borderColor = (!over && turn === -1) ? C.accent : 'transparent';
    st.textContent = over ? '' : (busy && turn === -1 ? api.t('thinking') : (turn === 1 ? api.t('your_turn') : api.t('wait')));
    api.score(P[6]);
  }
  function toast(msg) {
    st.textContent = msg;
    later(upd, 900);
  }
  function flashCap(pits) {
    capFx = { p: pits, t0: Date.now() };
    (function pulse() {
      if (destroyed || !capFx) return;
      if (Date.now() - capFx.t0 > 450) { capFx = null; draw(); return; }
      draw();
      later(pulse, 60);
    })();
  }

  /* ---------- flow ---------- */
  function saveState() { if (!over) api.save({ p: P.slice(), t: turn }); }
  function finish() {
    over = true; busy = false;
    api.save(null);
    upd(); draw();
    var me = P[6], ai = P[13];
    if (me > ai) { api.haptic('success'); api.gameOver(me + 100, { win: true }); }
    else if (me === ai) api.gameOver(me + 50, { draw: true });
    else { api.haptic('error'); api.gameOver(me, { win: false }); }
  }
  function animate(i, side, done) {
    busy = true;
    var seq = [], n = P[i], ps = i, skip = side === 1 ? 13 : 6;
    while (n > 0) {
      ps = (ps + 1) % 14;
      if (ps === skip) continue;
      seq.push(ps); n--;
    }
    P[i] = 0;
    if (api.lowEnd) {
      for (var k = 0; k < seq.length; k++) P[seq[k]]++;
      lastDrop = -1;
      draw();
      done(seq[seq.length - 1]);
      return;
    }
    var k2 = 0;
    function step() {
      P[seq[k2]]++;
      lastDrop = seq[k2];
      k2++;
      draw(); upd();
      if (k2 < seq.length) later(step, 60);
      else later(function () { lastDrop = -1; done(seq[seq.length - 1]); }, 120);
    }
    draw();
    later(step, 60);
  }
  function resolve(side, last) {
    var store = side === 1 ? 6 : 13;
    var extra = last === store;
    if (!extra) {
      var own = side === 1 ? last < 6 : (last > 6 && last < 13);
      if (own && P[last] === 1) {
        var got = P[last] + P[12 - last];
        P[store] += got;
        P[last] = 0;
        P[12 - last] = 0;
        api.haptic('medium');
        flashCap([last, 12 - last]);
        toast((RU ? 'Захват! +' : 'Capture! +') + got);
      }
    }
    if (sideSum(P, 1) === 0 || sideSum(P, -1) === 0) {
      sweep(P);
      draw();
      return finish();
    }
    if (extra) {
      api.haptic('light');
      toast(RU ? 'Ещё ход!' : 'Extra turn!');
      if (side === 1) { busy = false; turn = 1; saveState(); upd(); draw(); }
      else later(aiGo, 500);
      return;
    }
    toMove(-side);
  }
  function toMove(t) {
    turn = t; busy = false;
    saveState();
    upd(); draw();
    if (t === -1) later(aiGo, 400);
  }
  function aiGo() {
    if (over) return;
    busy = true; turn = -1;
    upd();
    var depth = api.lowEnd ? 5 : 7, cands = [], i;
    for (i = 7; i < 13; i++) if (P[i]) cands.push(i);
    if (!cands.length) { sweep(P); draw(); return finish(); }
    var idx = 0, best = cands[0], bestV = -1e9, alpha = -1e9;
    function chunk() {
      var t0 = Date.now();
      while (idx < cands.length && Date.now() - t0 < 40) {
        var c = cands[idx++], q = P.slice();
        var ex = sowQ(q, c, -1);
        var v = mm(q, ex ? -1 : 1, depth - 1, alpha, 1e9);
        if (v > bestV) { bestV = v; best = c; if (v > alpha) alpha = v; }
      }
      if (idx < cands.length) { later(chunk, 16); return; }
      animate(best, -1, function (last) { resolve(-1, last); });
    }
    later(chunk, 30);
  }
  function onClick(e) {
    if (over || busy || turn !== 1) return;
    var r = cv.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    for (var j = 0; j < 6; j++) {
      var dx = x - pitX(j), dy = y - rY[1];
      if (dx * dx + dy * dy < u * 0.62 * u * 0.62) {
        if (P[j] > 0) {
          api.haptic('light');
          animate(j, 1, function (last) { resolve(1, last); });
        }
        return;
      }
    }
  }
  cv.canvas.addEventListener('click', onClick);

  function newGame(useSaved) {
    clearTimers();
    over = false; busy = false; lastDrop = -1; capFx = null;
    var s = useSaved ? api.load() : null, ok = false, i;
    if (s && s.p && s.p.length === 14 && (s.t === 1 || s.t === -1)) {
      ok = true;
      var sum = 0;
      for (i = 0; i < 14; i++) {
        var v = s.p[i];
        if (typeof v !== 'number' || v < 0 || v !== (v | 0)) { ok = false; break; }
        sum += v;
      }
      if (sum !== 48) ok = false;
      if (ok && (sideSum(s.p, 1) === 0 || sideSum(s.p, -1) === 0)) ok = false;
    }
    if (ok) { P = s.p.slice(); toMove(s.t); }
    else {
      P = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
      toMove(1);
    }
  }
  btn.onclick = function () {
    api.haptic('light');
    api.save(null);
    newGame(false);
  };

  layout();
  newGame(true);

  return {
    destroy: function () {
      destroyed = true;
      clearTimers();
      cv.canvas.removeEventListener('click', onClick);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
