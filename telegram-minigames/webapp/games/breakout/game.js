/* Breakout — Arkanoid-style brick breaker. MG game contract. */
(function () {
'use strict';
MG.register('breakout', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var ROW_COLORS = [C.bad, '#e6a23c', '#e8d44d', C.good, '#35c4cf', C.accent];
  var BCOLS = 8;

  var pad = { x: 0, y: 0, w: 0, h: 12 };
  var ball = { x: 0, y: 0, vx: 0, vy: 0, r: 7, speed: 0 };
  var bricks = [];
  var score, lives, level, alive, started, waiting;
  var hearts = '';
  var raf = 0, last = 0, paused = false;
  var keyL = false, keyR = false;
  var dragging = false, lastPX = 0, downT = 0, moved = 0;

  function layout() {
    pad.w = Math.max(56, cv.W * 0.24);
    pad.y = cv.H - 36;
    if (pad.x === 0) pad.x = cv.W / 2;
    clampPad();
    buildBricks();
  }
  cv.onResize = function () { layout(); draw(); };

  function clampPad() {
    if (pad.x < pad.w / 2) pad.x = pad.w / 2;
    if (pad.x > cv.W - pad.w / 2) pad.x = cv.W - pad.w / 2;
  }

  function buildBricks() {
    bricks.length = 0;
    var rows = Math.min(9, 5 + level);
    var gap = 4, top = 52;
    var bw = (cv.W - 16 - gap * (BCOLS - 1)) / BCOLS;
    var bh = Math.max(14, Math.min(22, cv.H * 0.03));
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < BCOLS; c++) {
        bricks.push({
          x: 8 + c * (bw + gap), y: top + r * (bh + gap),
          w: bw, h: bh, live: true,
          col: ROW_COLORS[r % ROW_COLORS.length]
        });
      }
    }
  }

  function ballSpeed() { return 260 + (level - 1) * 40; }

  function resetBall() {
    waiting = true;
    ball.speed = ballSpeed();
    ball.x = pad.x;
    ball.y = pad.y - pad.h / 2 - ball.r - 1;
    ball.vx = 0;
    ball.vy = 0;
  }

  function reset() {
    score = 0; lives = 3; level = 1;
    alive = true; started = false;
    hearts = '❤❤❤';
    pad.x = cv.W / 2;
    buildBricks();
    resetBall();
    api.score(0);
  }

  function launch() {
    if (!alive || !waiting) return;
    waiting = false;
    started = true;
    var a = (Math.random() * 0.6 - 0.3);
    ball.vx = Math.sin(a) * ball.speed;
    ball.vy = -Math.cos(a) * ball.speed;
  }

  function loseLife() {
    lives--;
    hearts = lives > 0 ? '❤❤❤'.slice(0, lives) : '';
    api.haptic('error');
    if (lives <= 0) {
      alive = false;
      api.gameOver(score);
      return;
    }
    resetBall();
  }

  function levelUp() {
    level++;
    api.haptic('success');
    buildBricks();
    resetBall();
  }

  function physics(dt) {
    // keyboard paddle
    if (keyL) { pad.x -= 420 * dt; clampPad(); }
    if (keyR) { pad.x += 420 * dt; clampPad(); }
    if (waiting) { ball.x = pad.x; ball.y = pad.y - pad.h / 2 - ball.r - 1; return; }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // walls
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = -ball.vx; }
    else if (ball.x > cv.W - ball.r) { ball.x = cv.W - ball.r; ball.vx = -ball.vx; }
    if (ball.y < ball.r) { ball.y = ball.r; ball.vy = -ball.vy; }

    // paddle
    if (ball.vy > 0 &&
        ball.y + ball.r >= pad.y - pad.h / 2 && ball.y - ball.r <= pad.y + pad.h / 2 &&
        ball.x >= pad.x - pad.w / 2 - ball.r && ball.x <= pad.x + pad.w / 2 + ball.r) {
      var rel = (ball.x - pad.x) / (pad.w / 2);
      if (rel < -1) rel = -1; else if (rel > 1) rel = 1;
      var ang = rel * 1.05; // max ~60° from vertical
      ball.speed = Math.min(560, ball.speed + 4);
      ball.vx = Math.sin(ang) * ball.speed;
      ball.vy = -Math.cos(ang) * ball.speed;
      ball.y = pad.y - pad.h / 2 - ball.r;
    }

    // bricks
    var remaining = 0;
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.live) continue;
      remaining++;
      if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w ||
          ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) continue;
      b.live = false;
      remaining--;
      score += 10;
      api.score(score);
      // reflect on the axis of least penetration
      var px = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
      var py = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
      if (px < py) ball.vx = -ball.vx; else ball.vy = -ball.vy;
      break;
    }
    if (remaining === 0 && started) { levelUp(); return; }

    // bottom
    if (ball.y - ball.r > cv.H) loseLife();
  }

  // input: drag anywhere moves paddle by horizontal delta; quick tap launches
  function onDown(e) {
    dragging = true;
    lastPX = e.clientX;
    downT = performance.now();
    moved = 0;
  }
  function onMove(e) {
    if (!dragging) return;
    var dx = e.clientX - lastPX;
    lastPX = e.clientX;
    moved += Math.abs(dx);
    pad.x += dx;
    clampPad();
  }
  function onUp() {
    if (dragging && moved < 10 && performance.now() - downT < 350) launch();
    dragging = false;
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function onKey(e) {
    if (e.key === 'ArrowLeft') keyL = true;
    else if (e.key === 'ArrowRight') keyR = true;
    else if (e.key === ' ' || e.key === 'ArrowUp') launch();
    else return;
    e.preventDefault();
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft') keyL = false;
    else if (e.key === 'ArrowRight') keyR = false;
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.live) continue;
      g.fillStyle = b.col;
      g.fillRect(b.x, b.y, b.w, b.h);
    }
    // paddle
    g.fillStyle = C.accent;
    g.fillRect(pad.x - pad.w / 2, pad.y - pad.h / 2, pad.w, pad.h);
    // ball
    g.fillStyle = C.text;
    g.beginPath();
    g.arc(ball.x, ball.y, ball.r, 0, 6.2832);
    g.fill();
    // lives (top-right corner)
    g.fillStyle = C.bad;
    g.font = '16px sans-serif';
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.fillText(hearts, cv.W - 8, 8);
    // level (top-left)
    g.fillStyle = C.muted;
    g.font = '12px sans-serif';
    g.textAlign = 'left';
    g.fillText(api.t('level') + ' ' + level, 8, 10);
    if (waiting && alive) {
      if (!started) {
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(0, 0, cv.W, cv.H);
      }
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H * 0.62);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(40, ts - last) / 1000;
    last = ts;
    if (alive) physics(dt);
    draw();
  }

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
