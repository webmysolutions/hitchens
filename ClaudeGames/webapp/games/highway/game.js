/* Highway — pseudo-3D OutRun-style road. MG contract. */
(function () {
'use strict';
MG.register('highway', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  // ---- derived shades (computed from api.colors only) ----
  function rgbOf(col) {
    if (col.charAt(0) === '#') {
      var h = col.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var v = parseInt(h.slice(0, 6), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var m = /(\d+)[^\d]+(\d+)[^\d]+(\d+)/.exec(col);
    return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function mix(a, b, t) {
    var A = rgbOf(a), B = rgbOf(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  var grassCols = [mix(C.good, C.bg, 0.72), mix(C.good, C.bg, 0.8)];
  var roadCols = [C.panel, mix(C.panel, C.text, 0.07)];
  var rumbleCols = [mix(C.bad, C.bg, 0.25), mix(C.text, C.bg, 0.35)];
  var laneCol = mix(C.text, C.bg, 0.3);
  var trunkCol = mix(C.text, C.bg, 0.6);
  var carCols = [C.bad, C.good, C.panel2];

  // ---- track ----
  var SEG = 200, TRACK = 720, TOTAL = TRACK * SEG;
  var ROADW = 2000, CAMH = 1000, CAMD = 0.84, PLAYERZ = CAMH * CAMD;
  var DRAW = api.lowEnd ? 50 : 100;
  var PROPS = !api.lowEnd;
  var curve = new Float32Array(TRACK);
  var hillY = new Float32Array(TRACK);
  function sm(t) { return t * t * (3 - 2 * t); }
  (function buildTrack() {
    var i = 0;
    while (i < TRACK) {
      var n = 24 + ((Math.random() * 36) | 0);
      if (i + n > TRACK) n = TRACK - i;
      var c = (i === 0 || Math.random() < 0.3) ? 0 : (Math.random() * 8 - 4);
      for (var k = 0; k < n; k++, i++) {
        var t = k / n;
        var e = t < 0.33 ? sm(t / 0.33) : (t > 0.67 ? sm((1 - t) / 0.33) : 1);
        curve[i] = c * e;
      }
    }
    var TP = 2 * Math.PI / TRACK;
    for (i = 0; i < TRACK; i++) // gentle hills, seamless at loop point
      hillY[i] = 650 * Math.sin(i * TP * 5) + 350 * Math.sin(i * TP * 11);
  })();

  // ---- projection buffers (preallocated, zero per-frame alloc) ----
  var N = DRAW + 1;
  var sx = new Float32Array(N), sy = new Float32Array(N);
  var sw = new Float32Array(N), sc = new Float32Array(N), cl = new Float32Array(N);

  // ---- state ----
  var MAXS = 9500, ACC = 2400, OFFMAX = 3400;
  var pos, traveled, speed, playerX, bonus, alive, started;
  var lastScore, raf = 0, last = 0, paused = false;
  var keys = { l: 0, r: 0 }, touchL = 0, touchR = 0, ptrId = -1;
  var NC = api.lowEnd ? 5 : 8;
  var cars = [];
  var laneX = [-0.62, 0, 0.62];
  for (var ci = 0; ci < NC; ci++) cars.push({ z: 0, x: 0, v: 0, col: ci % 3, rel: 0 });

  function respawnCar(c, far) {
    c.z = (pos + SEG * (DRAW * (far ? 1 : 0.4) + Math.random() * DRAW * 1.6)) % TOTAL;
    c.x = laneX[(Math.random() * 3) | 0] + (Math.random() - 0.5) * 0.12;
    c.v = MAXS * (0.3 + Math.random() * 0.35);
    c.col = (Math.random() * 3) | 0;
  }

  function reset() {
    pos = 0; traveled = 0; speed = 0; playerX = 0; bonus = 0;
    alive = true; started = false; lastScore = -1;
    for (var i = 0; i < NC; i++) {
      var c = cars[i];
      c.z = SEG * (30 + i * 24 + Math.random() * 12);
      c.x = laneX[i % 3];
      c.v = MAXS * (0.3 + Math.random() * 0.35);
      c.col = i % 3;
    }
    api.score(0);
  }

  var skyGrad = null;
  function makeSky() {
    skyGrad = g.createLinearGradient(0, 0, 0, cv.H * 0.65);
    skyGrad.addColorStop(0, C.bg);
    skyGrad.addColorStop(1, mix(C.accent, C.bg, 0.55));
  }
  cv.onResize = function () { makeSky(); };

  function score() { return ((traveled / 100) | 0) + bonus; }

  function update(dt) {
    var sd = (keys.r || touchR ? 1 : 0) - (keys.l || touchL ? 1 : 0);
    var sr = speed / MAXS;
    playerX += sd * dt * 1.5 * (0.35 + 0.65 * sr);
    var bi = ((pos / SEG) | 0) % TRACK;
    playerX -= dt * curve[bi] * sr * 0.13; // drift off on curves if not steering
    if (playerX > 1.6) playerX = 1.6;
    if (playerX < -1.6) playerX = -1.6;
    var off = Math.abs(playerX) > 0.92;
    speed += ACC * dt;
    if (speed > MAXS) speed = MAXS;
    if (off && speed > OFFMAX) speed = Math.max(OFFMAX, speed - 9000 * dt); // grass slows you
    pos += speed * dt;
    traveled += speed * dt;
    if (pos >= TOTAL) pos -= TOTAL;
    // traffic
    for (var i = 0; i < NC; i++) {
      var c = cars[i];
      c.z += c.v * dt;
      if (c.z >= TOTAL) c.z -= TOTAL;
      var rel = c.z - pos;
      if (rel < 0) rel += TOTAL;
      c.rel = rel;
      if (rel > PLAYERZ - 200 && rel < PLAYERZ + 220 && Math.abs(c.x - playerX) < 0.3) {
        alive = false;
        api.haptic('error');
        api.gameOver(score());
        return;
      }
      if (rel < 500 || rel > TOTAL - 3000) { // passed behind → overtake bonus
        bonus += 10;
        api.haptic('light');
        respawnCar(c, true);
      }
    }
    var s = score();
    if (s !== lastScore) { lastScore = s; api.score(s); }
  }

  function quad(x1, y1, w1, x2, y2, w2) {
    g.beginPath();
    g.moveTo(x1 - w1, y1);
    g.lineTo(x2 - w2, y2);
    g.lineTo(x2 + w2, y2);
    g.lineTo(x1 + w1, y1);
    g.closePath();
    g.fill();
  }

  function drawTraffic(c, n) {
    var s = sc[n];
    var x = sx[n] + s * c.x * ROADW * cv.W / 2;
    var y = sy[n];
    if (y >= cl[n]) return;
    var w = s * 760 * cv.W / 2;
    if (w < 2) return;
    var h = w * 0.62;
    g.fillStyle = carCols[c.col];
    g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x - w * 0.36, y - h, w * 0.72, h * 0.42);
    if (w > 14) {
      g.fillStyle = C.bad;
      g.fillRect(x - w * 0.42, y - h * 0.3, w * 0.16, h * 0.16);
      g.fillRect(x + w * 0.26, y - h * 0.3, w * 0.16, h * 0.16);
    }
  }

  function draw() {
    var W = cv.W, H = cv.H, HW = W / 2, HH = H / 2;
    g.fillStyle = skyGrad;
    g.fillRect(0, 0, W, H);
    var base = (pos / SEG) | 0;
    var pct = (pos - base * SEG) / SEG;
    var bi = base % TRACK;
    var camY = CAMH + hillY[bi] + (hillY[(bi + 1) % TRACK] - hillY[bi]) * pct;
    var camX = playerX * ROADW;
    var offroad = Math.abs(playerX) > 0.92 && speed > 300;
    var shx = 0, shy = 0;
    if (offroad && alive && started) { // off-road shake
      shx = (Math.random() - 0.5) * 6;
      shy = (Math.random() - 0.5) * 5;
    }
    // project all segment boundaries
    var x = 0, dx = -curve[bi] * pct, n, idx, z, s;
    for (n = 0; n <= DRAW; n++) {
      idx = (bi + n) % TRACK;
      z = (n + 1 - pct) * SEG;
      s = CAMD / z;
      sc[n] = s;
      sx[n] = HW + s * (x - camX) * HW + shx;
      sy[n] = HH - s * (hillY[idx] - camY) * HH + shy;
      sw[n] = s * ROADW * HW;
      x += dx;
      dx += curve[idx];
    }
    // road bands, front to back, hill-crest clipping
    var maxy = H + 2;
    cl[0] = maxy;
    for (n = 1; n <= DRAW; n++) {
      cl[n] = maxy;
      var y1 = sy[n - 1], y2 = sy[n];
      if (y2 >= maxy || y2 >= y1) continue;
      idx = (bi + n) % TRACK;
      var alt = (idx >> 2) & 1;
      g.fillStyle = grassCols[alt];
      g.fillRect(0, y2, W, y1 - y2 + 1);
      var w1 = sw[n - 1], w2 = sw[n];
      g.fillStyle = rumbleCols[(idx >> 1) & 1];
      quad(sx[n - 1], y1, w1 * 1.14, sx[n], y2, w2 * 1.14);
      g.fillStyle = roadCols[alt];
      quad(sx[n - 1], y1, w1, sx[n], y2, w2);
      if (alt === 0 && w1 > 24) { // dashed lane lines (2 for 3 lanes)
        g.fillStyle = laneCol;
        quad(sx[n - 1] - w1 / 3, y1, w1 * 0.016 + 0.5, sx[n] - w2 / 3, y2, w2 * 0.016 + 0.5);
        quad(sx[n - 1] + w1 / 3, y1, w1 * 0.016 + 0.5, sx[n] + w2 / 3, y2, w2 * 0.016 + 0.5);
      }
      maxy = y2;
    }
    // sprites back to front: roadside props, then traffic
    for (n = DRAW; n >= 1; n--) {
      idx = (bi + n) % TRACK;
      if (PROPS && idx % 9 === 0) {
        s = sc[n];
        var side = ((idx / 9) | 0) & 1 ? 1 : -1;
        var bx = sx[n] + s * side * ROADW * 1.4 * HW;
        var by = sy[n];
        if (by < cl[n]) {
          var ph = sw[n] * 0.3;
          if (ph > 3) {
            if (((idx / 9) | 0) % 3 === 0) { // palm
              g.fillStyle = trunkCol;
              g.fillRect(bx - ph * 0.05, by - ph, ph * 0.1, ph);
              g.fillStyle = grassCols[1];
              g.beginPath();
              g.arc(bx, by - ph, ph * 0.32, 0, 6.284);
              g.fill();
            } else { // post
              g.fillStyle = trunkCol;
              g.fillRect(bx - ph * 0.03, by - ph * 0.6, ph * 0.06, ph * 0.6);
              g.fillStyle = C.accent;
              g.fillRect(bx - ph * 0.1, by - ph * 0.7, ph * 0.2, ph * 0.12);
            }
          }
        }
      }
      for (var i = 0; i < NC; i++) {
        var c = cars[i];
        if (((c.rel / SEG) | 0) + 1 === n) drawTraffic(c, n);
      }
    }
    // player car (fixed near bottom, leans with steering)
    var pw = Math.min(W * 0.24, 150), ph2 = pw * 0.52;
    var pxs = HW + ((keys.r || touchR ? 1 : 0) - (keys.l || touchL ? 1 : 0)) * 7;
    var pys = H - ph2 * 0.7 - Math.max(12, H * 0.03) + (offroad ? (Math.random() - 0.5) * 4 : 0);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(pxs - pw * 0.55, pys, pw * 1.1, ph2 * 0.16); // shadow
    g.fillStyle = C.accent;
    g.fillRect(pxs - pw / 2, pys - ph2, pw, ph2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(pxs - pw * 0.34, pys - ph2 * 0.96, pw * 0.68, ph2 * 0.45); // rear window
    g.fillRect(pxs - pw * 0.56, pys - ph2 * 0.35, pw * 0.12, ph2 * 0.4);  // wheels
    g.fillRect(pxs + pw * 0.44, pys - ph2 * 0.35, pw * 0.12, ph2 * 0.4);
    g.fillStyle = C.bad;
    g.fillRect(pxs - pw * 0.42, pys - ph2 * 0.32, pw * 0.16, ph2 * 0.14); // taillights
    g.fillRect(pxs + pw * 0.26, pys - ph2 * 0.32, pw * 0.16, ph2 * 0.14);
    // speed label
    g.fillStyle = C.muted;
    g.font = '12px sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillText(((speed / MAXS * 320) | 0) + (api.lang === 'ru' ? ' км/ч' : ' km/h'), 10, H - 10);
    // start overlay
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), HW, HH - 14);
      g.fillStyle = C.muted;
      g.font = '14px sans-serif';
      g.fillText(api.lang === 'ru' ? 'Держи ◀ / ▶ чтобы рулить' : 'Hold ◀ / ▶ to steer', HW, HH + 16);
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

  // ---- input ----
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { keys.l = 1; started = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keys.r = 1; started = true; e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'ArrowUp') { started = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = 0;
    else if (e.key === 'ArrowRight' || e.key === 'd') keys.r = 0;
  }
  function setTouch(px2) {
    if (px2 < cv.W / 2) { touchL = 1; touchR = 0; }
    else { touchR = 1; touchL = 0; }
  }
  function onPtrDown(e) {
    started = true;
    ptrId = e.pointerId;
    setTouch(e.clientX - container.getBoundingClientRect().left);
  }
  function onPtrMove(e) {
    if (e.pointerId === ptrId && (touchL || touchR))
      setTouch(e.clientX - container.getBoundingClientRect().left);
  }
  function onPtrUp(e) {
    if (e.pointerId === ptrId) { touchL = 0; touchR = 0; ptrId = -1; }
  }
  container.addEventListener('pointerdown', onPtrDown);
  container.addEventListener('pointermove', onPtrMove);
  window.addEventListener('pointerup', onPtrUp);
  window.addEventListener('pointercancel', onPtrUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  var offSwipe = api.swipe(container, function (d) {
    if (d === 'tap' && !started) started = true;
  });

  makeSky();
  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPtrDown);
      container.removeEventListener('pointermove', onPtrMove);
      window.removeEventListener('pointerup', onPtrUp);
      window.removeEventListener('pointercancel', onPtrUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
