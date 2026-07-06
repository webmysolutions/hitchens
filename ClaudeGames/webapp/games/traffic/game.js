/* Traffic Control — tap cars to stop/go at a 4-way crossing. MG contract game. */
(function () {
'use strict';
MG.register('traffic', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var raf = 0, lastT = 0, paused = false, over = false, started = false;
  var score = 0, tms = 0, playT = 0;
  var OFF = 15, RHALF = 30, CW = 17, CRUISE = 0.1;
  var crashT = 0, crashX = 0, crashY = 0;
  var slowT = 0, flt = { t: 0, x: 0, y: 0, s: '' };
  var spawnAcc = 0, ambIn = 11000;

  var NC = api.lowEnd ? 26 : 36;
  var cars = [], i;
  for (i = 0; i < NC; i++) {
    cars.push({ on: false, dir: 0, pos: 0, v: 0, stop: false, brake: false,
      len: 28, amb: false, col: 0, ncd: 0, x: 0, y: 0, hx: 0, hy: 0 });
  }
  var DASH = [8, 10], NODASH = [];

  function roadLen(d) { return (d < 2 ? cv.W : cv.H) + 60; }
  function place(c) {
    var cx = cv.W / 2, cy = cv.H / 2;
    if (c.dir === 0) { c.x = c.pos - 30; c.y = cy + OFF; }
    else if (c.dir === 1) { c.x = cv.W + 30 - c.pos; c.y = cy - OFF; }
    else if (c.dir === 2) { c.y = c.pos - 30; c.x = cx - OFF; }
    else { c.y = cv.H + 30 - c.pos; c.x = cx + OFF; }
    if (c.dir < 2) { c.hx = c.len / 2; c.hy = CW / 2; }
    else { c.hx = CW / 2; c.hy = c.len / 2; }
  }

  function spawn(amb) {
    var d = (Math.random() * 4) | 0, j, c = null;
    for (j = 0; j < NC; j++) {
      var o = cars[j];
      if (o.on && o.dir === d && o.pos < 90) return; // spawn point occupied
      if (!o.on && !c) c = o;
    }
    if (!c) return;
    c.on = true; c.dir = d; c.pos = 0;
    c.v = CRUISE; c.stop = false; c.brake = false; c.ncd = 0;
    c.amb = !!amb;
    c.len = amb ? 34 : 28;
    c.col = (Math.random() * 3) | 0;
    place(c);
  }

  function update(dt) {
    tms += dt;
    if (!started || over) return;
    if (crashT > 0) {
      crashT -= dt;
      if (crashT <= 0) { over = true; api.gameOver(score); }
      return;
    }
    var ts2 = slowT > 0 ? 0.35 : 1;
    if (slowT > 0) slowT -= dt;
    var sdt = dt * ts2;
    playT += sdt;
    if (flt.t > 0) flt.t -= dt;
    // spawn
    spawnAcc += sdt;
    ambIn -= sdt;
    var every = Math.max(650, 2100 - playT * 0.022);
    if (spawnAcc > every) {
      spawnAcc = 0;
      if (ambIn <= 0) { spawn(true); ambIn = 12000 + Math.random() * 8000; }
      else spawn(false);
    }
    // move
    var j, k;
    for (j = 0; j < NC; j++) {
      var c = cars[j];
      if (!c.on) continue;
      var gap = 1e9;
      for (k = 0; k < NC; k++) {
        var o = cars[k];
        if (k === j || !o.on || o.dir !== c.dir || o.pos <= c.pos) continue;
        var dp = o.pos - c.pos - (o.len + c.len) / 2;
        if (dp < gap) gap = dp;
      }
      var cr = c.amb ? CRUISE * 1.2 : CRUISE;
      var target = c.stop ? 0 : cr;
      if (gap < 12) target = 0;
      else if (gap < 44) target = Math.min(target, cr * gap / 44);
      var dv = target - c.v;
      var lim = dv < 0 ? 0.0011 * sdt : 0.0005 * sdt;
      c.v += Math.max(-lim, Math.min(lim, dv));
      if (c.v < 0.0001 && target === 0) c.v = 0;
      c.brake = target < c.v - 0.005 || (c.stop && c.v < 0.02);
      c.pos += c.v * sdt;
      place(c);
      if (c.ncd > 0) c.ncd -= dt;
      if (c.pos > roadLen(c.dir)) {
        c.on = false;
        score += c.amb ? 5 : 1;
        api.score(score);
        if (c.amb) api.haptic('success');
        else if (score % 25 === 0) api.haptic('light');
      }
    }
    // crossings: collisions + near-misses (perpendicular pairs near center)
    var cx = cv.W / 2, cy = cv.H / 2;
    for (j = 0; j < NC; j++) {
      var a = cars[j];
      if (!a.on || a.dir >= 2) continue;
      if (Math.abs(a.x - cx) > 90) continue;
      for (k = 0; k < NC; k++) {
        var b = cars[k];
        if (!b.on || b.dir < 2) continue;
        if (Math.abs(b.y - cy) > 90) continue;
        var ddx = Math.abs(a.x - b.x), ddy = Math.abs(a.y - b.y);
        if (ddx < a.hx + b.hx && ddy < a.hy + b.hy) {
          crashT = 1000; crashX = (a.x + b.x) / 2; crashY = (a.y + b.y) / 2;
          api.haptic('error');
          return;
        }
        if (a.ncd <= 0 && b.ncd <= 0 && a.v > 0.04 && b.v > 0.04 &&
            ddx < a.hx + b.hx + 11 && ddy < a.hy + b.hy + 11) {
          a.ncd = 2000; b.ncd = 2000;
          score += 2; api.score(score);
          slowT = 450;
          flt.t = 800; flt.x = (a.x + b.x) / 2; flt.y = (a.y + b.y) / 2 - 18; flt.s = '+2';
          api.haptic('medium');
        }
      }
    }
  }

  function drawCar(c) {
    var w = c.dir < 2 ? c.len : CW, h = c.dir < 2 ? CW : c.len;
    var x = c.x - w / 2, y = c.y - h / 2;
    if (c.amb) {
      g.fillStyle = C.text;
      g.fillRect(x, y, w, h);
      g.fillStyle = C.bad;
      if (c.dir < 2) g.fillRect(x + w / 2 - 2, y + 2, 4, h - 4);
      else g.fillRect(x + 2, y + h / 2 - 2, 4, w - 4);
      if (((tms / 160) | 0) % 2 === 0) { g.fillStyle = C.accent; }
      g.fillRect(c.x - 3, c.y - 3, 6, 6);
    } else {
      g.fillStyle = c.col === 0 ? C.accent : c.col === 1 ? C.good : C.muted;
      g.fillRect(x, y, w, h);
      g.fillStyle = C.panel2; // windshield toward travel direction
      if (c.dir === 0) g.fillRect(x + w - 9, y + 2, 6, h - 4);
      else if (c.dir === 1) g.fillRect(x + 3, y + 2, 6, h - 4);
      else if (c.dir === 2) g.fillRect(x + 2, y + h - 9, w - 4, 6);
      else g.fillRect(x + 2, y + 3, w - 4, 6);
    }
    if (c.brake || c.stop) { // brake lights at rear
      g.fillStyle = C.bad;
      if (c.dir === 0) { g.fillRect(x, y, 3, 4); g.fillRect(x, y + h - 4, 3, 4); }
      else if (c.dir === 1) { g.fillRect(x + w - 3, y, 3, 4); g.fillRect(x + w - 3, y + h - 4, 3, 4); }
      else if (c.dir === 2) { g.fillRect(x, y, 4, 3); g.fillRect(x + w - 4, y, 4, 3); }
      else { g.fillRect(x, y + h - 3, 4, 3); g.fillRect(x + w - 4, y + h - 3, 4, 3); }
    }
    if (c.stop) {
      g.strokeStyle = C.bad;
      g.strokeRect(x - 2, y - 2, w + 4, h + 4);
    }
  }

  function draw() {
    var W = cv.W, H = cv.H, cx = W / 2, cy = H / 2, j;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = C.panel;
    g.fillRect(0, cy - RHALF, W, RHALF * 2);
    g.fillRect(cx - RHALF, 0, RHALF * 2, H);
    // center dashes
    g.strokeStyle = C.muted; g.globalAlpha = 0.5;
    g.setLineDash(DASH);
    g.beginPath();
    g.moveTo(0, cy); g.lineTo(cx - RHALF, cy);
    g.moveTo(cx + RHALF, cy); g.lineTo(W, cy);
    g.moveTo(cx, 0); g.lineTo(cx, cy - RHALF);
    g.moveTo(cx, cy + RHALF); g.lineTo(cx, H);
    g.stroke();
    g.setLineDash(NODASH);
    // stop lines
    g.strokeStyle = C.text; g.globalAlpha = 0.25;
    g.beginPath();
    g.moveTo(cx - RHALF - 4, cy); g.lineTo(cx - RHALF - 4, cy + RHALF);
    g.moveTo(cx + RHALF + 4, cy - RHALF); g.lineTo(cx + RHALF + 4, cy);
    g.moveTo(cx - RHALF, cy - RHALF - 4); g.lineTo(cx, cy - RHALF - 4);
    g.moveTo(cx, cy + RHALF + 4); g.lineTo(cx + RHALF, cy + RHALF + 4);
    g.stroke();
    g.globalAlpha = 1;
    for (j = 0; j < NC; j++) if (cars[j].on) drawCar(cars[j]);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (slowT > 0) {
      g.globalAlpha = 0.12; g.fillStyle = C.accent;
      g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    }
    if (flt.t > 0) {
      g.globalAlpha = Math.min(1, flt.t / 400);
      g.fillStyle = C.good; g.font = 'bold 15px sans-serif';
      g.fillText(flt.s, flt.x, flt.y - (800 - flt.t) * 0.02);
      g.globalAlpha = 1;
    }
    if (crashT > 0 || (over && crashX)) {
      g.globalAlpha = 0.15; g.fillStyle = C.bad;
      g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      g.font = '36px sans-serif';
      g.fillText('💥', crashX, crashY);
    }
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H);
      g.fillStyle = C.text; g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2 - RHALF - 30);
      g.font = '13px sans-serif'; g.fillStyle = C.muted;
      g.fillText(RU ? 'Тап по машине — стоп / поехали' : 'Tap a car to stop / go',
        W / 2, H / 2 - RHALF - 8);
    }
  }

  function onDown(ev) {
    if (over || crashT > 0) return;
    if (!started) { started = true; return; }
    var r = container.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    var best = null, bd = 1e9;
    for (var j = 0; j < NC; j++) {
      var c = cars[j];
      if (!c.on) continue;
      var d = Math.abs(c.x - x) + Math.abs(c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < 46) {
      best.stop = !best.stop;
      api.haptic('light');
    }
  }
  function onKey(e) {
    if (e.key === ' ' && !started) { started = true; e.preventDefault(); }
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { lastT = ts; return; }
    var dt = Math.min(50, ts - lastT);
    lastT = ts;
    update(dt);
    draw();
  }
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
