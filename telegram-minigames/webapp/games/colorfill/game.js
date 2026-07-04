/* Flood Fill — flood the whole board into one color within the move limit. */
(function () {
'use strict';
MG.register('colorfill', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';

  function baseHue(hex) {
    try {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var r = parseInt(h.substr(0, 2), 16) / 255, gg = parseInt(h.substr(2, 2), 16) / 255, b = parseInt(h.substr(4, 2), 16) / 255;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn, hu = 0;
      if (d > 0) {
        if (mx === r) hu = ((gg - b) / d) % 6; else if (mx === gg) hu = (b - r) / d + 2; else hu = (r - gg) / d + 4;
        hu *= 60; if (hu < 0) hu += 360;
      }
      return hu;
    } catch (e) { return 210; }
  }
  var HUE = baseHue(C.accent);
  var PAL = [];
  for (var pi = 0; pi < 6; pi++) PAL.push('hsl(' + Math.round(HUE + [0, 55, 110, 175, 240, 300][pi]) % 360 + ',64%,56%)');

  var ROUNDS = 8;
  var SIZES = [10, 10, 11, 11, 12, 12, 13, 14];
  var round, size, grid, moves, limit, total, wins, state; // state: 'play' | 'between' | 'done'
  var anim = [];         // [{i, old, at}] staggered recolor
  var banner = null;     // {text, color, until}
  var raf = 0, paused = false, timers = [];
  var gx0, gy0, cs, btnY, btnR;

  function layout() {
    var gridMax = Math.min(cv.W - 12, cv.H - 96);
    cs = Math.floor(gridMax / size);
    gx0 = Math.floor((cv.W - cs * size) / 2);
    gy0 = 8;
    btnY = cv.H - 44;
    btnR = Math.min(24, Math.floor(cv.W / 15));
  }
  cv.onResize = function () { layout(); };

  /* region owned from top-left: BFS over same-color connected cells */
  function region(gr, n) {
    var own = [], q = [0], seen = {}; seen[0] = 1;
    var col = gr[0];
    while (q.length) {
      var i = q.pop();
      own.push(i);
      var x = i % n, y = (i / n) | 0;
      var nb = [i - 1, i + 1, i - n, i + n];
      for (var k = 0; k < 4; k++) {
        var j = nb[k];
        if (j < 0 || j >= n * n || seen[j]) continue;
        if (k === 0 && x === 0) continue;
        if (k === 1 && x === n - 1) continue;
        if (gr[j] === col) { seen[j] = 1; q.push(j); }
      }
    }
    return own;
  }
  function flood(gr, n, col) { // returns new owned size
    var own = region(gr, n);
    for (var i = 0; i < own.length; i++) gr[own[i]] = col;
    return region(gr, n).length;
  }
  /* greedy solver: always pick the color that grows the region most */
  function greedySolve(src, n) {
    var gr = src.slice(), m = 0;
    while (region(gr, n).length < n * n && m < 99) {
      var bestC = -1, bestSz = -1;
      for (var c = 0; c < 6; c++) {
        if (c === gr[0]) continue;
        var cp = gr.slice();
        var sz = flood(cp, n, c);
        if (sz > bestSz) { bestSz = sz; bestC = c; }
      }
      flood(gr, n, bestC);
      m++;
    }
    return m;
  }

  function newRound() {
    size = SIZES[round];
    grid = [];
    for (var i = 0; i < size * size; i++) grid.push((Math.random() * 6) | 0);
    moves = 0;
    limit = greedySolve(grid, size) + 4;
    anim = [];
    state = 'play';
    layout();
  }

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function endRound(won) {
    state = 'between';
    var pts = 0;
    if (won) {
      pts = 150 + (limit - moves) * 15;
      total += pts; wins++;
      api.score(total);
      api.haptic('success');
      banner = { text: api.t('you_win') + '  +' + pts, color: C.good, until: performance.now() + 1300 };
    } else {
      api.haptic('error');
      banner = { text: api.t('you_lose'), color: C.bad, until: performance.now() + 1300 };
    }
    later(function () {
      banner = null;
      round++;
      if (round >= ROUNDS) {
        state = 'done';
        api.gameOver(total, { win: wins >= 5 });
      } else newRound();
    }, 1350);
  }

  function pick(col) {
    if (state !== 'play' || col === grid[0]) return;
    moves++;
    var oldCol = grid[0];
    var own = region(grid, size);
    var ownMap = {}, i, k;
    for (i = 0; i < own.length; i++) ownMap[own[i]] = 1;
    // BFS distance from the top-left corner across the owned region → stagger times
    var dist = {}, q = [0], head = 0;
    dist[0] = 0;
    while (head < q.length) {
      var ci = q[head++];
      var x = ci % size;
      var nb = [ci - 1, ci + 1, ci - size, ci + size];
      for (k = 0; k < 4; k++) {
        var j = nb[k];
        if (j < 0 || j >= size * size || dist[j] !== undefined || !ownMap[j]) continue;
        if (k === 0 && x === 0) continue;
        if (k === 1 && x === size - 1) continue;
        dist[j] = dist[ci] + 1;
        q.push(j);
      }
    }
    var now = performance.now();
    anim = [];
    for (i = 0; i < own.length; i++) {
      grid[own[i]] = col;
      if (!api.lowEnd) anim.push({ i: own[i], old: oldCol, at: now + (dist[own[i]] || 0) * 36 });
    }
    api.haptic('light');
    var ownedNow = region(grid, size).length;
    if (ownedNow === size * size) later(function () { endRound(true); }, api.lowEnd ? 120 : 420);
    else if (moves >= limit) later(function () { endRound(false); }, api.lowEnd ? 120 : 420);
  }

  /* input: taps on color buttons (and keys 1-6 for desktop) */
  var offSwipe = api.swipe(container, function (d, p) {
    if (d !== 'tap' || !p || state !== 'play') return;
    var r = cv.canvas.getBoundingClientRect();
    var x = p.clientX - r.left, y = p.clientY - r.top;
    if (y > btnY - btnR - 8) {
      var step = cv.W / 6;
      var idx = Math.min(5, Math.max(0, (x / step) | 0));
      pick(idx);
    }
  });
  function onKey(e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) { pick(n - 1); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  function draw() {
    var now = performance.now();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    if (state === 'done') return;
    // grid (cells mid-animation keep their pre-flood color until their time comes)
    var pend = {};
    for (var a = anim.length - 1; a >= 0; a--) {
      if (now >= anim[a].at) anim.splice(a, 1);
      else pend[anim[a].i] = anim[a].old;
    }
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      var i = y * size + x;
      g.fillStyle = PAL[pend[i] !== undefined ? pend[i] : grid[i]];
      g.fillRect(gx0 + x * cs, gy0 + y * cs, cs - 1, cs - 1);
    }
    // info line
    g.fillStyle = C.text;
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    var info = api.t('moves') + ': ' + (limit - moves) + '   •   ' + (RU ? 'Раунд' : 'Round') + ' ' + (round + 1) + '/' + ROUNDS;
    g.fillText(info, cv.W / 2, gy0 + size * cs + 22);
    // color buttons
    var step = cv.W / 6;
    for (var b = 0; b < 6; b++) {
      var bx = step * b + step / 2;
      g.beginPath();
      g.arc(bx, btnY, btnR, 0, Math.PI * 2);
      g.fillStyle = PAL[b];
      g.fill();
      if (grid && b === grid[0]) {
        g.lineWidth = 3;
        g.strokeStyle = C.text;
        g.stroke();
      }
    }
    // banner
    if (banner && now < banner.until) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(0, cv.H / 2 - 34, cv.W, 68);
      g.fillStyle = banner.color;
      g.font = 'bold 22px sans-serif';
      g.fillText(banner.text, cv.W / 2, cv.H / 2);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    draw();
  }

  round = 0; total = 0; wins = 0;
  api.score(0);
  newRound();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
