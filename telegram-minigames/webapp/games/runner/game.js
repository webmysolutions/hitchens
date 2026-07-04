/* Runner — endless dino-style runner. MG game contract. */
(function () {
'use strict';
MG.register('runner', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var GROUND_H = 52;
  var DINO_X = 56, DINO_W = 30, DINO_H = 42;
  var JUMP_V = -700;
  var GRAV_HOLD = 1650;      // while rising and holding — floatier, higher jump
  var GRAV = 3400;
  var PXM = 40;              // pixels per meter

  var groundY;               // y of ground line
  var dinoY, vy, onGround, holding;
  var obs, dist, score, speed, nextSpawn;
  var alive, started;
  var dots1, dots2;          // parallax dot layers
  var raf = 0, last = 0, paused = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function initDots() {
    dots1 = []; dots2 = [];
    if (api.lowEnd) return;
    for (var i = 0; i < 14; i++) dots1.push({ x: Math.random() * cv.W, y: rnd(8, 20) });
    for (i = 0; i < 10; i++) dots2.push({ x: Math.random() * cv.W, y: rnd(26, GROUND_H - 10) });
  }

  function layout() {
    groundY = cv.H - GROUND_H;
    initDots();
  }
  cv.onResize = function () { layout(); };

  function reset() {
    dinoY = 0;               // height above ground (px, >=0)
    vy = 0;
    onGround = true;
    holding = false;
    obs = [];
    dist = 0;
    score = 0;
    speed = 280;
    nextSpawn = cv.W + 100;
    alive = true;
    started = false;
    api.score(0);
  }

  function spawn() {
    var r = Math.random();
    if (r < 0.6 || dist < 400) {
      // cactus: 1-3 stems
      var n = 1 + ((Math.random() * Math.min(3, 1 + dist / 2500)) | 0);
      obs.push({ kind: 0, x: cv.W + 20, w: n * 20 + 4, h: rnd(38, 52), n: n });
    } else {
      // bird: low (jump it) or high (run under it — do NOT jump)
      var high = Math.random() < 0.45;
      obs.push({ kind: high ? 2 : 1, x: cv.W + 20, w: 32, h: 22,
                 cy: groundY - (high ? 88 : 40), vx: 60 });
    }
    nextSpawn = cv.W + rnd(280, 520) + speed * 0.5;
  }

  function press() {
    if (!started) { started = true; return; }
    holding = true;
    if (onGround && alive) {
      vy = JUMP_V;
      onGround = false;
      api.haptic('light');
    }
  }
  function release() { holding = false; }

  function onDown(e) { e.preventDefault(); press(); }
  function onUp() { release(); }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      if (!e.repeat) press();
      e.preventDefault();
    }
  }
  function onKeyUp(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') release();
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  function die() {
    alive = false;
    api.haptic('error');
    api.gameOver(score);
  }

  function update(dt) {
    speed = Math.min(620, 280 + dist * 0.012);
    dist += speed * dt;

    var m = (dist / PXM) | 0;
    if (m !== score) {
      if (m > 0 && score > 0 && ((m / 100) | 0) > ((score / 100) | 0)) api.haptic('success');
      score = m;
      api.score(score);
    }

    // jump physics (hold while rising = floatier = higher jump); dinoY is height above ground
    if (!onGround) {
      vy += (vy < 0 && holding ? GRAV_HOLD : GRAV) * dt;
      dinoY -= vy * dt;
      if (dinoY <= 0) { dinoY = 0; vy = 0; onGround = true; }
    }

    // obstacles
    nextSpawn -= speed * dt;
    if (nextSpawn <= cv.W) spawn();
    for (var i = obs.length - 1; i >= 0; i--) {
      var o = obs[i];
      o.x -= (speed + (o.vx || 0)) * dt;
      if (o.x + o.w < -20) obs.splice(i, 1);
    }

    // parallax dots
    if (!api.lowEnd) {
      for (i = 0; i < dots1.length; i++) {
        dots1[i].x -= speed * dt;
        if (dots1[i].x < -4) { dots1[i].x = cv.W + 4; dots1[i].y = rnd(8, 20); }
      }
      for (i = 0; i < dots2.length; i++) {
        dots2[i].x -= speed * 0.55 * dt;
        if (dots2[i].x < -4) { dots2[i].x = cv.W + 4; dots2[i].y = rnd(26, GROUND_H - 10); }
      }
    }

    // collision (AABB, slightly forgiving)
    var dx = DINO_X + 4, dw = DINO_W - 8;
    var dTop = groundY - dinoY - DINO_H + 6, dBot = groundY - dinoY - 2;
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      var ox = o.x + 3, ow = o.w - 6, oTop, oBot;
      if (o.kind === 0) { oTop = groundY - o.h + 4; oBot = groundY; }
      else { oTop = o.cy - o.h / 2 + 3; oBot = o.cy + o.h / 2 - 3; }
      if (dx < ox + ow && dx + dw > ox && dTop < oBot && dBot > oTop) { die(); return; }
    }
  }

  function draw(ts) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);

    // ground
    g.fillStyle = C.panel;
    g.fillRect(0, groundY, cv.W, GROUND_H);
    g.strokeStyle = C.muted;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, groundY);
    g.lineTo(cv.W, groundY);
    g.stroke();

    // parallax dots (skipped on lowEnd)
    if (!api.lowEnd) {
      g.fillStyle = C.muted;
      for (var i = 0; i < dots1.length; i++) g.fillRect(dots1[i].x, groundY + dots1[i].y, 3, 2);
      g.fillStyle = C.panel2;
      for (i = 0; i < dots2.length; i++) g.fillRect(dots2[i].x, groundY + dots2[i].y, 4, 3);
    }

    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    // obstacles
    for (i = 0; i < obs.length; i++) {
      var o = obs[i];
      if (o.kind === 0) {
        g.font = Math.round(o.h) + 'px sans-serif';
        for (var k = 0; k < o.n; k++) g.fillText('🌵', o.x + 10 + k * 20, groundY + 2);
      } else {
        var flap = ((ts / 160) | 0) % 2;
        g.save();
        g.translate(o.x + o.w / 2, o.cy + o.h / 2);
        g.scale(-1, flap ? 0.85 : 1); // face the dino, cheap wing flap
        g.font = '26px sans-serif';
        g.fillText('🐦', 0, 8);
        g.restore();
      }
    }

    // dino
    var dy = groundY - dinoY;
    g.save();
    g.translate(DINO_X + DINO_W / 2, dy);
    g.scale(-1, 1); // 🦖 faces left by default — flip to run right
    g.font = '40px sans-serif';
    var bob = (onGround && started && alive && !api.lowEnd) ? (((ts / 120) | 0) % 2) : 0;
    g.fillText('🦖', 0, 2 - bob);
    g.restore();

    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.textBaseline = 'middle';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2 - 14);
      g.fillStyle = C.muted;
      g.font = '14px sans-serif';
      g.fillText(api.lang === 'ru' ? 'Тап — прыжок, держи — выше' : 'Tap to jump, hold for higher',
        cv.W / 2, cv.H / 2 + 14);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last) / 1000;
    last = ts;
    if (started && alive) update(dt);
    draw(ts);
  }

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      container.removeEventListener('pointerdown', onDown);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
