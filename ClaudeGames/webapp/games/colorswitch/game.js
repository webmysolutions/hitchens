/* Color Switch — hop through rotating color gates, only pass arcs of your color. */
(function () {
'use strict';
MG.register('colorswitch', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var TAU = Math.PI * 2, SP = 340, TH = 15, r = 11;
  var raf = 0, last = 0, paused = false, over = false, started = false;
  var R1 = 0, R2 = 0;
  var by = 0, vy = 0, bc = 0, camY = 0, stars = 0, nextY = 0, obn = 0;
  var obs = [], parts = [];

  function hexHue(hex) {
    var m = /([0-9a-f]{6})/i.exec(hex || '');
    if (!m) return 210;
    var n = parseInt(m[1], 16), rr = (n >> 16 & 255) / 255, gr = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    var mx = Math.max(rr, gr, b), mn = Math.min(rr, gr, b), d = mx - mn, h = 0;
    if (d) { h = mx === rr ? ((gr - b) / d + 6) % 6 : mx === gr ? (b - rr) / d + 2 : (rr - gr) / d + 4; h *= 60; }
    return h;
  }
  var hue0 = hexHue(C.accent), PAL = [];
  for (var i0 = 0; i0 < 4; i0++) PAL.push('hsl(' + (((hue0 + i0 * 90) % 360) | 0) + ',80%,56%)');

  var MAXP = api.lowEnd ? 12 : 32;
  for (var j0 = 0; j0 < MAXP; j0++) parts.push({ life: 0, x: 0, y: 0, vx: 0, vy: 0, col: '' });
  function boom(x, y) {
    for (var i = 0; i < MAXP; i++) {
      var p = parts[i], a = Math.random() * TAU, s = 0.1 + Math.random() * 0.25;
      p.life = 500; p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.col = PAL[i % 4];
    }
  }

  function layout() { R1 = Math.min(cv.W * 0.36, 150); R2 = R1 - 36; }
  cv.onResize = function () { layout(); };

  function gen() {
    while (nextY > camY - cv.H) {
      var t = obn === 0 ? 0 : ((Math.random() * 3) | 0);
      var sp = (0.0011 + Math.min(0.0016, obn * 0.00008)) * (Math.random() < 0.5 ? -1 : 1);
      obs.push({
        y: nextY, type: t,
        rot: Math.random() * TAU, rot2: Math.random() * TAU, rs: sp,
        off: Math.random() * 300, ls: 0.05 + Math.random() * 0.05,
        star: false, orb: false,
        sy: t === 2 ? nextY - 64 : nextY
      });
      obn++; nextY -= SP;
    }
  }

  function reset() {
    obs.length = 0;
    by = -110; vy = 0; bc = 0; camY = -cv.H; stars = 0; nextY = -430; obn = 0;
    over = false; started = false;
    for (var i = 0; i < MAXP; i++) parts[i].life = 0;
    gen();
    api.score(0);
  }

  function die() {
    if (over) return;
    over = true;
    boom(cv.W / 2, by - camY);
    api.haptic('error');
    api.gameOver(stars);
  }

  function seg4(x, w) { var s = Math.floor(x / w) % 4; return s < 0 ? s + 4 : s; }

  function checkRing(dy, RR, rot, shift) {
    if (Math.abs(Math.abs(dy) - RR) < TH / 2 + r - 2) {
      var a = (dy > 0 ? Math.PI / 2 : -Math.PI / 2) - rot;
      a %= TAU; if (a < 0) a += TAU;
      return ((((a / (TAU / 4)) | 0) + shift) % 4) !== bc;
    }
    return false;
  }

  function upd(dt) {
    var k = dt / 16.667;
    vy = Math.min(9, vy + 0.38 * k);
    by += vy * k;
    if (by - camY < cv.H * 0.45) camY = by - cv.H * 0.45;
    gen();
    if (by - camY > cv.H + r) { die(); return; }
    var i, o;
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      o.rot += o.rs * dt; o.rot2 -= o.rs * 1.25 * dt; o.off += o.ls * dt;
      var dy = by - o.y, ady = Math.abs(dy);
      if (!o.orb && Math.abs(by - (o.y + 170)) < r + 10) {
        o.orb = true;
        bc = (bc + 1 + ((Math.random() * 3) | 0)) % 4;
        api.haptic('light');
      }
      if (ady > R1 + 40) continue;
      if (!o.star && Math.abs(by - o.sy) < r + 10) {
        o.star = true; stars++;
        api.score(stars); api.haptic('light');
      }
      if (o.type === 2) {
        if (ady < TH / 2 + r - 2 && seg4(cv.W / 2 - o.off, cv.W / 4) !== bc) { die(); return; }
      } else {
        if (checkRing(dy, R1, o.rot, 0)) { die(); return; }
        if (o.type === 1 && checkRing(dy, R2, o.rot2, 1)) { die(); return; }
      }
    }
    while (obs.length && obs[0].y - camY > cv.H + 420) obs.shift();
  }

  function ring(x, y, RR, rot, shift) {
    g.lineWidth = TH;
    for (var i = 0; i < 4; i++) {
      g.strokeStyle = PAL[(i + shift) % 4];
      g.beginPath();
      g.arc(x, y, RR, rot + i * TAU / 4 + 0.05, rot + (i + 1) * TAU / 4 - 0.05);
      g.stroke();
    }
  }

  function drawLine(o, sy) {
    var w4 = cv.W / 4;
    var x0 = o.off % w4; if (x0 > 0) x0 -= w4;
    var m = Math.round((x0 - o.off) / w4);
    for (var j = 0; j <= 4; j++) {
      g.fillStyle = PAL[(((j + m) % 4) + 4) % 4];
      g.fillRect(x0 + j * w4, sy - TH / 2, w4 + 1, TH);
    }
  }

  function drawOrb(x, y) {
    g.lineWidth = 5;
    for (var i = 0; i < 4; i++) {
      g.strokeStyle = PAL[i];
      g.beginPath(); g.arc(x, y, 8, i * TAU / 4, (i + 1) * TAU / 4 + 0.02); g.stroke();
    }
  }

  function draw() {
    var W = cv.W, H = cv.H, cx = W / 2, i, o, sy;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      sy = o.y - camY;
      var oy = o.y + 170 - camY;
      if (!o.orb && oy > -20 && oy < H + 20) drawOrb(cx, oy);
      if (sy < -R1 - 40 || sy > H + R1 + 40) continue;
      if (o.type === 2) drawLine(o, sy);
      else {
        ring(cx, sy, R1, o.rot, 0);
        if (o.type === 1) ring(cx, sy, R2, o.rot2, 1);
      }
      if (!o.star) { g.font = '22px sans-serif'; g.fillText('⭐', cx, o.sy - camY); }
    }
    for (i = 0; i < MAXP; i++) {
      var p = parts[i];
      if (p.life <= 0) continue;
      g.globalAlpha = p.life / 500;
      g.fillStyle = p.col;
      g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
    }
    g.globalAlpha = 1;
    if (!over) {
      g.fillStyle = PAL[bc];
      g.beginPath(); g.arc(cx, by - camY, r, 0, TAU); g.fill();
    }
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cx, H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Тапай, чтобы прыгать' : 'Tap to hop', cx, H / 2 + 26);
    }
  }

  function hop() {
    if (over) return;
    started = true;
    vy = -8.2;
  }
  function pd() { hop(); }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { hop(); e.preventDefault(); }
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', pd);
  window.addEventListener('keydown', onKey);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last || 16);
    last = ts;
    for (var i = 0; i < MAXP; i++) {
      var p = parts[i];
      if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    if (started && !over) upd(dt);
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
