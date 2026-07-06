/* Flappy — tap/space to flap, pass pipes. MG game contract. */
(function () {
'use strict';
MG.register('flappy', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var BIRD_X_F = 0.30;      // bird x as fraction of width
  var R = 13;               // bird collision radius
  var PIPE_W = 62;
  var GRAV = 1250;          // forgiving gravity, px/s^2
  var FLAP = -400;          // flap impulse px/s
  var MAX_FALL = 620;

  var bird, pipes, score, alive, started, dead;
  var speed, gap, nextX;    // pipe scroll speed, current gap, x where next pipe spawns
  var raf = 0, last = 0, paused = false;
  var wingT = 0;

  function reset() {
    bird = { x: cv.W * BIRD_X_F, y: cv.H * 0.42, vy: 0 };
    pipes = [];
    score = 0;
    speed = 150;
    gap = 195;
    nextX = cv.W + 60;
    alive = true;
    started = false;
    dead = false;
    api.score(0);
  }

  cv.onResize = function () {
    if (!started) bird.y = cv.H * 0.42;
    bird.x = cv.W * BIRD_X_F;
  };

  function spawnPipe(x) {
    var margin = 70;
    var cy = margin + gap / 2 + Math.random() * (cv.H - 2 * margin - gap);
    pipes.push({ x: x, top: cy - gap / 2, bot: cy + gap / 2, passed: false });
  }

  function flap() {
    if (dead) return;
    if (!started) { started = true; }
    bird.vy = FLAP;
    wingT = 0.18;
  }

  function onDown(e) { e.preventDefault(); flap(); }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { flap(); e.preventDefault(); }
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);

  function die() {
    if (dead) return;
    dead = true;
    alive = false;
    api.haptic('error');
    api.gameOver(score);
  }

  function update(dt) {
    bird.vy = Math.min(MAX_FALL, bird.vy + GRAV * dt);
    bird.y += bird.vy * dt;
    if (wingT > 0) wingT -= dt;

    // ceiling / ground
    if (bird.y - R < 0 || bird.y + R > cv.H) { die(); return; }

    // pipes scroll
    for (var i = pipes.length - 1; i >= 0; i--) {
      var p = pipes[i];
      p.x -= speed * dt;
      if (!p.passed && p.x + PIPE_W < bird.x - R) {
        p.passed = true;
        score++;
        api.score(score);
        gap = Math.max(132, 195 - score * 1.6);
        speed = Math.min(300, 150 + score * 2.5);
        if (score % 10 === 0) api.haptic('success');
      }
      if (p.x + PIPE_W < -10) pipes.splice(i, 1);
    }
    nextX -= speed * dt;
    if (nextX <= cv.W) {
      spawnPipe(cv.W + 10);
      nextX = cv.W + Math.max(210, 250 + gap * 0.3);
    }

    // collisions (circle vs pipe rects, slightly forgiving)
    var r = R - 2;
    for (i = 0; i < pipes.length; i++) {
      p = pipes[i];
      if (bird.x + r > p.x && bird.x - r < p.x + PIPE_W) {
        if (bird.y - r < p.top || bird.y + r > p.bot) { die(); return; }
      }
    }
  }

  function drawPipe(x, y0, y1) {
    g.fillStyle = C.good;
    g.fillRect(x, y0, PIPE_W, y1 - y0);
    // lip
    var lipY = (y0 === 0) ? y1 - 14 : y0;
    g.fillRect(x - 4, lipY, PIPE_W + 8, 14);
    g.strokeStyle = C.bg;
    g.lineWidth = 2;
    g.strokeRect(x, y0, PIPE_W, y1 - y0);
    g.strokeRect(x - 4, lipY, PIPE_W + 8, 14);
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);

    // subtle ground strip
    g.fillStyle = C.panel;
    g.fillRect(0, cv.H - 6, cv.W, 6);

    for (var i = 0; i < pipes.length; i++) {
      var p = pipes[i];
      drawPipe(p.x, 0, p.top);
      drawPipe(p.x, p.bot, cv.H);
    }

    // bird: emoji tilted by velocity
    g.save();
    g.translate(bird.x, bird.y);
    var ang = Math.max(-0.5, Math.min(1.1, bird.vy / 500));
    g.rotate(ang);
    g.font = '28px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🐤', 0, 1);
    // tiny wing flash on flap
    if (wingT > 0 && !api.lowEnd) {
      g.fillStyle = C.accent;
      g.beginPath();
      g.arc(-10, 6, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2 - 14);
      g.fillStyle = C.muted;
      g.font = '14px sans-serif';
      g.fillText(api.lang === 'ru' ? 'Тап — взмах' : 'Tap to flap', cv.W / 2, cv.H / 2 + 14);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last) / 1000;
    last = ts;
    if (started && alive) update(dt);
    else if (!started) bird.y = cv.H * 0.42 + Math.sin(ts / 300) * 6; // idle bob
    draw();
  }

  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      container.removeEventListener('pointerdown', onDown);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
