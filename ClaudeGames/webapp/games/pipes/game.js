/* Pipes — rotate tiles to connect every pipe to the water source (Net-style).
   Levels are generated as a random spanning tree, then scrambled → always solvable. */
(function () {
'use strict';
MG.register('pipes', function (container, api) {
  var C = api.colors;
  var cv = api.createCanvas();
  var g = cv.g;

  // directions: 1=N 2=E 4=S 8=W
  var DX = { 1: 0, 2: 1, 4: 0, 8: -1 };
  var DY = { 1: -1, 2: 0, 4: 1, 8: 0 };
  var OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };

  var level = 1, TOTAL = 10;
  var N, conn, target, src, flow, taps, score = 0, solved = false;
  var anim = null, raf = 0, paused = false, banner = null, over = false;
  var cell, ox, oy;

  function rotCW(m) {
    return ((m & 1 ? 2 : 0) | (m & 2 ? 4 : 0) | (m & 4 ? 8 : 0) | (m & 8 ? 1 : 0));
  }

  function gen() {
    N = Math.min(8, 4 + Math.ceil(level / 2)); // 5,5,6,6,7,7,8,8,8,8
    conn = [];
    for (var i = 0; i < N * N; i++) conn.push(0);
    // randomized DFS spanning tree
    var seen = [], stack = [];
    for (i = 0; i < N * N; i++) seen.push(false);
    src = (Math.random() * N * N) | 0;
    stack.push(src); seen[src] = true;
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var cx = cur % N, cyy = (cur / N) | 0;
      var dirs = [1, 2, 4, 8].sort(function () { return Math.random() - 0.5; });
      var moved = false;
      for (var d = 0; d < 4; d++) {
        var dir = dirs[d];
        var nx = cx + DX[dir], ny = cyy + DY[dir];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        var nn = ny * N + nx;
        if (seen[nn]) continue;
        conn[cur] |= dir;
        conn[nn] |= OPP[dir];
        seen[nn] = true;
        stack.push(nn);
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }
    target = conn.slice();
    // scramble
    var scrambled = false;
    do {
      for (i = 0; i < N * N; i++) {
        var r = (Math.random() * 4) | 0;
        for (var k = 0; k < r; k++) conn[i] = rotCW(conn[i]);
        if (conn[i] !== target[i]) scrambled = true;
      }
    } while (!scrambled);
    taps = 0;
    solved = false;
    computeFlow();
    layout();
  }

  function computeFlow() {
    flow = [];
    for (var i = 0; i < N * N; i++) flow.push(false);
    var q = [src];
    flow[src] = true;
    while (q.length) {
      var cur = q.pop();
      var cx = cur % N, cyy = (cur / N) | 0;
      for (var d = 0; d < 4; d++) {
        var dir = 1 << d;
        if (!(conn[cur] & dir)) continue;
        var nx = cx + DX[dir], ny = cyy + DY[dir];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        var nn = ny * N + nx;
        if (flow[nn] || !(conn[nn] & OPP[dir])) continue;
        flow[nn] = true;
        q.push(nn);
      }
    }
    var all = true;
    for (i = 0; i < N * N; i++) if (!flow[i]) { all = false; break; }
    if (all && !solved) {
      solved = true;
      var bonus = Math.max(0, 60 - Math.max(0, taps - N * N));
      score += 100 + bonus;
      api.score(score);
      api.haptic('success');
      banner = { text: '+' + (100 + bonus), t: 0 };
      setTimeout(function () {
        if (over) return;
        banner = null;
        if (level >= TOTAL) { over = true; api.gameOver(score, { win: true }); }
        else { level++; gen(); }
      }, 1200);
    }
  }

  function layout() {
    var top = 46;
    cell = Math.floor(Math.min(cv.W / N, (cv.H - top) / N));
    ox = ((cv.W - cell * N) / 2) | 0;
    oy = top + (((cv.H - top - cell * N) / 2) | 0);
  }
  cv.onResize = layout;

  function draw(ts) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // header
    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(api.t('level') + ' ' + level + '/' + TOTAL, 12, 24);
    g.textAlign = 'right';
    g.fillText((api.lang === 'ru' ? 'Повороты: ' : 'Taps: ') + taps, cv.W - 12, 24);

    var w = Math.max(3, (cell * 0.22) | 0);
    for (var i = 0; i < N * N; i++) {
      var x = ox + (i % N) * cell, y = oy + ((i / N) | 0) * cell;
      g.fillStyle = C.panel;
      g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      var m = conn[i];
      if (!m) continue;
      var cx = x + cell / 2, cyy = y + cell / 2;
      var wet = flow[i];
      g.strokeStyle = wet ? C.accent : C.panel2;
      g.lineWidth = w;
      g.lineCap = 'round';
      var a = 0;
      if (anim && anim.i === i) a = anim.a;
      g.save();
      g.translate(cx, cyy);
      if (a) g.rotate(a);
      g.beginPath();
      for (var d = 0; d < 4; d++) {
        var dir = 1 << d;
        if (!(m & dir)) continue;
        g.moveTo(0, 0);
        g.lineTo(DX[dir] * cell / 2, DY[dir] * cell / 2);
      }
      g.stroke();
      // node dot
      g.fillStyle = wet ? C.accent : C.panel2;
      g.beginPath();
      g.arc(0, 0, w * 0.65, 0, 6.2832);
      g.fill();
      g.restore();
      if (i === src) {
        g.font = (cell * 0.42 | 0) + 'px sans-serif';
        g.textAlign = 'center';
        g.fillText('💧', cx, cyy - cell * 0.02);
      }
    }
    if (banner) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, cv.H / 2 - 40, cv.W, 80);
      g.fillStyle = C.good;
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center';
      g.fillText(banner.text, cv.W / 2, cv.H / 2);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    if (anim) {
      anim.a += 0.35;
      if (anim.a >= Math.PI / 2) {
        var i = anim.i;
        anim = null;
        conn[i] = rotCW(conn[i]);
        computeFlow();
      }
    }
    draw();
  }

  function onTap(e) {
    if (solved || anim || over) return;
    var p = e.changedTouches ? e.changedTouches[0] : e;
    var r = cv.canvas.getBoundingClientRect();
    var x = (((p.clientX - r.left) - ox) / cell) | 0;
    var y = (((p.clientY - r.top) - oy) / cell) | 0;
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    var i = y * N + x;
    if (!conn[i]) return;
    taps++;
    api.haptic('light');
    if (api.lowEnd) { conn[i] = rotCW(conn[i]); computeFlow(); }
    else anim = { i: i, a: 0 };
  }
  cv.canvas.addEventListener('click', onTap);

  api.score(0);
  gen();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      over = true;
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('click', onTap);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
