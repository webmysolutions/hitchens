/* Catch — falling fruit, canvas. Drag the basket, dodge bombs. */
(function () {
'use strict';
MG.register('catch', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var FRUITS = ['🍎', '🍌', '🍇', '🍊'];

  var score = 0, lives = 3, elapsed = 0, spawnAcc = 0;
  var started = false, over = false, paused = false;
  var raf = 0, last = 0;
  var items = [];   // {x,y,vy,face,bomb,dead}
  var pops = [];    // floating "+10" texts (skipped on lowEnd)
  var flash = 0;    // red flash after bomb

  var bw = 64, bh = 30;
  var bx = cv.W / 2, targetX = bx, by = 0;
  var keys = { left: false, right: false };
  var dragging = false;

  function layout() { by = cv.H - 46; if (targetX > cv.W) targetX = cv.W / 2; }
  cv.onResize = function () { layout(); };
  layout();

  // --- input ---
  function ptrX(e) {
    var r = cv.canvas.getBoundingClientRect();
    return e.clientX - r.left;
  }
  function onDown(e) {
    e.preventDefault();
    if (over) return;
    if (!started) { started = true; return; }
    dragging = true;
    targetX = ptrX(e);
  }
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    targetX = ptrX(e);
  }
  function onUp() { dragging = false; }
  cv.canvas.addEventListener('pointerdown', onDown);
  cv.canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  function onKey(e) {
    var d = e.type === 'keydown';
    if (e.key === 'ArrowLeft' || e.key === 'a') { keys.left = d; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keys.right = d; e.preventDefault(); }
    else if (d && e.key === ' ' && !started && !over) started = true;
    if (d && !started && (keys.left || keys.right) && !over) started = true;
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // --- game ---
  function spawn() {
    var p = Math.min(1, elapsed / 60000);          // difficulty ramp over 60 s
    var bomb = Math.random() < 0.14 + 0.12 * p;
    items.push({
      x: 24 + Math.random() * (cv.W - 48),
      y: -24,
      vy: (130 + 190 * p + Math.random() * 60) / 1000, // px per ms
      face: bomb ? '💣' : FRUITS[(Math.random() * FRUITS.length) | 0],
      bomb: bomb,
      dead: false
    });
  }

  function update(dt) {
    elapsed += dt;
    var p = Math.min(1, elapsed / 60000);
    spawnAcc += dt;
    var gap = Math.max(420, 1100 - 620 * p);
    if (spawnAcc >= gap) { spawnAcc = 0; spawn(); }

    // basket
    var kv = 0.45 * dt; // keyboard speed px/ms
    if (keys.left) targetX -= kv;
    if (keys.right) targetX += kv;
    targetX = Math.max(bw / 2, Math.min(cv.W - bw / 2, targetX));
    bx += (targetX - bx) * Math.min(1, dt * 0.02);

    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.y += it.vy * dt;
      if (!it.dead && it.y > by - bh / 2 - 8 && it.y < by + bh / 2 + 10 &&
          Math.abs(it.x - bx) < bw / 2 + 12) {
        it.dead = true;
        if (it.bomb) {
          lives--;
          flash = 250;
          api.haptic('error');
          if (lives <= 0) {
            over = true;
            api.gameOver(score);
          }
        } else {
          score += 10;
          api.score(score);
          if (score % 100 === 0) api.haptic('success');
          if (!api.lowEnd) pops.push({ x: it.x, y: by - 30, t: 500 });
        }
        items.splice(i, 1);
      } else if (it.y > cv.H + 30) {
        items.splice(i, 1); // missed — no penalty
      }
    }
    for (var j = pops.length - 1; j >= 0; j--) {
      pops[j].t -= dt;
      pops[j].y -= dt * 0.05;
      if (pops[j].t <= 0) pops.splice(j, 1);
    }
    if (flash > 0) flash -= dt;
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    g.font = '26px sans-serif';
    for (var i = 0; i < items.length; i++) g.fillText(items[i].face, items[i].x, items[i].y);

    // basket
    g.font = '44px sans-serif';
    g.fillText('🧺', bx, by);

    // lives
    g.font = '18px sans-serif';
    g.textAlign = 'right';
    g.fillStyle = C.bad;
    var hearts = '';
    for (var l = 0; l < lives; l++) hearts += '❤';
    g.fillText(hearts || ' ', cv.W - 10, 20);
    g.textAlign = 'center';

    if (!api.lowEnd) {
      g.font = 'bold 14px sans-serif';
      g.fillStyle = C.good;
      for (var j = 0; j < pops.length; j++) {
        g.globalAlpha = Math.max(0, pops[j].t / 500);
        g.fillText('+10', pops[j].x, pops[j].y);
      }
      g.globalAlpha = 1;
    }

    if (flash > 0) {
      g.globalAlpha = Math.min(0.35, flash / 500);
      g.fillStyle = C.bad;
      g.fillRect(0, 0, cv.W, cv.H);
      g.globalAlpha = 1;
    }

    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '14px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? '🍎 +10   💣 −❤' : '🍎 +10   💣 −❤', cv.W / 2, cv.H / 2 + 28);
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

  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('pointerdown', onDown);
      cv.canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
