/* Racer — top-down 3-lane highway dodger. MG contract. */
(function () {
'use strict';
MG.register('racer', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var LANES = 3;
  var TV = 6; // traffic extra speed, m/s (oncoming feel)
  var RW, laneW, roadX, carW, carH, py, ppm;
  var lane, px, targetX, dist, bonus, spd, alive, started;
  var nextSpawn, freeLane, flashT, lastScore;
  var raf = 0, last = 0, paused = false;
  var cars = [];   // active traffic {lane, y, passed, col}
  var pool = [];   // recycled objects (no per-frame alloc)
  var trafCols = [C.bad, C.good, C.muted];

  function layout() {
    RW = Math.min(cv.W * 0.88, 430);
    laneW = RW / LANES;
    roadX = (cv.W - RW) / 2;
    carW = Math.floor(laneW * 0.6);
    carH = Math.floor(carW * 1.75);
    py = cv.H - carH - Math.max(20, cv.H * 0.06);
    ppm = cv.H / 62; // pixels per metre
  }
  cv.onResize = function () {
    layout();
    px = targetX = laneCx(lane) - carW / 2;
  };

  function laneCx(l) { return roadX + laneW * l + laneW / 2; }

  function reset() {
    lane = 1;
    px = targetX = laneCx(1) - carW / 2;
    dist = 0; bonus = 0; spd = 20;
    alive = true; started = false;
    nextSpawn = 25; freeLane = 1;
    flashT = 0; lastScore = -1;
    while (cars.length) pool.push(cars.pop());
    api.score(0);
  }

  function spawnCar(l) {
    var c = pool.pop() || { lane: 0, y: 0, passed: false, col: 0 };
    c.lane = l;
    c.y = -carH * 1.3 - Math.random() * carH * 0.4;
    c.passed = false;
    c.col = (Math.random() * 3) | 0;
    cars.push(c);
  }

  function spawnRow() {
    var shift = ((Math.random() * 3) | 0) - 1;
    freeLane = Math.max(0, Math.min(LANES - 1, freeLane + shift));
    var a = -1, b = -1, l;
    for (l = 0; l < LANES; l++) {
      if (l === freeLane) continue;
      if (a < 0) a = l; else b = l;
    }
    var densP = Math.min(0.78, 0.3 + dist * 0.0005);
    if (Math.random() < densP) { spawnCar(a); spawnCar(b); }
    else spawnCar(Math.random() < 0.5 ? a : b);
  }

  function moveLane(d) {
    if (!alive) return;
    started = true;
    var nl = Math.max(0, Math.min(LANES - 1, lane + d));
    if (nl === lane) return;
    lane = nl;
    targetX = laneCx(lane) - carW / 2;
  }

  var offSwipe = api.swipe(container, function (d, p) {
    if (!alive) return;
    if (d === 'left') moveLane(-1);
    else if (d === 'right') moveLane(1);
    else if (d === 'tap') {
      if (!started) { started = true; return; }
      if (p && typeof p.x === 'number') moveLane(p.x < cv.W / 2 ? -1 : 1);
    }
  });

  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { moveLane(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { moveLane(1); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'ArrowUp') { started = true; e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  function score() { return (dist | 0) + bonus; }

  function update(dt) {
    spd = Math.min(58, 20 + dist / 45);
    dist += spd * dt;
    px += (targetX - px) * Math.min(1, dt * 14);
    if (dist >= nextSpawn) {
      spawnRow();
      nextSpawn += Math.max(14, 32 - dist * 0.004);
    }
    var vy = (spd + TV) * ppm * dt;
    var i, c, cx;
    for (i = cars.length - 1; i >= 0; i--) {
      c = cars[i];
      c.y += vy;
      cx = laneCx(c.lane) - carW / 2;
      if (!c.passed && c.y > py + carH) {
        c.passed = true;
        if (Math.abs(cx - px) < carW + 20) { // near miss!
          bonus += 5;
          flashT = 0.6;
          api.haptic('light');
        }
      }
      if (c.y < py + carH - 6 && c.y + carH > py + 6 &&
          Math.abs(cx - px) < carW * 0.82) {
        alive = false;
        api.haptic('error');
        api.gameOver(score());
        return;
      }
      if (c.y > cv.H + carH) { // recycle (swap-pop, no splice alloc)
        pool.push(c);
        cars[i] = cars[cars.length - 1];
        cars.pop();
      }
    }
    if (flashT > 0) flashT -= dt;
    var s = score();
    if (s !== lastScore) { lastScore = s; api.score(s); }
  }

  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // down=true → car faces down (oncoming traffic)
  function drawCar(x, y, col, down) {
    g.fillStyle = col;
    rr(x, y, carW, carH, carW * 0.22);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.35)'; // derived shade for windows/wheels
    var wx = x + carW * 0.14, ww = carW * 0.72, wh = carH * 0.16;
    g.fillRect(wx, y + (down ? carH * 0.58 : carH * 0.2), ww, wh);   // windshield
    g.fillRect(wx, y + (down ? carH * 0.14 : carH * 0.68), ww, wh * 0.75); // rear window
    g.fillRect(x - 2, y + carH * 0.12, 3, carH * 0.2);
    g.fillRect(x - 2, y + carH * 0.66, 3, carH * 0.2);
    g.fillRect(x + carW - 1, y + carH * 0.12, 3, carH * 0.2);
    g.fillRect(x + carW - 1, y + carH * 0.66, 3, carH * 0.2);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(x + carW * 0.12, down ? y + carH - 5 : y + 2, carW * 0.2, 3);
    g.fillRect(x + carW * 0.68, down ? y + carH - 5 : y + 2, carW * 0.2, 3);
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // road
    g.fillStyle = C.panel;
    g.fillRect(roadX, 0, RW, cv.H);
    g.fillStyle = C.panel2;
    g.fillRect(roadX - 3, 0, 4, cv.H);
    g.fillRect(roadX + RW - 1, 0, 4, cv.H);
    // scrolling dashed lane markers
    var period = 64, dashH = 36;
    var off = (dist * ppm) % period;
    g.fillStyle = C.muted;
    for (var l = 1; l < LANES; l++) {
      var lx = roadX + laneW * l - 2;
      for (var y = off - period; y < cv.H; y += period) g.fillRect(lx, y, 4, dashH);
    }
    // traffic
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      drawCar(laneCx(c.lane) - carW / 2, c.y, trafCols[c.col], true);
    }
    // player + near-miss flash
    drawCar(px, py, C.accent, false);
    if (flashT > 0) {
      g.globalAlpha = Math.min(1, flashT / 0.4);
      g.strokeStyle = C.good;
      g.lineWidth = 3;
      rr(px - 4, py - 4, carW + 8, carH + 8, carW * 0.3);
      g.stroke();
      g.fillStyle = C.good;
      g.font = 'bold 16px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('+5', px + carW / 2, py - 16 - (0.6 - flashT) * 45);
      g.globalAlpha = 1;
    }
    // speed label
    g.fillStyle = C.muted;
    g.font = '12px sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(((spd * 3.6) | 0) + (api.lang === 'ru' ? ' км/ч' : ' km/h'), 10, cv.H - 10);
    // start overlay
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2 - 14);
      g.fillStyle = C.muted;
      g.font = '14px sans-serif';
      g.fillText(api.lang === 'ru' ? '◀ ▶ смахни или тапни по краю' : '◀ ▶ swipe or tap a side', cv.W / 2, cv.H / 2 + 16);
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

  layout();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
