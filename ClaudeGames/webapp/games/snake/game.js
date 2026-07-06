/* Snake — reference implementation of the MG game contract. */
(function () {
'use strict';
MG.register('snake', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var COLS = 17, ROWS = 24;
  var cell, ox, oy; // cell size and board offset
  var snake, dir, nextDir, food, score, alive, started, stepMs, acc;
  var raf = 0, last = 0, paused = false;

  function layout() {
    cell = Math.floor(Math.min(cv.W / COLS, cv.H / ROWS));
    ox = Math.floor((cv.W - cell * COLS) / 2);
    oy = Math.floor((cv.H - cell * ROWS) / 2);
  }
  cv.onResize = function () { layout(); draw(); };

  function reset() {
    snake = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    stepMs = 170;
    acc = 0;
    alive = true;
    started = false;
    api.score(0);
    spawnFood();
  }

  function spawnFood() {
    while (true) {
      var f = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 };
      var hit = snake.some(function (s) { return s.x === f.x && s.y === f.y; });
      if (!hit) { food = f; return; }
    }
  }

  function setDir(d) {
    var m = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }[d];
    if (!m) return;
    if (m.x === -dir.x && m.y === -dir.y) return; // no reversing
    nextDir = m;
    if (!started) started = true;
  }

  var offSwipe = api.swipe(container, function (d) {
    if (!alive) return;
    if (d === 'tap') { started = true; return; }
    setDir(d);
  });

  function onKey(e) {
    var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    if (map[e.key]) { setDir(map[e.key]); e.preventDefault(); }
    else if (e.key === ' ') started = true;
  }
  window.addEventListener('keydown', onKey);

  function step() {
    dir = nextDir;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
        snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      alive = false;
      api.haptic('error');
      api.gameOver(score);
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      api.score(score);
      api.haptic('light');
      stepMs = Math.max(70, stepMs - 2); // gradually faster
      spawnFood();
    } else {
      snake.pop();
    }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // board
    g.fillStyle = C.panel;
    g.fillRect(ox, oy, cell * COLS, cell * ROWS);
    // food
    g.font = (cell - 2) + 'px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🍎', ox + food.x * cell + cell / 2, oy + food.y * cell + cell / 2 + 1);
    // snake
    for (var i = snake.length - 1; i >= 0; i--) {
      var s = snake[i];
      g.fillStyle = i === 0 ? C.accent : C.good;
      var pad = i === 0 ? 1 : 2;
      g.fillRect(ox + s.x * cell + pad, oy + s.y * cell + pad, cell - pad * 2, cell - pad * 2);
    }
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(100, ts - last);
    last = ts;
    if (started && alive) {
      acc += dt;
      while (acc >= stepMs && alive) { acc -= stepMs; step(); }
    }
    draw();
  }

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
