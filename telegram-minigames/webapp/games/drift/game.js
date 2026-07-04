/* Drift King — one-touch drift racer around a procedural circuit. */
(function () {
'use strict';
MG.register('drift', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';
  var LOW = api.lowEnd;

  // ---- color helpers (derive naturals from palette) ----
  function pc(c) {
    var m;
    if (c.charAt(0) === '#') {
      c = c.slice(1);
      if (c.length === 3) c = c.charAt(0) + c.charAt(0) + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2);
      m = parseInt(c, 16);
      return [m >> 16 & 255, m >> 8 & 255, m & 255];
    }
    m = c.match(/\d+/g);
    return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
  }
  function mix(a, b, t) {
    var A = pc(a), B = pc(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  var GRASS = mix(C.good, C.bg, 0.62);
  var GRASS2 = mix(C.good, C.bg, 0.7);
  var ASPH = mix(C.panel2, C.bg, 0.15);
  var KERB = mix(C.bad, C.text, 0.25);

  // ---- track generation ----
  var NCP = 10, SEG = 16;
  var ucp = [];        // unit control points
  var upts = [];       // unit centerline (NCP*SEG points)
  var pts = [];        // screen-space centerline
  var N = NCP * SEG;
  var halfW = 34, turnSign = 1;
  var tex = null, texG = null;
  var mini = [], MSZ = 60;

  function genUnit() {
    var i, r, pr = 0.8, a;
    ucp.length = 0;
    for (i = 0; i < NCP; i++) {
      r = 0.66 + Math.random() * 0.32;
      if (r - pr > 0.17) r = pr + 0.17;
      if (pr - r > 0.17) r = pr - 0.17;
      pr = r;
      a = i / NCP * Math.PI * 2;
      ucp.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    // Catmull-Rom sample
    upts.length = 0;
    for (i = 0; i < NCP; i++) {
      var p0 = ucp[(i + NCP - 1) % NCP], p1 = ucp[i], p2 = ucp[(i + 1) % NCP], p3 = ucp[(i + 2) % NCP];
      for (var j = 0; j < SEG; j++) {
        var t = j / SEG, t2 = t * t, t3 = t2 * t;
        upts.push({
          x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
  }

  function layout() {
    var i;
    halfW = Math.max(22, Math.min(40, Math.min(cv.W, cv.H) * 0.082));
    var sx = cv.W / 2 - halfW - 14, sy = cv.H / 2 - halfW - 20;
    var cx = cv.W / 2, cy = cv.H / 2;
    pts.length = 0;
    for (i = 0; i < N; i++) pts.push({ x: cx + upts[i].x * sx, y: cy + upts[i].y * sy });
    // winding sign (canvas coords)
    var area = 0;
    for (i = 0; i < N; i++) {
      var q = pts[(i + 1) % N];
      area += pts[i].x * q.y - q.x * pts[i].y;
    }
    turnSign = area > 0 ? 1 : -1;
    // minimap points
    mini.length = 0;
    var s = MSZ / Math.max(cv.W, cv.H) * 0.9;
    for (i = 0; i < N; i += 4) mini.push({ x: (pts[i].x - cx) * s, y: (pts[i].y - cy) * s });
    prerender();
  }

  function prerender() {
    if (!tex) { tex = document.createElement('canvas'); texG = tex.getContext('2d'); }
    tex.width = cv.W; tex.height = cv.H;
    var t = texG, i;
    t.fillStyle = GRASS;
    t.fillRect(0, 0, cv.W, cv.H);
    t.fillStyle = GRASS2;
    for (i = 0; i < 40; i++) {
      t.fillRect((Math.sin(i * 12.9) * 0.5 + 0.5) * cv.W, (Math.sin(i * 78.2) * 0.5 + 0.5) * cv.H, 14, 4);
    }
    t.beginPath();
    t.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < N; i++) t.lineTo(pts[i].x, pts[i].y);
    t.closePath();
    t.lineJoin = 'round'; t.lineCap = 'round';
    t.strokeStyle = KERB; t.lineWidth = halfW * 2 + 8; t.stroke();
    t.strokeStyle = ASPH; t.lineWidth = halfW * 2; t.stroke();
    t.strokeStyle = mix(C.muted, ASPH, 0.5); t.lineWidth = 2;
    t.setLineDash([10, 12]); t.stroke(); t.setLineDash([]);
    // start line
    var p = pts[0], q = pts[2];
    var dx = q.x - p.x, dy = q.y - p.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / L, ny = dx / L;
    for (i = -4; i < 4; i++) {
      var cx1 = p.x + nx * i * (halfW / 4), cy1 = p.y + ny * i * (halfW / 4);
      t.save(); t.translate(cx1, cy1); t.rotate(Math.atan2(dy, dx));
      t.fillStyle = (i % 2 === 0) ? C.text : C.bg;
      t.fillRect(-3, -halfW / 8, 6, halfW / 4);
      t.restore();
    }
  }

  // ---- car state ----
  var car = { x: 0, y: 0, a: 0, vx: 0, vy: 0, idx: 0 };
  var hold = false, started = false, crashed = false, paused = false;
  var score = 0, shown = -1, driftPts = 0, laps = 0, lapAcc = 0;
  var driftT = 0, grace = 0, combo = 1, grassT = 0, shake = 0;
  var ACC = 240, TURN = 3.3, maxSp = 300;
  var raf = 0, last = 0, accum = 0, STEP = 1 / 60, frame = 0;

  // pools
  var SKN = LOW ? 0 : 260;
  var skid = [], skHead = 0;
  var SMN = LOW ? 10 : 36;
  var smoke = [];
  (function () {
    var i;
    for (i = 0; i < SKN; i++) skid.push({ x: 0, y: 0, life: 0 });
    for (i = 0; i < SMN; i++) smoke.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 });
  })();

  function reset() {
    genUnit();
    layout();
    maxSp = halfW * 7.0;
    car.x = pts[0].x; car.y = pts[0].y;
    car.a = Math.atan2(pts[3].y - pts[0].y, pts[3].x - pts[0].x);
    car.vx = 0; car.vy = 0; car.idx = 0;
    score = 0; driftPts = 0; laps = 0; lapAcc = 0;
    driftT = 0; grace = 0; combo = 1; grassT = 0; shake = 0;
    crashed = false; started = false;
    var i;
    for (i = 0; i < SKN; i++) skid[i].life = 0;
    for (i = 0; i < SMN; i++) smoke[i].life = 0;
    api.score(0); shown = 0;
  }

  cv.onResize = function () {
    var ux = pts.length ? car.x : 0, uy = car.y;
    var oldW = tex ? tex.width : cv.W, oldH = tex ? tex.height : cv.H;
    layout();
    if (oldW && oldH) { car.x = ux / oldW * cv.W; car.y = uy / oldH * cv.H; }
    maxSp = halfW * 7.0;
  };

  function nearest() {
    var best = 1e9, bi = car.idx, i, k;
    for (k = -10; k <= 10; k++) {
      i = (car.idx + k + N) % N;
      var dx = pts[i].x - car.x, dy = pts[i].y - car.y;
      var d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    var delta = (bi - car.idx + N) % N;
    if (delta <= N / 2) lapAcc += delta; else lapAcc -= (N - delta);
    car.idx = bi;
    return Math.sqrt(best);
  }

  function spawnSmoke(x, y) {
    var i;
    for (i = 0; i < SMN; i++) {
      if (smoke[i].life <= 0) {
        smoke[i].x = x; smoke[i].y = y;
        smoke[i].vx = (Math.random() - 0.5) * 30;
        smoke[i].vy = (Math.random() - 0.5) * 30;
        smoke[i].life = 0.6;
        return;
      }
    }
  }

  function step() {
    if (crashed) return;
    frame++;
    var dt = STEP;
    if (hold) car.a += turnSign * TURN * dt;
    var fx = Math.cos(car.a), fy = Math.sin(car.a);
    var px2 = -fy, py2 = fx;
    car.vx += fx * ACC * dt; car.vy += fy * ACC * dt;
    var fwd = car.vx * fx + car.vy * fy;
    var lat = car.vx * px2 + car.vy * py2;
    if (fwd > maxSp) fwd = maxSp;
    fwd *= 0.996;
    lat *= hold ? 0.955 : 0.86;
    car.vx = fx * fwd + px2 * lat;
    car.vy = fy * fwd + py2 * lat;

    var d = nearest();
    var onGrass = d > halfW - 4;
    if (onGrass) {
      car.vx *= 0.94; car.vy *= 0.94;
      grassT += dt;
      shake = Math.min(6, grassT * 10);
      if (grassT > 0.6) {
        crashed = true;
        api.haptic('error');
        api.gameOver(score);
        return;
      }
    } else {
      grassT = 0; shake *= 0.85;
    }

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // laps
    if (lapAcc >= N) {
      lapAcc -= N;
      laps++;
      api.haptic('success');
    }

    // drift scoring
    var spd = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    var drifting = Math.abs(lat) > maxSp * 0.22 && spd > maxSp * 0.45 && !onGrass;
    if (drifting) {
      driftT += dt; grace = 0.25;
      combo = 1 + Math.min(4, driftT | 0);
      var near = d > halfW * 0.55 ? 2 : 1;
      driftPts += dt * 12 * combo * near;
      if (SKN) {
        var k;
        for (k = -1; k <= 1; k += 2) {
          var s = skid[skHead];
          s.x = car.x - fx * 7 + px2 * 5 * k;
          s.y = car.y - fy * 7 + py2 * 5 * k;
          s.life = 2.6;
          skHead = (skHead + 1) % SKN;
        }
      }
      if (frame % (LOW ? 6 : 3) === 0) spawnSmoke(car.x - fx * 8, car.y - fy * 8);
    } else {
      grace -= dt;
      if (grace <= 0) { driftT = 0; combo = 1; }
    }

    var sc = (driftPts | 0) + laps * 100;
    if (sc !== score) {
      score = sc;
      if (score !== shown) { api.score(score); shown = score; }
    }

    var i;
    for (i = 0; i < SMN; i++) {
      var m = smoke[i];
      if (m.life > 0) { m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt; }
    }
    if (SKN) for (i = 0; i < SKN; i++) { if (skid[i].life > 0) skid[i].life -= dt; }
  }

  function draw() {
    g.save();
    if (shake > 0.3) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    g.drawImage(tex, 0, 0);
    var i;
    // skid marks
    if (SKN) {
      g.fillStyle = 'rgba(0,0,0,0.30)';
      for (i = 0; i < SKN; i++) {
        var s = skid[i];
        if (s.life > 0) {
          g.globalAlpha = Math.min(1, s.life / 2.6);
          g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        }
      }
      g.globalAlpha = 1;
    }
    // smoke
    for (i = 0; i < SMN; i++) {
      var m = smoke[i];
      if (m.life > 0) {
        g.globalAlpha = m.life * 0.4;
        g.fillStyle = C.muted;
        g.beginPath();
        g.arc(m.x, m.y, 4 + (0.6 - m.life) * 10, 0, 6.283);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    // car
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.a);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-11, -7, 4, 3); g.fillRect(-11, 4, 4, 3);
    g.fillRect(6, -7, 4, 3); g.fillRect(6, 4, 4, 3);
    g.fillStyle = C.accent;
    g.fillRect(-11, -6, 23, 12);
    g.fillStyle = mix(C.accent, C.bg, 0.45);
    g.fillRect(-4, -4, 9, 8);
    g.fillStyle = C.text;
    g.fillRect(9, -5, 3, 10);
    g.restore();
    g.restore();

    // minimap
    var mx = cv.W - MSZ / 2 - 12, my = MSZ / 2 + 12;
    g.globalAlpha = 0.8;
    g.strokeStyle = C.muted; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(mx + mini[0].x, my + mini[0].y);
    for (i = 1; i < mini.length; i++) g.lineTo(mx + mini[i].x, my + mini[i].y);
    g.closePath(); g.stroke();
    g.fillStyle = C.accent;
    var ms = MSZ / Math.max(cv.W, cv.H) * 0.9;
    g.beginPath();
    g.arc(mx + (car.x - cv.W / 2) * ms, my + (car.y - cv.H / 2) * ms, 3, 0, 6.283);
    g.fill();
    g.globalAlpha = 1;

    // HUD
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = 'bold 13px sans-serif';
    g.fillStyle = C.text;
    g.fillText((RU ? 'Круг ' : 'Lap ') + (laps + 1), 12, 12);
    if (driftT > 0.15) {
      g.textAlign = 'center';
      g.font = 'bold 20px sans-serif';
      g.fillStyle = C.accent;
      g.fillText((RU ? 'ДРИФТ' : 'DRIFT') + ' ×' + combo, cv.W / 2, 14);
    }
    if (grassT > 0.1 && !crashed) {
      g.textAlign = 'center';
      g.font = 'bold 16px sans-serif';
      g.fillStyle = C.bad;
      g.fillText(RU ? 'Вернись на трассу!' : 'Back on track!', cv.W / 2, 44);
    }

    if (!started && !crashed) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2 - 14);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Держи — поворот, отпусти — прямо' : 'Hold to turn, release to straighten', cv.W / 2, cv.H / 2 + 14);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(100, ts - last) / 1000;
    last = ts;
    if (started && !crashed) {
      accum += dt;
      while (accum >= STEP && !crashed) { accum -= STEP; step(); }
    }
    draw();
  }

  // ---- input ----
  function press() { if (!started) started = true; hold = true; }
  function release() { hold = false; }
  function onPtrDown(e) { press(); e.preventDefault(); }
  function onPtrUp() { release(); }
  function onKeyDown(e) {
    if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'a' || e.key === 'd') {
      press(); e.preventDefault();
    }
  }
  function onKeyUp() { release(); }
  container.addEventListener('pointerdown', onPtrDown);
  window.addEventListener('pointerup', onPtrUp);
  window.addEventListener('pointercancel', onPtrUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPtrDown);
      window.removeEventListener('pointerup', onPtrUp);
      window.removeEventListener('pointercancel', onPtrUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
