/* Knife Hit — throw knives into the spinning log, don't hit stuck knives. */
(function () {
'use strict';
MG.register('knifehit', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var TAU = Math.PI * 2;
  var raf = 0, last = 0, paused = false, over = false, started = false;
  var cx = 0, cy = 0, rad = 0;
  var level = 1, boss = false, score = 0, knives = 0, thrown = 0;
  var stuck = [], apples = [], parts = [];
  var logA = 0, t = 0, state = 'ready', kTip = 0, burstT = 0, gain = 0;

  function layout() {
    cx = cv.W / 2;
    cy = cv.H * 0.32;
    rad = Math.min(cv.W * 0.28, 105);
  }
  cv.onResize = function () { layout(); };

  var MAXP = api.lowEnd ? 14 : 40;
  for (var i0 = 0; i0 < MAXP; i0++) parts.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, s: 3, col: '' });
  function spawnP(x, y, col, n, spd) {
    for (var i = 0; i < MAXP && n > 0; i++) {
      var p = parts[i];
      if (p.life > 0) continue;
      var a = Math.random() * TAU, s = spd * (0.5 + Math.random());
      p.life = 600; p.x = x; p.y = y; p.col = col;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.s = 3 + Math.random() * 5;
      n--;
    }
  }

  function norm(a) { a %= TAU; return a < 0 ? a + TAU : a; }
  function adiff(a, b) { var d = Math.abs(norm(a) - norm(b)); return d > Math.PI ? TAU - d : d; }

  function rndAngle(gap) {
    for (var tr = 0; tr < 24; tr++) {
      var a = Math.random() * TAU, ok = true, i;
      for (i = 0; i < stuck.length && ok; i++) if (adiff(a, stuck[i]) < gap) ok = false;
      for (i = 0; i < apples.length && ok; i++) if (adiff(a, apples[i]) < gap) ok = false;
      if (ok) return a;
    }
    return -1;
  }

  function startLevel(n) {
    level = n; boss = n % 5 === 0;
    knives = Math.min(9, 5 + (((n - 1) / 2) | 0)) + (boss ? 2 : 0);
    thrown = 0; stuck.length = 0; apples.length = 0;
    logA = 0; t = 0; state = 'ready'; gain = 0;
    var i, a;
    var pre = Math.min(3, (n / 3) | 0);
    for (i = 0; i < pre; i++) { a = rndAngle(0.5); if (a >= 0) stuck.push(a); }
    var na = 1 + ((boss || n % 3 === 0) ? 1 : 0);
    for (i = 0; i < na; i++) { a = rndAngle(0.45); if (a >= 0) apples.push(a); }
  }

  function reset() {
    score = 0; over = false; started = false;
    api.score(0);
    startLevel(1);
  }

  function omega() {
    var b = 0.0018 + Math.min(0.0035, level * 0.00025);
    if (boss) return b * 1.4 * (Math.sin(t * 0.0021) + Math.sin(t * 0.00093) * 0.9);
    if (level >= 4) return b * (Math.sin(t * 0.0009) > 0 ? 1 : -1) * (0.55 + 0.45 * Math.abs(Math.sin(t * 0.0013)));
    if (level >= 2) return b * (0.5 + 0.5 * Math.abs(Math.sin(t * 0.0011)));
    return b;
  }

  function burst() {
    state = 'burst'; burstT = 900;
    gain = level * 10 + (boss ? 50 : 0);
    score += gain;
    api.score(score);
    api.haptic('success');
    spawnP(cx, cy, C.panel2 || C.panel, api.lowEnd ? 8 : 18, 0.3);
    spawnP(cx, cy, C.muted, api.lowEnd ? 4 : 10, 0.2);
    for (var i = 0; i < stuck.length; i++) {
      var wa = logA + stuck[i];
      spawnP(cx + Math.cos(wa) * rad, cy + Math.sin(wa) * rad, C.text, 1, 0.35);
    }
    stuck.length = 0; apples.length = 0;
  }

  function impact() {
    var rel = norm(Math.PI / 2 - logA), i;
    for (i = 0; i < stuck.length; i++) {
      if (adiff(rel, stuck[i]) < 0.16) {
        over = true;
        api.haptic('error');
        api.gameOver(score);
        return;
      }
    }
    for (i = apples.length - 1; i >= 0; i--) {
      if (adiff(rel, apples[i]) < 0.26) {
        apples.splice(i, 1);
        score += 5;
        api.score(score);
        spawnP(cx, cy + rad, C.good, api.lowEnd ? 4 : 8, 0.25);
      }
    }
    stuck.push(rel);
    thrown++;
    api.haptic('light');
    if (thrown >= knives) burst();
    else state = 'ready';
  }

  function throwKnife() {
    if (over || state !== 'ready') return;
    state = 'throw';
    kTip = cv.H - 120;
  }
  function pd() {
    if (over) return;
    if (!started) { started = true; return; }
    throwKnife();
  }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      if (!started) started = true;
      else throwKnife();
      e.preventDefault();
    }
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', pd);
  window.addEventListener('keydown', onKey);

  function drawKnife(x, y, ang) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = C.text;
    g.fillRect(-2.5, -30, 5, 30);
    g.beginPath(); g.moveTo(-2.5, -30); g.lineTo(0, -38); g.lineTo(2.5, -30); g.closePath(); g.fill();
    g.fillStyle = C.accent;
    g.fillRect(-3.5, 0, 7, 20);
    g.restore();
  }

  function draw() {
    var W = cv.W, H = cv.H, i;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = C.text;
    g.font = 'bold 15px sans-serif';
    g.fillText(api.t('level') + ' ' + level + (boss ? ' 👑' : ''), W / 2, 22);
    // knives left icons
    var left = knives - thrown;
    for (i = 0; i < knives; i++) {
      g.fillStyle = i < left ? C.text : C.muted;
      g.fillRect(14, H - 34 - i * 18, 4, 13);
      g.fillStyle = i < left ? C.accent : C.muted;
      g.fillRect(13, H - 21 - i * 18, 6, 5);
    }
    if (state !== 'burst') {
      // stuck knives (behind log edge)
      for (i = 0; i < stuck.length; i++) {
        var wa = logA + stuck[i];
        drawKnife(cx + Math.cos(wa) * (rad + 26), cy + Math.sin(wa) * (rad + 26), wa - Math.PI / 2);
      }
      // log
      g.beginPath(); g.arc(cx, cy, rad, 0, TAU);
      g.fillStyle = C.panel2 || C.panel; g.fill();
      g.lineWidth = 6;
      g.strokeStyle = boss ? C.bad : C.muted;
      g.stroke();
      g.lineWidth = 3; g.strokeStyle = C.muted;
      g.beginPath(); g.arc(cx, cy, rad * 0.62, logA, logA + 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, rad * 0.35, logA + 3, logA + 4.5); g.stroke();
      if (boss) { g.font = (rad * 0.5 | 0) + 'px sans-serif'; g.fillText('👑', cx, cy); }
      // apples on the rim
      g.font = '20px sans-serif';
      for (i = 0; i < apples.length; i++) {
        var aa = logA + apples[i];
        g.fillText('🍏', cx + Math.cos(aa) * (rad + 12), cy + Math.sin(aa) * (rad + 12));
      }
      // knife: flying or ready
      if (state === 'throw') drawKnife(cx, kTip + 38, 0);
      else if (state === 'ready' && !over) drawKnife(cx, H - 120 + 38, 0);
    } else {
      g.fillStyle = C.good;
      g.font = 'bold 26px sans-serif';
      g.fillText('+' + gain, cx, cy);
    }
    for (i = 0; i < MAXP; i++) {
      var p = parts[i];
      if (p.life <= 0) continue;
      g.globalAlpha = p.life / 600;
      g.fillStyle = p.col;
      g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.globalAlpha = 1;
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Тап — бросить нож' : 'Tap to throw', W / 2, H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last || 16);
    last = ts;
    for (var i = 0; i < MAXP; i++) {
      var p = parts[i];
      if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0007 * dt * dt; }
    }
    if (started && !over) {
      t += dt;
      if (state !== 'burst') logA = norm(logA + omega() * dt);
      if (state === 'throw') {
        kTip -= 2.4 * dt;
        if (kTip <= cy + rad) impact();
      } else if (state === 'burst') {
        burstT -= dt;
        if (burstT <= 0) startLevel(level + 1);
      }
    }
    draw();
  }

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', pd);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
