/* Fall Down — drop through gaps in rising platforms, avoid the spikes on top. */
(function () {
'use strict';
MG.register('falldown', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var TAU = Math.PI * 2, TH = 12, SPK = 24, GAPY = 112, r = 10;
  var raf = 0, last = 0, paused = false, over = false, started = false;
  var bx = 0, by = 0, vx = 0, vy = 0, score = 0;
  var plats = [];
  var lc = 0, rc = 0, kl = false, kr = false, sides = {};

  function addPlat(y) {
    var gw = Math.max(56, 96 - score * 0.6);
    var gx = 8 + Math.random() * (cv.W - gw - 16);
    plats.push({ y: y, gx: gx, gw: gw, passed: false, coin: Math.random() < 0.22, ctaken: false });
  }

  function reset() {
    plats.length = 0;
    bx = cv.W / 2; by = cv.H * 0.25; vx = 0; vy = 0; score = 0;
    var y = cv.H * 0.45;
    while (y < cv.H + GAPY) { addPlat(y); y += GAPY; }
    api.score(0);
    over = false; started = false;
    lc = 0; rc = 0; sides = {};
  }

  function upd(dt) {
    var k = dt / 16.667;
    var v = (1.5 + Math.min(2.4, score * 0.028)) * k;
    var i, p;
    for (i = 0; i < plats.length; i++) plats[i].y -= v;
    while (plats.length && plats[0].y < -TH - 60) plats.shift();
    var lastY = plats.length ? plats[plats.length - 1].y : cv.H;
    while (lastY < cv.H + GAPY) { lastY += GAPY; addPlat(lastY); }
    var hold = ((kr || rc > 0) ? 1 : 0) - ((kl || lc > 0) ? 1 : 0);
    vx += (hold * 4.6 - vx) * Math.min(1, 0.18 * k);
    vy = Math.min(10, vy + 0.42 * k);
    bx += vx * k;
    by += vy * k;
    if (bx < r) { bx = r; vx = 0; }
    if (bx > cv.W - r) { bx = cv.W - r; vx = 0; }
    for (i = 0; i < plats.length; i++) {
      p = plats[i];
      if (by + r > p.y && by < p.y + TH) {
        var inGap = bx - r * 0.55 > p.gx && bx + r * 0.55 < p.gx + p.gw;
        if (!inGap) { by = p.y - r; vy = 0; }
      }
      if (!p.passed && by - r > p.y + TH) {
        p.passed = true;
        score++;
        api.score(score);
        if (score % 10 === 0) api.haptic('light');
      }
      if (p.coin && !p.ctaken) {
        var dx = bx - (p.gx + p.gw / 2), dy = by - (p.y + 50);
        if (dx * dx + dy * dy < (r + 9) * (r + 9)) {
          p.ctaken = true;
          score += 5;
          api.score(score);
          api.haptic('light');
        }
      }
    }
    if (by > cv.H + 60) { by = cv.H + 60; vy = 0; }
    if (by - r < SPK) {
      over = true;
      api.haptic('error');
      api.gameOver(score);
    }
  }

  function draw() {
    var W = cv.W, H = cv.H, i, p;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // spikes
    g.fillStyle = C.bad;
    g.beginPath();
    for (var x = 0; x < W + 16; x += 16) {
      g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, SPK);
    }
    g.fill();
    // platforms + coins
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = 0; i < plats.length; i++) {
      p = plats[i];
      g.fillStyle = C.panel2 || C.panel;
      g.fillRect(0, p.y, p.gx, TH);
      g.fillRect(p.gx + p.gw, p.y, W - p.gx - p.gw, TH);
      g.strokeStyle = C.accent; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, p.y); g.lineTo(p.gx, p.y);
      g.moveTo(p.gx + p.gw, p.y); g.lineTo(W, p.y);
      g.stroke();
      if (p.coin && !p.ctaken && p.y + 50 < H + 20) {
        g.font = '16px sans-serif';
        g.fillText('🪙', p.gx + p.gw / 2, p.y + 50);
      }
    }
    // ball
    if (!over || by - r >= SPK) {
      g.fillStyle = C.accent;
      g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.arc(bx - 3, by - 3, 3, 0, TAU); g.fill();
    }
    // touch zone hints
    if (started && !over && score < 3) {
      g.fillStyle = C.muted;
      g.font = '20px sans-serif';
      g.fillText('◀', 24, H - 40);
      g.fillText('▶', W - 24, H - 40);
    }
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Держи слева / справа, чтобы катиться' : 'Hold left / right side to roll', W / 2, H / 2 + 26);
    }
  }

  function pd(e) {
    if (over) return;
    if (!started) started = true;
    var side = e.clientX < cv.W / 2 ? -1 : 1;
    sides[e.pointerId] = side;
    if (side < 0) lc++; else rc++;
  }
  function pu(e) {
    var s = sides[e.pointerId];
    if (s === undefined) return;
    delete sides[e.pointerId];
    if (s < 0) lc = Math.max(0, lc - 1); else rc = Math.max(0, rc - 1);
  }
  function kd(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a') { kl = true; started = true; e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd') { kr = true; started = true; e.preventDefault(); }
    else if (k === ' ') { started = true; e.preventDefault(); }
  }
  function ku(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a') kl = false;
    else if (k === 'ArrowRight' || k === 'd') kr = false;
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', pd);
  window.addEventListener('pointerup', pu);
  window.addEventListener('pointercancel', pu);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last || 16);
    last = ts;
    if (started && !over) upd(dt);
    draw();
  }

  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
