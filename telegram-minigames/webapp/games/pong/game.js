/* Pong — portrait, player vs AI, first to 7. MG game contract. */
(function () {
'use strict';
MG.register('pong', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var WIN_PTS = 7;
  var pl = { x: 0, y: 0, w: 0, h: 12 };   // player, bottom
  var ai = { x: 0, y: 0, w: 0, h: 12 };   // AI, top
  var ball = { x: 0, y: 0, vx: 0, vy: 0, r: 7 };
  var plPts, aiPts, rally, over, started, waiting, serveAcc, serveDir;
  var raf = 0, last = 0, paused = false;
  var keyL = false, keyR = false;
  var dragging = false, lastPX = 0;

  function layout() {
    pl.w = Math.max(56, cv.W * 0.28);
    ai.w = pl.w;
    pl.y = cv.H - 28;
    ai.y = 28;
    ball.r = Math.max(6, cv.W * 0.016);
    clampX(pl); clampX(ai);
  }
  cv.onResize = function () { layout(); draw(); };

  function clampX(p) {
    if (p.x < p.w / 2) p.x = p.w / 2;
    if (p.x > cv.W - p.w / 2) p.x = cv.W - p.w / 2;
  }

  function baseSpeed() { return Math.max(300, cv.H * 0.45); }
  function maxSpeed() { return baseSpeed() * 2.4; }

  function resetBall(dir) {
    ball.x = cv.W / 2;
    ball.y = cv.H / 2;
    ball.vx = 0;
    ball.vy = 0;
    serveDir = dir;
    waiting = true;
    serveAcc = 0;
    rally = 0;
  }

  function serve() {
    waiting = false;
    var s = baseSpeed();
    var a = Math.random() * 0.8 - 0.4;
    ball.vx = Math.sin(a) * s;
    ball.vy = Math.cos(a) * s * serveDir; // 1 = toward player, -1 = toward AI
  }

  function reset() {
    plPts = 0; aiPts = 0;
    over = false; started = false;
    pl.x = cv.W / 2; ai.x = cv.W / 2;
    resetBall(1);
    api.score(0);
  }

  function speedOf() { return Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy); }

  function paddleBounce(p, up) {
    var rel = (ball.x - p.x) / (p.w / 2);
    if (rel < -1) rel = -1; else if (rel > 1) rel = 1;
    var s = Math.min(maxSpeed(), speedOf() * 1.05 + 6);
    var ang = rel * 1.0;
    ball.vx = Math.sin(ang) * s;
    ball.vy = (up ? -1 : 1) * Math.cos(ang) * s;
    rally++;
  }

  function point(playerScored) {
    if (playerScored) {
      plPts++;
      api.score(plPts * 10);
      api.haptic('success');
    } else {
      aiPts++;
      api.haptic('error');
    }
    if (plPts >= WIN_PTS || aiPts >= WIN_PTS) {
      over = true;
      var win = plPts >= WIN_PTS;
      api.gameOver(plPts * 10 + (win ? 50 : 0), { win: win });
      return;
    }
    resetBall(playerScored ? -1 : 1); // serve toward the loser
  }

  function physics(dt) {
    if (keyL) { pl.x -= 460 * dt; clampX(pl); }
    if (keyR) { pl.x += 460 * dt; clampX(pl); }

    if (waiting) {
      serveAcc += dt;
      if (serveAcc >= 0.8) serve();
      return;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // side walls
    if (ball.x < ball.r) { ball.x = ball.r; ball.vx = -ball.vx; }
    else if (ball.x > cv.W - ball.r) { ball.x = cv.W - ball.r; ball.vx = -ball.vx; }

    // AI: track ball with capped speed that grows with rally
    var aiMax = Math.min(cv.W * 1.4, (110 + rally * 26) * (cv.W / 320));
    var dx = ball.x - ai.x;
    var step = aiMax * dt;
    if (dx > step) ai.x += step; else if (dx < -step) ai.x -= step; else ai.x = ball.x;
    clampX(ai);

    // player paddle
    if (ball.vy > 0 &&
        ball.y + ball.r >= pl.y - pl.h / 2 && ball.y - ball.r <= pl.y + pl.h / 2 &&
        ball.x >= pl.x - pl.w / 2 - ball.r && ball.x <= pl.x + pl.w / 2 + ball.r) {
      ball.y = pl.y - pl.h / 2 - ball.r;
      paddleBounce(pl, true);
      api.haptic('light');
    }
    // AI paddle
    if (ball.vy < 0 &&
        ball.y - ball.r <= ai.y + ai.h / 2 && ball.y + ball.r >= ai.y - ai.h / 2 &&
        ball.x >= ai.x - ai.w / 2 - ball.r && ball.x <= ai.x + ai.w / 2 + ball.r) {
      ball.y = ai.y + ai.h / 2 + ball.r;
      paddleBounce(ai, false);
    }

    if (ball.y - ball.r > cv.H) point(false);       // past player: AI scores
    else if (ball.y + ball.r < 0) point(true);      // past AI: player scores
  }

  // input: drag anywhere to move player paddle
  function onDown(e) {
    dragging = true;
    lastPX = e.clientX;
    if (!started && !over) started = true;
  }
  function onMove(e) {
    if (!dragging) return;
    pl.x += e.clientX - lastPX;
    lastPX = e.clientX;
    clampX(pl);
  }
  function onUp() { dragging = false; }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keyL = true;
    else if (e.key === 'ArrowRight' || e.key === 'd') keyR = true;
    else if (e.key === ' ') { if (!started) started = true; }
    else return;
    e.preventDefault();
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keyL = false;
    else if (e.key === 'ArrowRight' || e.key === 'd') keyR = false;
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // center line
    g.strokeStyle = C.panel2;
    g.lineWidth = 2;
    g.setLineDash([8, 10]);
    g.beginPath();
    g.moveTo(0, cv.H / 2);
    g.lineTo(cv.W, cv.H / 2);
    g.stroke();
    g.setLineDash([]);
    // scores
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = C.muted;
    g.fillText('' + aiPts, cv.W / 2, cv.H * 0.32);
    g.fillStyle = C.accent;
    g.fillText('' + plPts, cv.W / 2, cv.H * 0.68);
    // paddles
    g.fillStyle = C.accent;
    g.fillRect(pl.x - pl.w / 2, pl.y - pl.h / 2, pl.w, pl.h);
    g.fillStyle = C.bad;
    g.fillRect(ai.x - ai.w / 2, ai.y - ai.h / 2, ai.w, ai.h);
    // ball
    g.fillStyle = C.text;
    g.beginPath();
    g.arc(ball.x, ball.y, ball.r, 0, 6.2832);
    g.fill();
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.fillText(api.lang === 'ru' ? 'До ' + WIN_PTS + ' очков' : 'First to ' + WIN_PTS,
        cv.W / 2, cv.H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(40, ts - last) / 1000;
    last = ts;
    if (started && !over) physics(dt);
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
