/* Dots and Boxes — 6x6 dots (5x5 boxes) vs AI. MG game contract. */
(function () {
'use strict';
MG.register('dotsboxes', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var cv = api.createCanvas(), g = cv.g;
  var TAU = 6.28319;
  var HU_COL = C.accent, AI_COL = C.bad;

  /* edges: 0..29 horizontal (r*5+c, r 0..5, c 0..4), 30..59 vertical (30+r*6+c, r 0..4, c 0..5) */
  var E = new Array(60), own = new Array(25);
  var my = 0, ai = 0, human = true, over = false;
  var lastE = -1, hoverE = -1, msg = '';
  var anims = [];                                    // box fill pops {b, t}
  var raf = 0, last = 0, paused = false, timers = [], queue = [];

  function later(fn, ms) {                           // pause-deferring setTimeout
    var id = setTimeout(function () {
      var k = timers.indexOf(id);
      if (k >= 0) timers.splice(k, 1);
      if (paused) { queue.push(fn); return; }
      fn();
    }, ms);
    timers.push(id);
  }

  var P = 40, bx = 0, by = 0;                        // pitch and board origin
  function layout() {
    var S = Math.min(cv.W - 34, cv.H - 100);
    P = S / 5;
    bx = (cv.W - S) / 2;
    by = 60 + (cv.H - 60 - S - 18) / 2;
  }
  cv.onResize = layout;

  /* ---------- board topology ---------- */
  function edgesOfBox(b) {
    var r = (b / 5) | 0, c = b % 5;
    return [r * 5 + c, (r + 1) * 5 + c, 30 + r * 6 + c, 30 + r * 6 + c + 1];
  }
  function boxesOfEdge(e) {
    var out = [], r, c;
    if (e < 30) {
      r = (e / 5) | 0; c = e % 5;
      if (r > 0) out.push((r - 1) * 5 + c);
      if (r < 5) out.push(r * 5 + c);
    } else {
      e -= 30; r = (e / 6) | 0; c = e % 6;
      if (c > 0) out.push(r * 5 + c - 1);
      if (c < 5) out.push(r * 5 + c);
    }
    return out;
  }
  function sidesA(A, b) {
    var e = edgesOfBox(b), n = 0;
    for (var k = 0; k < 4; k++) if (A[e[k]]) n++;
    return n;
  }
  function sides(b) { return sidesA(E, b); }

  /* ---------- AI ---------- */
  function greedyGain(A) {                           // boxes takeable by greedy chain-eating on A (mutates A)
    var got = 0, again = true, e, k, bs;
    while (again) {
      again = false;
      for (e = 0; e < 60; e++) {
        if (A[e]) continue;
        bs = boxesOfEdge(e);
        var hit = false;
        for (k = 0; k < bs.length; k++) if (sidesA(A, bs[k]) === 3) hit = true;
        if (hit) {
          A[e] = 9;
          for (k = 0; k < bs.length; k++) if (sidesA(A, bs[k]) === 4) got++;
          again = true;
        }
      }
    }
    return got;
  }
  function doubleCross() {                           // leave the last 2 chain boxes to the opponent
    for (var b = 0; b < 25; b++) {
      if (own[b] || sides(b) !== 3) continue;
      var eb = edgesOfBox(b), e1 = -1, k;
      for (k = 0; k < 4; k++) if (!E[eb[k]]) e1 = eb[k];
      var bs = boxesOfEdge(e1);
      for (k = 0; k < bs.length; k++) {
        var b2 = bs[k];
        if (b2 === b || own[b2] || sides(b2) !== 2) continue;
        var e2b = edgesOfBox(b2);
        for (var m = 0; m < 4; m++) {
          var cand = e2b[m];
          if (E[cand] || cand === e1) continue;
          var A = E.slice();                         // sanity: hand back exactly 2 boxes
          A[cand] = 9;
          if (greedyGain(A) === 2) return cand;
        }
      }
    }
    return -1;
  }
  function aiEdge() {
    var comp = [], safe = [], freeE = [], e, k, bs;
    for (e = 0; e < 60; e++) {
      if (E[e]) continue;
      freeE.push(e);
      bs = boxesOfEdge(e);
      var isC = false, isS = true;
      for (k = 0; k < bs.length; k++) {
        var sd = sides(bs[k]);
        if (sd === 3) isC = true;                    // completes a box
        if (sd >= 2) isS = false;                    // would create a 3-sided box
      }
      if (isC) comp.push(e);
      else if (isS) safe.push(e);
    }
    if (comp.length) {
      if (!safe.length) {                            // chains-only endgame: parity play
        var A = E.slice();
        var take = greedyGain(A);
        var remAfter = 25 - my - ai - take;
        if (remAfter > 0 && take === 2) {            // double-cross instead of eating the last 2
          var dc = doubleCross();
          if (dc >= 0) return dc;
        }
      }
      return comp[0];                                // free box: always take
    }
    if (safe.length) return safe[(Math.random() * safe.length) | 0];
    var best = -1, bg = 1e9;                         // forced sacrifice: open the shortest chain
    for (k = 0; k < freeE.length; k++) {
      var A2 = E.slice();
      A2[freeE[k]] = 9;
      var gg = greedyGain(A2);
      if (gg < bg) { bg = gg; best = freeE[k]; }
    }
    return best;
  }

  /* ---------- flow ---------- */
  function claim(e, who) {
    E[e] = who;
    lastE = e;
    var bs = boxesOfEdge(e), got = 0;
    for (var k = 0; k < bs.length; k++) {
      if (!own[bs[k]] && sides(bs[k]) === 4) {
        own[bs[k]] = who;
        got++;
        anims.push({ b: bs[k], t: 0 });
        if (who === 1) my++; else ai++;
      }
    }
    if (got) api.haptic(who === 1 ? 'medium' : 'light');
    api.score(my * 10);
    return got;
  }
  function done() { return my + ai === 25; }
  function finish() {
    over = true;
    hoverE = -1;
    var win = my > ai, drw = my === ai;
    msg = api.t(win ? 'you_win' : drw ? 'draw' : 'you_lose');
    var score = my * 10 + (win ? 100 : 0);
    api.haptic(win ? 'success' : 'error');
    api.score(score);
    later(function () { api.gameOver(score, drw ? { draw: true } : { win: win }); }, 900);
  }
  function aiStep() {
    if (over || human) return;
    var e = aiEdge();
    if (e < 0) { human = true; return; }
    var got = claim(e, 2);
    if (done()) { finish(); return; }
    if (got) later(aiStep, api.lowEnd ? 220 : 380);   // extra turn: keep eating
    else { human = true; msg = api.t('your_turn'); }
  }

  /* ---------- input (fat touch targets) ---------- */
  function pickEdge(x, y) {                          // x,y in cell units
    if (x < -0.35 || y < -0.35 || x > 5.35 || y > 5.35) return -1;
    var c = Math.max(0, Math.min(4, Math.floor(x)));
    var r = Math.max(0, Math.min(5, Math.round(y)));
    var dxh = x - (c + 0.5), dyh = y - r;
    var dh = dxh * dxh + dyh * dyh;
    var c2 = Math.max(0, Math.min(5, Math.round(x)));
    var r2 = Math.max(0, Math.min(4, Math.floor(y)));
    var dxv = x - c2, dyv = y - (r2 + 0.5);
    var dv = dxv * dxv + dyv * dyv;
    var lim = 0.45 * 0.45;
    if (dh <= dv) return dh < lim ? r * 5 + c : -1;
    return dv < lim ? 30 + r2 * 6 + c2 : -1;
  }
  function evPos(e) {
    var rct = cv.canvas.getBoundingClientRect();
    return [(e.clientX - rct.left - bx) / P, (e.clientY - rct.top - by) / P];
  }
  function onDown(e) {
    if (paused || over || !human) return;
    var p = evPos(e);
    var ed = pickEdge(p[0], p[1]);
    if (ed < 0 || E[ed]) return;
    hoverE = -1;
    var got = claim(ed, 1);
    if (done()) { finish(); return; }
    if (!got) {
      human = false;
      msg = api.t('thinking');
      later(aiStep, api.lowEnd ? 250 : 420);
    } else msg = RU ? 'Ещё ход!' : 'Extra turn!';
  }
  function onMove(e) {                               // desktop hover preview
    if (paused || over || !human) { hoverE = -1; return; }
    var p = evPos(e);
    var ed = pickEdge(p[0], p[1]);
    hoverE = (ed >= 0 && !E[ed]) ? ed : -1;
  }
  cv.canvas.addEventListener('pointerdown', onDown);
  cv.canvas.addEventListener('pointermove', onMove);

  /* ---------- draw ---------- */
  function edgeEnds(e) {
    if (e < 30) {
      var r = (e / 5) | 0, c = e % 5;
      return [bx + c * P, by + r * P, bx + (c + 1) * P, by + r * P];
    }
    var e2 = e - 30, r2 = (e2 / 6) | 0, c2 = e2 % 6;
    return [bx + c2 * P, by + r2 * P, bx + c2 * P, by + (r2 + 1) * P];
  }
  function line(pts, ins) {
    var dx = pts[2] - pts[0], dy = pts[3] - pts[1];
    g.beginPath();
    g.moveTo(pts[0] + dx * ins, pts[1] + dy * ins);
    g.lineTo(pts[2] - dx * ins, pts[3] - dy * ins);
    g.stroke();
  }

  function draw(ts) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.textBaseline = 'middle';
    g.font = 'bold 17px sans-serif';                 // score header
    g.textAlign = 'left';
    g.fillStyle = HU_COL;
    g.fillText('🙂 ' + my, 14, 26);
    g.textAlign = 'right';
    g.fillStyle = AI_COL;
    g.fillText(ai + ' 🤖', cv.W - 14, 26);
    g.textAlign = 'center';
    g.font = '13px sans-serif';
    g.fillStyle = over ? C.text : C.muted;
    g.fillText(over ? msg : (human ? (msg || api.t('your_turn')) : api.t('thinking')), cv.W / 2, 26);
    if (!over) {                                     // turn underline
      g.fillStyle = human ? HU_COL : AI_COL;
      g.fillRect(human ? 12 : cv.W - 60, 40, 48, 3);
    }
    var b, r, c, k;
    for (b = 0; b < 25; b++) {                       // owned boxes
      if (!own[b]) continue;
      var sc = 1;
      for (k = 0; k < anims.length; k++) if (anims[k].b === b) sc = Math.min(1, anims[k].t / 240);
      r = (b / 5) | 0; c = b % 5;
      var x0 = bx + c * P, y0 = by + r * P;
      g.globalAlpha = 0.18 * sc;
      g.fillStyle = own[b] === 1 ? HU_COL : AI_COL;
      g.fillRect(x0 + 5, y0 + 5, P - 10, P - 10);
      g.globalAlpha = sc;
      g.font = Math.round(P * (0.24 + 0.2 * sc)) + 'px sans-serif';
      g.fillText(own[b] === 1 ? '🙂' : '🤖', x0 + P / 2, y0 + P / 2 + 1);
      g.globalAlpha = 1;
    }
    g.lineCap = 'round';
    for (var e = 0; e < 60; e++) {                   // edges
      var pts = edgeEnds(e);
      if (E[e]) {
        if (e === lastE && !over) {                  // last-move glow
          g.globalAlpha = 0.3 + 0.18 * Math.sin(ts / 170);
          g.strokeStyle = E[e] === 1 ? HU_COL : AI_COL;
          g.lineWidth = 13;
          line(pts, 0.1);
          g.globalAlpha = 1;
        }
        g.strokeStyle = E[e] === 1 ? HU_COL : AI_COL;
        g.lineWidth = 5;
        line(pts, 0.08);
      } else if (e === hoverE) {
        g.globalAlpha = 0.4;
        g.strokeStyle = C.text;
        g.lineWidth = 5;
        line(pts, 0.08);
        g.globalAlpha = 1;
      } else {
        g.globalAlpha = 0.13;
        g.strokeStyle = C.muted;
        g.lineWidth = 2;
        line(pts, 0.12);
        g.globalAlpha = 1;
      }
    }
    g.fillStyle = C.text;                            // dots on top
    var dr = Math.max(3, P * 0.055);
    for (r = 0; r <= 5; r++) for (c = 0; c <= 5; c++) {
      g.beginPath();
      g.arc(bx + c * P, by + r * P, dr, 0, TAU);
      g.fill();
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = last ? Math.min(80, ts - last) : 16;
    last = ts;
    for (var i = anims.length - 1; i >= 0; i--) {
      anims[i].t += dt;
      if (anims[i].t > 260) anims.splice(i, 1);
    }
    draw(ts);
  }

  for (var i = 0; i < 60; i++) E[i] = 0;
  for (i = 0; i < 25; i++) own[i] = 0;
  api.score(0);
  msg = api.t('your_turn');
  layout();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      for (var k = 0; k < timers.length; k++) clearTimeout(timers[k]);
      timers.length = 0;
      queue.length = 0;
      cv.canvas.removeEventListener('pointerdown', onDown);
      cv.canvas.removeEventListener('pointermove', onMove);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () {
      paused = false;
      last = 0;
      var q = queue;
      queue = [];
      for (var k = 0; k < q.length; k++) q[k]();
    }
  };
});
})();
