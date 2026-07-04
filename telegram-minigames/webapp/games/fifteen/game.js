/* Fifteen — classic 15-puzzle, DOM grid, tap tiles or move the gap with arrows. */
(function () {
'use strict';
MG.register('fifteen', function (container, api) {
  var C = api.colors;
  var N = 4;
  var ANIM = api.lowEnd ? 0 : 80;
  var board = new Array(N * N);   // board[idx] = tile number, 0 = gap
  var els = {};                   // tile number -> element
  var gap = N * N - 1;            // index of the gap
  var moves = 0, elapsed = 0, lastTick = 0;
  var started = false, done = false, paused = false;
  var timers = [];
  var boardPx = 0, gapPx = 0, cellPx = 0;

  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
  }

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:10px;font-weight:600;color:' + C.muted + ';';
  var movesEl = document.createElement('span');
  var timeEl = document.createElement('span');
  hud.appendChild(movesEl);
  hud.appendChild(timeEl);
  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'position:relative;border-radius:12px;background:' + C.panel + ';';
  wrap.appendChild(hud);
  wrap.appendChild(boardEl);
  container.appendChild(wrap);

  function fmt() {
    var s = Math.floor(elapsed / 1000);
    var m = (s / 60) | 0;
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function updateHud() {
    movesEl.textContent = api.t('moves') + ': ' + moves;
    timeEl.textContent = api.t('time') + ': ' + fmt();
  }

  function pos(i) { return gapPx + i * (cellPx + gapPx); }
  function layout() {
    var w = container.clientWidth || 320, h = container.clientHeight || 480;
    boardPx = Math.min(420, Math.max(160, Math.floor(Math.min(w * 0.94, h * 0.8))));
    gapPx = Math.max(3, Math.round(boardPx * 0.02));
    cellPx = Math.floor((boardPx - gapPx * (N + 1)) / N);
    boardPx = cellPx * N + gapPx * (N + 1);
    boardEl.style.width = boardEl.style.height = boardPx + 'px';
    hud.style.width = boardPx + 'px';
    var fs = Math.floor(cellPx * 0.42) + 'px';
    for (var v = 1; v < N * N; v++) {
      var el = els[v];
      el.style.width = el.style.height = cellPx + 'px';
      el.style.fontSize = fs;
    }
    draw(true);
  }

  function draw(instant) {
    for (var i = 0; i < N * N; i++) {
      var v = board[i];
      if (!v) continue;
      var el = els[v];
      if (instant && ANIM) el.style.transition = 'none';
      el.style.transform = 'translate(' + pos(i % N) + 'px,' + pos((i / N) | 0) + 'px)';
      el.style.color = board[i] === i + 1 ? C.accent : C.text;
      if (instant && ANIM) { void el.offsetWidth; el.style.transition = 'transform ' + ANIM + 'ms ease'; }
    }
  }

  /* ---- puzzle logic ---- */
  function neighbors(i) {
    var r = (i / N) | 0, c = i % N, out = [];
    if (c > 0) out.push(i - 1);
    if (c < N - 1) out.push(i + 1);
    if (r > 0) out.push(i - N);
    if (r < N - 1) out.push(i + N);
    return out;
  }
  function isSolved() {
    for (var i = 0; i < N * N - 1; i++) if (board[i] !== i + 1) return false;
    return true;
  }
  function shuffle() {
    do {
      for (var i = 0; i < N * N; i++) board[i] = (i + 1) % (N * N);
      gap = N * N - 1;
      var last = -1;
      for (var k = 0; k < 300; k++) {
        var opts = [], nb = neighbors(gap);
        for (var j = 0; j < nb.length; j++) if (nb[j] !== last) opts.push(nb[j]);
        var n = opts[(Math.random() * opts.length) | 0];
        board[gap] = board[n];
        board[n] = 0;
        last = gap;
        gap = n;
      }
    } while (isSolved());
  }

  function slide(i) {
    // slide the tile at index i into the gap (i must be adjacent to the gap)
    if (done || paused || !board[i]) return;
    if (neighbors(gap).indexOf(i) < 0) return;
    board[gap] = board[i];
    board[i] = 0;
    gap = i;
    moves++;
    if (!started) { started = true; lastTick = Date.now(); }
    api.haptic('light');
    updateHud();
    draw(false);
    if (isSolved()) {
      done = true;
      var sec = Math.floor(elapsed / 1000);
      var score = Math.max(50, 5000 - moves * 10 - sec * 5);
      api.score(score);
      api.haptic('success');
      later(function () { api.gameOver(score, { win: true }); }, ANIM + 300);
    }
  }

  /* ---- input ---- */
  function onTap(e) {
    var t = e.target;
    while (t && t !== boardEl && !t.getAttribute('data-n')) t = t.parentNode;
    if (!t || t === boardEl) return;
    var v = +t.getAttribute('data-n');
    for (var i = 0; i < N * N; i++) if (board[i] === v) { slide(i); return; }
  }
  var EVT = window.PointerEvent ? 'pointerdown' : 'click';
  boardEl.addEventListener(EVT, onTap);

  function onKey(e) {
    // arrows move the GAP: the adjacent tile slides into it
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    var r = (gap / N) | 0, c = gap % N;
    var nc = c + d[0], nr = r + d[1];
    if (nc < 0 || nc >= N || nr < 0 || nr >= N) return;
    slide(nr * N + nc);
  }
  window.addEventListener('keydown', onKey);
  function onResize() { layout(); }
  window.addEventListener('resize', onResize);

  /* ---- timer ---- */
  var ticker = setInterval(function () {
    var now = Date.now();
    if (started && !done && !paused) {
      elapsed += now - lastTick;
      timeEl.textContent = api.t('time') + ': ' + fmt();
    }
    lastTick = now;
  }, 500);

  /* ---- start ---- */
  shuffle();
  for (var v = 1; v < N * N; v++) {
    var el = document.createElement('div');
    el.setAttribute('data-n', v);
    el.textContent = v;
    el.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;' +
      'border-radius:8px;font-weight:700;cursor:pointer;user-select:none;-webkit-user-select:none;' +
      'background:' + C.panel2 + ';color:' + C.text + ';will-change:transform;' +
      (ANIM ? 'transition:transform ' + ANIM + 'ms ease;' : '');
    boardEl.appendChild(el);
    els[v] = el;
  }
  layout();
  updateHud();
  api.score(0);

  return {
    destroy: function () {
      clearInterval(ticker);
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      boardEl.removeEventListener(EVT, onTap);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; lastTick = Date.now(); }
  };
});
})();
