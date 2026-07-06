/* Shooter — space-invaders-like. Drag to move, autofire. */
(function () {
'use strict';
MG.register('shooter', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var raf = 0, last = 0, paused = false;
  var started, over, score, lives, wave;
  var ship, bullets, ebullets, aliens, parts;
  var fireAcc, alienDir, alienSpeed, baseSpeed, stepDown, shootAcc, shootEvery, invT, waveFlash;
  var keys = { left: false, right: false };
  var SHIP_W = 42, SHIP_H = 24;
  var MAXP = api.lowEnd ? 20 : 60;

  function shipY() { return cv.H - 64; }

  function newWave() {
    aliens = [];
    var rows = Math.min(5, 3 + ((wave - 1) >> 1));
    var cols = 6;
    var cell = Math.min(52, (cv.W - 30) / cols);
    var ox = (cv.W - cell * cols) / 2 + cell / 2;
    var oy = 70;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        aliens.push({
          x: ox + c * cell, y: oy + r * (cell * 0.85), row: r, rows: rows,
          r: cell * 0.36, em: r === 0 ? '🛸' : '👾'
        });
      }
    }
    alienDir = 1;
    baseSpeed = 26 + wave * 9;
    stepDown = 14;
    shootEvery = Math.max(500, 1600 - wave * 130);
    shootAcc = 0;
    waveFlash = wave > 1 ? 1400 : 0;
  }

  function reset() {
    score = 0; lives = 3; wave = 1;
    started = false; over = false;
    ship = { x: cv.W / 2, tx: cv.W / 2 };
    bullets = []; ebullets = []; parts = [];
    fireAcc = 0; invT = 0;
    api.score(0);
    newWave();
  }

  function boom(x, y, col, n) {
    if (api.lowEnd) n = Math.min(3, n);
    for (var i = 0; i < n && parts.length < MAXP; i++) {
      var a = Math.random() * 6.283, s = 40 + Math.random() * 120;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 450, col: col });
    }
  }

  function die() {
    over = true;
    api.haptic('error');
    api.gameOver(score);
  }

  function hitShip() {
    if (invT > 0 || over) return;
    lives--;
    api.haptic('error');
    boom(ship.x, shipY(), C.bad, 12);
    if (lives <= 0) { die(); return; }
    invT = 1500;
    ebullets.length = 0;
  }

  function update(dt) {
    var s = dt / 1000;
    // ship movement
    if (keys.left) ship.tx -= 320 * s;
    if (keys.right) ship.tx += 320 * s;
    ship.tx = Math.max(SHIP_W / 2, Math.min(cv.W - SHIP_W / 2, ship.tx));
    ship.x += (ship.tx - ship.x) * Math.min(1, s * 14);
    if (invT > 0) invT -= dt;
    if (waveFlash > 0) waveFlash -= dt;

    // autofire
    fireAcc += dt;
    if (fireAcc >= 340) {
      fireAcc = 0;
      bullets.push({ x: ship.x, y: shipY() - SHIP_H / 2 });
    }

    // alien group speed ramps as they thin out
    var total = 0; for (var i = 0; i < aliens.length; i++) total++;
    var full = 6 * Math.min(5, 3 + ((wave - 1) >> 1));
    alienSpeed = baseSpeed * (1 + (1 - total / full) * 1.6);
    var minX = 1e9, maxX = -1e9, maxY = -1e9;
    for (i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      a.x += alienDir * alienSpeed * s;
      if (a.x - a.r < minX) minX = a.x - a.r;
      if (a.x + a.r > maxX) maxX = a.x + a.r;
      if (a.y + a.r > maxY) maxY = a.y + a.r;
    }
    if (aliens.length && (minX < 8 && alienDir < 0 || maxX > cv.W - 8 && alienDir > 0)) {
      alienDir = -alienDir;
      for (i = 0; i < aliens.length; i++) aliens[i].y += stepDown;
    }
    if (maxY >= shipY() - SHIP_H / 2) { die(); return; }

    // aliens shoot: bottom-most alien of a random column
    shootAcc += dt;
    if (shootAcc >= shootEvery && aliens.length) {
      shootAcc = 0;
      var sh = aliens[(Math.random() * aliens.length) | 0];
      for (i = 0; i < aliens.length; i++) {
        var b = aliens[i];
        if (Math.abs(b.x - sh.x) < b.r && b.y > sh.y) sh = b;
      }
      ebullets.push({ x: sh.x, y: sh.y + sh.r, vy: 130 + wave * 18 });
    }

    // player bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      var p = bullets[i];
      p.y -= 460 * s;
      if (p.y < -10) { bullets.splice(i, 1); continue; }
      for (var j = aliens.length - 1; j >= 0; j--) {
        a = aliens[j];
        if (Math.abs(p.x - a.x) < a.r && Math.abs(p.y - a.y) < a.r) {
          score += 10 * (a.rows - a.row);
          api.score(score);
          api.haptic('light');
          boom(a.x, a.y, C.accent, 8);
          aliens.splice(j, 1);
          bullets.splice(i, 1);
          break;
        }
      }
    }
    if (!aliens.length && !over) {
      score += 50 * wave;
      api.score(score);
      api.haptic('success');
      wave++;
      newWave();
      bullets.length = 0; ebullets.length = 0;
    }

    // enemy bullets
    for (i = ebullets.length - 1; i >= 0; i--) {
      p = ebullets[i];
      p.y += p.vy * s;
      if (p.y > cv.H + 10) { ebullets.splice(i, 1); continue; }
      if (Math.abs(p.x - ship.x) < SHIP_W * 0.4 && Math.abs(p.y - shipY()) < SHIP_H * 0.7) {
        ebullets.splice(i, 1);
        hitShip();
      }
    }

    // particles
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.t -= dt;
      if (p.t <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * s; p.y += p.vy * s;
    }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // aliens
    for (var i = 0; i < aliens.length; i++) {
      var a = aliens[i];
      g.font = (a.r * 2) + 'px sans-serif';
      g.fillText(a.em, a.x, a.y);
    }
    // bullets
    g.fillStyle = C.accent;
    for (i = 0; i < bullets.length; i++) g.fillRect(bullets[i].x - 2, bullets[i].y - 8, 4, 12);
    g.fillStyle = C.bad;
    for (i = 0; i < ebullets.length; i++) g.fillRect(ebullets[i].x - 2, ebullets[i].y - 6, 4, 10);
    // particles
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      g.globalAlpha = Math.max(0, p.t / 450);
      g.fillStyle = p.col;
      g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    g.globalAlpha = 1;
    // ship (triangle), blinks while invulnerable
    if (!(invT > 0 && ((invT / 120) | 0) % 2)) {
      var sy = shipY();
      g.fillStyle = C.accent;
      g.beginPath();
      g.moveTo(ship.x, sy - SHIP_H / 2);
      g.lineTo(ship.x - SHIP_W / 2, sy + SHIP_H / 2);
      g.lineTo(ship.x + SHIP_W / 2, sy + SHIP_H / 2);
      g.closePath();
      g.fill();
      g.fillStyle = C.panel2;
      g.fillRect(ship.x - 5, sy + SHIP_H / 2 - 6, 10, 5);
    }
    // HUD: lives + wave
    g.font = '16px sans-serif';
    g.textAlign = 'left';
    var hearts = '';
    for (i = 0; i < lives; i++) hearts += '❤️';
    g.fillText(hearts, 10, 22);
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    g.fillText((api.lang === 'ru' ? 'Волна ' : 'Wave ') + wave, cv.W - 10, 22);
    if (waveFlash > 0 && started) {
      g.textAlign = 'center';
      g.fillStyle = C.good;
      g.font = 'bold 22px sans-serif';
      g.fillText((api.lang === 'ru' ? 'Волна ' : 'Wave ') + wave + '!', cv.W / 2, cv.H * 0.45);
    }
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Веди пальцем — корабль следует' : 'Drag your finger to steer', cv.W / 2, cv.H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last);
    last = ts;
    if (started && !over) update(dt);
    draw();
  }

  // input: drag anywhere moves ship to that x
  function px(e) {
    var t = e.touches ? e.touches[0] : e;
    return t.clientX - container.getBoundingClientRect().left;
  }
  var dragging = false;
  function onDown(e) {
    if (over) return;
    if (!started) started = true;
    dragging = true;
    ship.tx = px(e);
    if (e.cancelable) e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    ship.tx = px(e);
    if (e.cancelable) e.preventDefault();
  }
  function onUp() { dragging = false; }
  container.addEventListener('touchstart', onDown, { passive: false });
  container.addEventListener('touchmove', onMove, { passive: false });
  container.addEventListener('touchend', onUp);
  container.addEventListener('mousedown', onDown);
  container.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  function onKey(e) {
    var d = e.type === 'keydown';
    if (e.key === 'ArrowLeft' || e.key === 'a') { keys.left = d; if (d) started = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keys.right = d; if (d) started = true; e.preventDefault(); }
    else if (e.key === ' ' && d) { started = true; e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  cv.onResize = function () {
    ship.tx = Math.min(ship.tx, cv.W - SHIP_W / 2);
    ship.x = Math.min(ship.x, cv.W - SHIP_W / 2);
    draw();
  };

  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('mouseup', onUp);
      container.removeEventListener('touchstart', onDown);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onUp);
      container.removeEventListener('mousedown', onDown);
      container.removeEventListener('mousemove', onMove);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
