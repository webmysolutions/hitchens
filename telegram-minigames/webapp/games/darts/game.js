/* Darts — timing-sweep darts (MG contract). Tap 1 locks X, tap 2 locks Y and throws. */
(function () {
'use strict';
MG.register('darts', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g, C = api.colors, RU = api.lang === 'ru', LOW = api.lowEnd;
  var TAU = Math.PI * 2;
  var SECT = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  var MAXD = 10;

  var cx, cy, R, board = null, bs = 0;
  var phase = 'idle'; // idle | x | y | fly | done
  var dartN = 0, total = 0;
  var sweepT = 0, aimX = 0, aimY = 0, fly = 0, FLY_DUR = 0.22;
  var stuck = [], labels = [];
  var lastT20 = false, flash = 0, wobble = 0, time = 0;
  var raf = 0, last = 0, paused = false, endTO = 0;

  function layout() {
    R = Math.min(cv.W * 0.42, cv.H * 0.30);
    cx = cv.W / 2;
    cy = Math.max(R * 1.28 + 36, cv.H * 0.38);
    renderBoard();
  }
  cv.onResize = layout;

  function renderBoard() {
    bs = Math.ceil(R * 2.56);
    var d = Math.min(cv.dpr || 1, 2);
    board = document.createElement('canvas');
    board.width = bs * d; board.height = bs * d;
    var b = board.getContext('2d');
    b.scale(d, d);
    b.translate(bs / 2, bs / 2);
    // surround + number ring
    b.beginPath(); b.arc(0, 0, R * 1.26, 0, TAU);
    b.fillStyle = C.panel; b.fill();
    b.lineWidth = 3; b.strokeStyle = C.panel2; b.stroke();
    function wedge(r0, r1, a0, a1, col) {
      b.beginPath();
      b.arc(0, 0, r1, a0, a1);
      b.arc(0, 0, r0, a1, a0, true);
      b.closePath();
      b.fillStyle = col; b.fill();
    }
    var i, a0, a1, dark;
    for (i = 0; i < 20; i++) {
      a0 = (-99 + i * 18) * Math.PI / 180;
      a1 = a0 + Math.PI / 10;
      dark = (i % 2) === 0;
      wedge(R * 0.11, R * 0.56, a0, a1, dark ? C.bg : C.panel2); // inner single
      wedge(R * 0.63, R * 0.93, a0, a1, dark ? C.bg : C.panel2); // outer single
      wedge(R * 0.56, R * 0.63, a0, a1, dark ? C.bad : C.good);  // triple ring
      wedge(R * 0.93, R, a0, a1, dark ? C.bad : C.good);         // double ring
    }
    // bull
    b.beginPath(); b.arc(0, 0, R * 0.11, 0, TAU); b.fillStyle = C.good; b.fill();
    b.beginPath(); b.arc(0, 0, R * 0.045, 0, TAU); b.fillStyle = C.bad; b.fill();
    // wire
    b.strokeStyle = C.muted; b.lineWidth = 0.75; b.globalAlpha = 0.55;
    var rr = [0.045, 0.11, 0.56, 0.63, 0.93, 1];
    for (i = 0; i < rr.length; i++) {
      b.beginPath(); b.arc(0, 0, R * rr[i], 0, TAU); b.stroke();
    }
    for (i = 0; i < 20; i++) {
      a0 = (-99 + i * 18) * Math.PI / 180;
      b.beginPath();
      b.moveTo(Math.cos(a0) * R * 0.11, Math.sin(a0) * R * 0.11);
      b.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
      b.stroke();
    }
    b.globalAlpha = 1;
    // numbers
    b.fillStyle = C.text;
    b.textAlign = 'center'; b.textBaseline = 'middle';
    b.font = 'bold ' + Math.max(10, Math.round(R * 0.105)) + 'px sans-serif';
    for (i = 0; i < 20; i++) {
      var am = (-90 + i * 18) * Math.PI / 180;
      b.fillText(SECT[i], Math.cos(am) * R * 1.13, Math.sin(am) * R * 1.13);
    }
  }

  function scoreAt(x, y) {
    var dx = x - cx, dy = y - cy;
    var d = Math.sqrt(dx * dx + dy * dy) / R;
    if (d > 1) return { v: 0, txt: RU ? 'МИМО' : 'MISS', miss: true };
    if (d < 0.045) return { v: 50, txt: '50', bull: true };
    if (d < 0.11) return { v: 25, txt: '25', bull: true };
    var deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    var n = SECT[((deg + 9) % 360 / 18) | 0];
    var m = 1, p = '';
    if (d > 0.56 && d < 0.63) { m = 3; p = 'T'; }
    else if (d > 0.93) { m = 2; p = 'D'; }
    return { v: n * m, txt: p + n, t20: n === 20 && m === 3 };
  }

  function spd() { return 2.4 + dartN * 0.32; }
  function amp() { return R + 12; }
  function curX() { return cx + Math.sin(sweepT * spd()) * amp(); }
  function curY() { return cy + Math.sin(sweepT * spd()) * amp(); }

  function tap() {
    if (phase === 'idle') { phase = 'x'; sweepT = 0; }
    else if (phase === 'x') { aimX = curX(); phase = 'y'; sweepT = 0; api.haptic('light'); }
    else if (phase === 'y') { aimY = curY(); phase = 'fly'; fly = 0; }
  }

  function land() {
    var s = scoreAt(aimX, aimY);
    stuck.push({ dx: aimX - cx, dy: aimY - cy, a: (Math.random() - 0.5) * 0.5 });
    wobble = 1;
    total += s.v;
    api.score(total);
    labels.push({ txt: s.miss ? s.txt : s.txt + '  +' + s.v, x: aimX, y: Math.max(30, aimY - 14), t: 0, big: false });
    if (s.t20 && lastT20) {
      flash = 1;
      labels.push({ txt: 'T20 ×2!', x: cx, y: cy - R - 24, t: 0, big: true });
      api.haptic('success');
    } else if (s.bull || s.t20) {
      api.haptic('success');
    } else if (!s.miss) {
      api.haptic('light');
    }
    lastT20 = !!s.t20;
    dartN++;
    if (dartN >= MAXD) {
      phase = 'done';
      endTO = setTimeout(function () { api.gameOver(total); }, 1100);
    } else {
      phase = 'x';
      sweepT = 0;
    }
  }

  var offSwipe = api.swipe(container, function (d) { if (d === 'tap') tap(); });
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') { tap(); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  function drawDart(x, y, ang, scale) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.scale(scale, scale);
    g.strokeStyle = C.muted; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(7, 14); g.stroke();
    g.fillStyle = C.accent;
    g.beginPath();
    g.moveTo(7, 14); g.lineTo(13, 22); g.lineTo(3, 22); g.closePath();
    g.fill();
    g.fillStyle = C.text;
    g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill();
    g.restore();
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // board with wobble
    g.save();
    g.translate(cx + Math.sin(time * 43) * 2 * wobble, cy + Math.cos(time * 37) * 1.2 * wobble);
    g.rotate(Math.sin(time * 24) * 0.02 * wobble);
    g.drawImage(board, -bs / 2, -bs / 2, bs, bs);
    for (var i = 0; i < stuck.length; i++) drawDart(stuck[i].dx, stuck[i].dy, stuck[i].a, 1);
    g.restore();

    // crosshair sweeps
    if (phase === 'x' || phase === 'y') {
      var lx = phase === 'x' ? curX() : aimX;
      g.strokeStyle = C.accent;
      g.lineWidth = 2;
      g.globalAlpha = phase === 'x' ? 1 : 0.5;
      g.beginPath();
      g.moveTo(lx, cy - R - 22); g.lineTo(lx, cy + R + 22);
      g.stroke();
      g.globalAlpha = 1;
      if (phase === 'y') {
        var ly = curY();
        g.beginPath();
        g.moveTo(cx - R - 22, ly); g.lineTo(cx + R + 22, ly);
        g.stroke();
        g.fillStyle = C.accent;
        g.beginPath(); g.arc(aimX, ly, 5, 0, TAU); g.fill();
      } else {
        g.fillStyle = C.accent;
        g.beginPath(); g.arc(lx, cy + R + 22, 5, 0, TAU); g.fill();
      }
    }
    // flying dart
    if (phase === 'fly') {
      var t = Math.min(1, fly / FLY_DUR);
      var fx = cx + (aimX - cx) * t;
      var fy = (cv.H + 30) + (aimY - (cv.H + 30)) * (1 - (1 - t) * (1 - t));
      drawDart(fx, fy, 0, 2.4 - 1.4 * t);
    }
    // floating labels
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = labels.length - 1; i >= 0; i--) {
      var L = labels[i];
      if (L.t > 1.1) { labels.splice(i, 1); continue; }
      g.globalAlpha = Math.max(0, 1 - L.t);
      g.fillStyle = L.big ? C.accent : C.text;
      g.font = (L.big ? 'bold 30px' : 'bold 17px') + ' sans-serif';
      g.fillText(L.txt, L.x, L.y - L.t * 24);
    }
    g.globalAlpha = 1;
    // 180-style flash
    if (flash > 0) {
      g.globalAlpha = flash * 0.22;
      g.fillStyle = C.accent;
      g.fillRect(0, 0, cv.W, cv.H);
      g.globalAlpha = Math.min(1, flash * 1.4);
      g.fillStyle = C.accent;
      g.font = 'bold ' + Math.round(40 + 14 * Math.sin(time * 20)) + 'px sans-serif';
      g.fillText('🎯 120!', cv.W / 2, cv.H * 0.62);
      g.globalAlpha = 1;
    }
    // HUD
    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    g.textAlign = 'left';
    g.fillText((RU ? 'Дротик ' : 'Dart ') + Math.min(MAXD, dartN + 1) + '/' + MAXD, 12, 20);
    g.textAlign = 'right';
    g.fillStyle = C.text;
    g.font = 'bold 15px sans-serif';
    g.fillText(api.t('score') + ': ' + total, cv.W - 12, 20);
    // start overlay
    if (phase === 'idle') {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Тап 1 — фиксируй X, тап 2 — бросок' : 'Tap 1 locks X, tap 2 throws', cv.W / 2, cv.H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    time += dt;
    if (phase === 'x' || phase === 'y') sweepT += dt;
    if (phase === 'fly') {
      fly += dt;
      if (fly >= FLY_DUR) land();
    }
    if (wobble > 0) wobble = Math.max(0, wobble - dt * 2.2);
    if (flash > 0) flash = Math.max(0, flash - dt * 0.9);
    draw();
  }

  layout();
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      clearTimeout(endTO);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
