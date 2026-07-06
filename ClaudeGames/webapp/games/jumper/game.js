/* Jumper — doodle-jump-like vertical hopper. MG game contract. */
(function () {
'use strict';
MG.register('jumper', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var PW = 58, PH = 12;         // platform size
  var GRAV = 2100;
  var JUMP = -860;
  var SPRING = -1380;
  var PXM = 60;                 // pixels per meter
  var T_STATIC = 0, T_MOVING = 1, T_BREAK = 2;

  var player, plats, camY, topGenY, maxRise, score, alive, started;
  var targetX = null, keyDir = 0;
  var raf = 0, last = 0, paused = false;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function makePlat(y, forceStatic) {
    var h = -y;                          // difficulty grows with height climbed
    var t = T_STATIC, spring = false;
    if (!forceStatic) {
      var r = Math.random();
      var pMove = Math.min(0.30, h / 12000);
      var pBreak = Math.min(0.22, h / 15000);
      if (r < pMove) t = T_MOVING;
      else if (r < pMove + pBreak) t = T_BREAK;
      if (t !== T_BREAK && Math.random() < 0.08) spring = true;
    }
    return {
      x: rnd(4, cv.W - PW - 4), y: y, t: t, spring: spring,
      dir: Math.random() < 0.5 ? -1 : 1,
      spd: rnd(40, 80) + Math.min(80, h / 100),
      broken: false
    };
  }

  function gen() {                      // generate platforms above camera
    while (topGenY > camY - 120) {
      var h = camY < 0 ? -camY : 0;
      topGenY -= rnd(52, 78) + Math.min(50, h / 200);
      plats.push(makePlat(topGenY));
    }
    // drop platforms far below view
    for (var i = plats.length - 1; i >= 0; i--) {
      if (plats[i].y > camY + cv.H + 80) plats.splice(i, 1);
    }
  }

  function reset() {
    player = { x: cv.W / 2, y: -30, vx: 0, vy: 0, w: 26, h: 30 };
    plats = [{ x: cv.W / 2 - PW / 2, y: 20, t: T_STATIC, spring: false, dir: 1, spd: 0, broken: false }];
    camY = -cv.H + 60;                  // world y of canvas top
    topGenY = 20;
    maxRise = 0;
    score = 0;
    alive = true;
    started = false;
    targetX = null;
    keyDir = 0;
    api.score(0);
    gen();
  }

  cv.onResize = function () { gen(); };

  // --- input: steer toward finger x ---
  function ptX(e) {
    var r = container.getBoundingClientRect();
    return e.clientX - r.left;
  }
  function onDown(e) { e.preventDefault(); started = true; targetX = ptX(e); }
  function onMove(e) { if (targetX !== null) targetX = ptX(e); }
  function onUp() { targetX = null; }
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { keyDir = -1; started = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keyDir = 1; started = true; e.preventDefault(); }
    else if (e.key === ' ') started = true;
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { if (keyDir === -1) keyDir = 0; }
    else if (e.key === 'ArrowRight' || e.key === 'd') { if (keyDir === 1) keyDir = 0; }
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  function update(dt) {
    // steering
    var MAXV = 460;
    if (targetX !== null) {
      var d = targetX - player.x;
      player.vx = Math.max(-MAXV, Math.min(MAXV, d * 8));
    } else if (keyDir !== 0) {
      player.vx = keyDir * 320;
    } else {
      player.vx *= Math.pow(0.002, dt); // friction
    }
    player.x += player.vx * dt;
    // horizontal wrap
    if (player.x < -player.w / 2) player.x += cv.W + player.w;
    if (player.x > cv.W + player.w / 2) player.x -= cv.W + player.w;

    var prevBottom = player.y;
    player.vy = Math.min(1400, player.vy + GRAV * dt);
    player.y += player.vy * dt;

    // platform collisions (only falling, feet crossing top)
    if (player.vy > 0) {
      for (var i = 0; i < plats.length; i++) {
        var p = plats[i];
        if (p.broken) continue;
        if (player.x + player.w / 2 > p.x && player.x - player.w / 2 < p.x + PW &&
            prevBottom <= p.y + 2 && player.y >= p.y && player.y <= p.y + PH + 14) {
          player.y = p.y;
          if (p.t === T_BREAK) {
            p.broken = true;
            player.vy = JUMP * 0.6;      // weak hop off crumbling platform
            api.haptic('light');
          } else if (p.spring) {
            player.vy = SPRING;
            api.haptic('medium');
          } else {
            player.vy = JUMP;
          }
          break;
        }
      }
    }

    // moving platforms
    for (i = 0; i < plats.length; i++) {
      var m = plats[i];
      if (m.t !== T_MOVING) continue;
      m.x += m.dir * m.spd * dt;
      if (m.x < 2) { m.x = 2; m.dir = 1; }
      if (m.x > cv.W - PW - 2) { m.x = cv.W - PW - 2; m.dir = -1; }
    }

    // camera follows upward only
    var targetCam = player.y - cv.H * 0.42;
    if (targetCam < camY) camY = targetCam;

    // score = max height climbed in meters
    var rise = -player.y;
    if (rise > maxRise) {
      maxRise = rise;
      var m2 = Math.max(0, Math.floor(maxRise / PXM));
      if (m2 !== score) {
        if (m2 > 0 && (m2 % 50 === 0)) api.haptic('success');
        score = m2;
        api.score(score);
      }
    }

    gen();

    // fell below screen
    if (player.y > camY + cv.H + 50) {
      alive = false;
      api.haptic('error');
      api.gameOver(score);
    }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);

    // platforms
    for (var i = 0; i < plats.length; i++) {
      var p = plats[i];
      if (p.broken) continue;
      var y = p.y - camY;
      if (y < -20 || y > cv.H + 20) continue;
      g.fillStyle = p.t === T_MOVING ? C.accent : (p.t === T_BREAK ? C.bad : C.good);
      g.fillRect(p.x, y, PW, PH);
      if (p.t === T_BREAK) {          // crack mark
        g.strokeStyle = C.bg;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p.x + PW * 0.3, y + 1);
        g.lineTo(p.x + PW * 0.5, y + PH - 1);
        g.lineTo(p.x + PW * 0.65, y + 3);
        g.stroke();
      }
      if (p.spring) {                 // spring pad
        g.fillStyle = C.text;
        g.fillRect(p.x + PW / 2 - 7, y - 6, 14, 6);
      }
    }

    // player
    var px = player.x, py = player.y - camY;
    g.font = '30px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.save();
    if (player.vx < -40) { g.translate(px, 0); g.scale(-1, 1); px = 0; }
    g.fillText('🐰', px, py);
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
      g.fillText(api.lang === 'ru' ? 'Держи палец — кролик идёт к нему' : 'Hold finger — bunny steers to it',
        cv.W / 2, cv.H / 2 + 14);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last) / 1000;
    last = ts;
    if (started && alive) update(dt);
    draw();
  }

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
      container.removeEventListener('pointermove', onMove);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
