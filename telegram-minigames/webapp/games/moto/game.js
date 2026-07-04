/* Moto Hills — side-view hill climb bike with torque control. */
(function () {
'use strict';
MG.register('moto', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';
  var LOW = api.lowEnd;

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
  var DIRT = mix(C.good, C.bg, 0.72);
  var TURF = mix(C.good, C.bg, 0.35);
  var FAR = mix(C.panel, C.bg, 0.45);
  var GOLD = mix(C.accent, '#ffd75e', 0.7);

  // ---- terrain ----
  var P1 = Math.random() * 6, P2 = Math.random() * 6, P3 = Math.random() * 6;
  function gy(x) {
    if (x < 150) return 0;
    var ramp = Math.min(1, (x - 150) / 500);
    var a1 = 36 + Math.min(85, x * 0.011);
    var a2 = 8 + Math.min(28, x * 0.005);
    return -ramp * (a1 * Math.sin(x * 0.0019 + P1) + a1 * 0.55 * Math.sin(x * 0.0034 + P2) + a2 * Math.sin(x * 0.0088 + P3));
  }
  function slope(x) { return (gy(x + 3) - gy(x - 3)) / 6; }

  // ---- physics (verlet, 2-wheel + stick) ----
  var G = 1250, R = 12, WB = 48, PXM = 20;
  var w0 = { x: 0, y: 0, px: 0, py: 0, c: false, rot: 0 };
  var w1 = { x: 0, y: 0, px: 0, py: 0, c: false, rot: 0 };
  var midX = 0, midY = 0, ang = 0, pAng = 0;
  var throttle = false, brake = false;
  var started = false, over = false, paused = false;
  var fuel = 100, coins = 0, flips = 0, maxX = 0;
  var airT = 0, cumRot = 0, idleT = 0, bannerT = 0, bannerTx = '';
  var score = 0, shown = -1;
  var camX = 0, camY = 0;
  var raf = 0, last = 0, accum = 0, STEP = 1 / 60;

  // pickups: {x,y,t:0 coin|1 fuel, on}
  var items = [], genX = 300;
  var IN = 48;
  (function () { for (var i = 0; i < IN; i++) items.push({ x: 0, y: 0, t: 0, on: false }); })();
  function addItem(x, y, t) {
    for (var i = 0; i < IN; i++) {
      if (!items[i].on) { items[i].x = x; items[i].y = y; items[i].t = t; items[i].on = true; return; }
    }
  }

  var SPN = LOW ? 8 : 22;
  var sparks = [];
  (function () { for (var i = 0; i < SPN; i++) sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }); })();
  function burst(x, y, n) {
    var k = 0;
    for (var i = 0; i < SPN && k < n; i++) {
      if (sparks[i].life <= 0) {
        sparks[i].x = x; sparks[i].y = y;
        sparks[i].vx = (Math.random() - 0.5) * 160;
        sparks[i].vy = -Math.random() * 140;
        sparks[i].life = 0.5;
        k++;
      }
    }
  }

  function reset() {
    w0.x = 60; w0.y = gy(60) - R; w0.px = w0.x; w0.py = w0.y; w0.c = true; w0.rot = 0;
    w1.x = 60 + WB; w1.y = gy(60 + WB) - R; w1.px = w1.x; w1.py = w1.y; w1.c = true; w1.rot = 0;
    midX = 60 + WB / 2; midY = w0.y - 10;
    ang = 0; pAng = 0;
    fuel = 100; coins = 0; flips = 0; maxX = 0;
    airT = 0; cumRot = 0; idleT = 0; bannerT = 0;
    started = false; over = false;
    throttle = false; brake = false;
    genX = 300;
    var i;
    for (i = 0; i < IN; i++) items[i].on = false;
    for (i = 0; i < SPN; i++) sparks[i].life = 0;
    camX = 0; camY = -cv.H * 0.55;
    score = 0; shown = 0; api.score(0);
  }

  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= 6.283185307;
    while (d < -Math.PI) d += 6.283185307;
    return d;
  }

  function wheelStep(w, other, rear, dt2) {
    var ax = 0, ay = G;
    var canDrive = fuel > 0;
    if (w.c) {
      var s = slope(w.x), il = 1 / Math.sqrt(1 + s * s);
      var tx = il, ty = s * il;
      if (throttle && canDrive) { ax += 900 * tx; ay += 900 * ty; }
      if (brake) { ax -= 620 * tx; ay -= 620 * ty; }
    } else if (!w0.c && !w1.c) {
      // air torque: throttle tilts back (rear down / front up), brake forward
      var tq = 0;
      if (throttle && canDrive) tq = rear ? 520 : -520;
      else if (brake) tq = rear ? -520 : 520;
      ay += tq;
    }
    var nx = w.x + (w.x - w.px) * 0.998 + ax * dt2;
    var ny = w.y + (w.y - w.py) * 0.998 + ay * dt2;
    w.px = w.x; w.py = w.y;
    w.x = nx; w.y = ny;
  }

  function constrain() {
    var it, i;
    for (it = 0; it < 3; it++) {
      // stick
      var dx = w1.x - w0.x, dy = w1.y - w0.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      var cr = (d - WB) / d * 0.5;
      w0.x += dx * cr; w0.y += dy * cr;
      w1.x -= dx * cr; w1.y -= dy * cr;
      // ground
      var ws = [w0, w1];
      for (i = 0; i < 2; i++) {
        var w = ws[i];
        var gh = gy(w.x) - R;
        if (w.y > gh) {
          var vy = w.y - w.py, vx = w.x - w.px;
          w.y = gh;
          w.py = w.y + vy * 0.35;
          w.px = w.x - vx * (brake ? 0.9 : 0.99);
          w.c = true;
        } else if (it === 0) w.c = false;
      }
    }
  }

  function step() {
    if (over) return;
    var dt = STEP, dt2 = dt * dt, i;
    wheelStep(w0, w1, true, dt2);
    wheelStep(w1, w0, false, dt2);
    constrain();

    midX = (w0.x + w1.x) / 2;
    midY = (w0.y + w1.y) / 2;
    ang = Math.atan2(w1.y - w0.y, w1.x - w0.x);
    var vx = (w0.x - w0.px + w1.x - w1.px) * 0.5 / dt;
    w0.rot += (w0.x - w0.px) / R;
    w1.rot += (w1.x - w1.px) / R;

    // flips
    var air = !w0.c && !w1.c;
    if (air) {
      airT += dt;
      cumRot += angDiff(ang, pAng);
    } else {
      if (airT > 0.35 && Math.abs(cumRot) > 5.4) {
        var n = Math.max(1, Math.round(Math.abs(cumRot) / 6.283));
        flips += n;
        bannerT = 1.4;
        bannerTx = (cumRot < 0 ? (RU ? 'Сальто назад!' : 'Backflip!') : (RU ? 'Сальто вперёд!' : 'Frontflip!')) + ' +' + (n * 50);
        api.haptic('success');
      }
      airT = 0; cumRot = 0;
    }
    pAng = ang;

    // head crash
    var ux = Math.sin(ang), uy = -Math.cos(ang);
    var hx2 = midX + ux * 27 - Math.cos(ang) * 3;
    var hy2 = midY + uy * 27 - Math.sin(ang) * 3;
    if (hy2 > gy(hx2) - 6) {
      over = true;
      api.haptic('error');
      burst(hx2, hy2, 10);
      api.gameOver(total());
      return;
    }

    // fuel
    if (fuel > 0) fuel -= dt * (throttle ? 3.4 : 1.0);
    if (fuel < 0) fuel = 0;
    if (fuel <= 0 && Math.abs(vx) < 10 && !air) {
      idleT += dt;
      if (idleT > 1.5) { over = true; api.gameOver(total()); return; }
    } else idleT = 0;

    // spawn pickups
    while (genX < midX + cv.W + 200) {
      var r = Math.random();
      if (r < 0.3) {
        var n2 = 3;
        for (i = 0; i < n2; i++) addItem(genX + i * 26, gy(genX + i * 26) - 42 - Math.sin(i / (n2 - 1) * Math.PI) * 18, 0);
      } else if (r < 0.38) {
        addItem(genX, gy(genX) - 34, 1);
      }
      genX += 170 + Math.random() * 120;
    }
    // collect / cull
    for (i = 0; i < IN; i++) {
      var p = items[i];
      if (!p.on) continue;
      if (p.x < midX - cv.W) { p.on = false; continue; }
      var ddx = p.x - midX, ddy = p.y - midY;
      if (ddx * ddx + ddy * ddy < 32 * 32) {
        p.on = false;
        if (p.t === 0) { coins++; api.haptic('light'); burst(p.x, p.y, 3); }
        else { fuel = Math.min(100, fuel + 45); api.haptic('light'); }
      }
    }

    for (i = 0; i < SPN; i++) {
      var sp = sparks[i];
      if (sp.life > 0) { sp.life -= dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 500 * dt; }
    }
    if (bannerT > 0) bannerT -= dt;

    if (midX > maxX) maxX = midX;
    var sc = total();
    if (sc !== shown) { score = sc; api.score(sc); shown = sc; }

    // camera
    camX = midX - cv.W * 0.38;
    camY += (midY - cv.H * 0.52 - camY) * 0.08;
  }

  function total() {
    return ((maxX / PXM) | 0) + flips * 50 + coins * 10;
  }

  function drawWheel(w) {
    var x = w.x - camX, y = w.y - camY;
    g.beginPath(); g.arc(x, y, R, 0, 6.283);
    g.fillStyle = mix(C.text, C.bg, 0.75); g.fill();
    g.beginPath(); g.arc(x, y, R - 3.5, 0, 6.283);
    g.fillStyle = C.panel; g.fill();
    g.strokeStyle = C.muted; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x - Math.cos(w.rot) * (R - 4), y - Math.sin(w.rot) * (R - 4));
    g.lineTo(x + Math.cos(w.rot) * (R - 4), y + Math.sin(w.rot) * (R - 4));
    g.moveTo(x - Math.cos(w.rot + 1.57) * (R - 4), y - Math.sin(w.rot + 1.57) * (R - 4));
    g.lineTo(x + Math.cos(w.rot + 1.57) * (R - 4), y + Math.sin(w.rot + 1.57) * (R - 4));
    g.stroke();
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    var i, x;
    // far hills
    if (!LOW) {
      g.fillStyle = FAR;
      g.beginPath();
      g.moveTo(0, cv.H);
      for (x = 0; x <= cv.W; x += 24) {
        var wx2 = (x + camX * 0.3);
        g.lineTo(x, cv.H * 0.45 + Math.sin(wx2 * 0.004) * 40 + Math.sin(wx2 * 0.011) * 14);
      }
      g.lineTo(cv.W, cv.H);
      g.closePath(); g.fill();
    }
    // terrain
    g.beginPath();
    g.moveTo(-4, cv.H + 4);
    for (x = -4; x <= cv.W + 8; x += 8) g.lineTo(x, gy(x + camX) - camY);
    g.lineTo(cv.W + 8, cv.H + 4);
    g.closePath();
    g.fillStyle = DIRT; g.fill();
    g.strokeStyle = TURF; g.lineWidth = 5;
    g.beginPath();
    for (x = -4; x <= cv.W + 8; x += 8) {
      if (x === -4) g.moveTo(x, gy(x + camX) - camY);
      else g.lineTo(x, gy(x + camX) - camY);
    }
    g.stroke();

    // items
    for (i = 0; i < IN; i++) {
      var p = items[i];
      if (!p.on) continue;
      var sx = p.x - camX, sy = p.y - camY;
      if (sx < -20 || sx > cv.W + 20) continue;
      if (p.t === 0) {
        g.beginPath(); g.arc(sx, sy, 9, 0, 6.283);
        g.fillStyle = GOLD; g.fill();
        g.strokeStyle = mix(GOLD, C.bg, 0.4); g.lineWidth = 2;
        g.beginPath(); g.arc(sx, sy, 5.5, 0, 6.283); g.stroke();
      } else {
        g.fillStyle = C.bad;
        g.fillRect(sx - 8, sy - 10, 16, 20);
        g.fillStyle = C.text;
        g.fillRect(sx - 4, sy - 13, 8, 4);
        g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('F', sx, sy + 1);
      }
    }

    // bike
    var mx = midX - camX, my = midY - camY;
    drawWheel(w0); drawWheel(w1);
    g.save();
    g.translate(mx, my);
    g.rotate(ang);
    g.strokeStyle = C.accent; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-WB / 2, 0); g.lineTo(-8, -12); g.lineTo(10, -12); g.lineTo(WB / 2, 0);
    g.stroke();
    g.fillStyle = C.accent;
    g.fillRect(-12, -16, 20, 7);
    // rider
    g.strokeStyle = C.text; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-2, -14); g.lineTo(-6, -26);
    g.moveTo(-6, -26); g.lineTo(12, -14);
    g.stroke();
    g.beginPath(); g.arc(-7, -31, 6, 0, 6.283);
    g.fillStyle = C.accent; g.fill();
    g.strokeStyle = C.text; g.lineWidth = 1.5; g.stroke();
    g.restore();

    // sparks
    for (i = 0; i < SPN; i++) {
      var sp = sparks[i];
      if (sp.life > 0) {
        g.globalAlpha = sp.life * 2;
        g.fillStyle = GOLD;
        g.fillRect(sp.x - camX - 2, sp.y - camY - 2, 4, 4);
      }
    }
    g.globalAlpha = 1;

    // fuel bar
    var fw = 96;
    g.fillStyle = C.panel;
    g.fillRect(12, 12, fw, 12);
    g.fillStyle = fuel > 25 ? C.good : C.bad;
    g.fillRect(13, 13, (fw - 2) * fuel / 100, 10);
    g.strokeStyle = C.muted; g.lineWidth = 1;
    g.strokeRect(12, 12, fw, 12);
    g.font = 'bold 10px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = C.muted;
    g.fillText(RU ? 'ТОПЛИВО' : 'FUEL', 12, 28);
    g.fillText(((maxX / PXM) | 0) + (RU ? ' м' : ' m'), 12, 42);

    // banner
    if (bannerT > 0) {
      g.globalAlpha = Math.min(1, bannerT);
      g.font = 'bold 22px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.accent;
      g.fillText(bannerTx, cv.W / 2, cv.H * 0.24);
      g.globalAlpha = 1;
    }

    // control hints
    if (started && !over) {
      g.globalAlpha = 0.35;
      g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillStyle = brake ? C.accent : C.muted;
      g.fillText(RU ? '◀ ТОРМОЗ' : '◀ BRAKE', cv.W * 0.25, cv.H - 12);
      g.fillStyle = throttle ? C.accent : C.muted;
      g.fillText(RU ? 'ГАЗ ▶' : 'GAS ▶', cv.W * 0.75, cv.H - 12);
      g.globalAlpha = 1;
    }

    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2 - 26);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Справа — газ, слева — тормоз' : 'Right side — gas, left — brake', cv.W / 2, cv.H / 2 + 2);
      g.fillText(RU ? 'В воздухе — наклон корпуса' : 'In air they tilt the bike', cv.W / 2, cv.H / 2 + 22);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(100, ts - last) / 1000;
    last = ts;
    if (started && !over) {
      accum += dt;
      while (accum >= STEP && !over) { accum -= STEP; step(); }
    }
    draw();
  }

  // ---- input ----
  var ptrs = {};
  function updHold() {
    var l = false, r = false, id;
    for (id in ptrs) { if (ptrs[id] === 0) l = true; else r = true; }
    brake = l || keyL;
    throttle = r || keyR;
  }
  var keyL = false, keyR = false;
  function px(e) { return e.clientX - container.getBoundingClientRect().left; }
  function onPtrDown(e) {
    started = true;
    ptrs[e.pointerId] = px(e) < cv.W / 2 ? 0 : 1;
    updHold();
    e.preventDefault();
  }
  function onPtrMove(e) {
    if (ptrs[e.pointerId] !== undefined) {
      ptrs[e.pointerId] = px(e) < cv.W / 2 ? 0 : 1;
      updHold();
    }
  }
  function onPtrUp(e) {
    delete ptrs[e.pointerId];
    updHold();
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'd' || e.key === 'w') { keyR = true; started = true; e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'a' || e.key === 's') { keyL = true; started = true; e.preventDefault(); }
    updHold();
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'd' || e.key === 'w') keyR = false;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'a' || e.key === 's') keyL = false;
    updHold();
  }
  container.addEventListener('pointerdown', onPtrDown);
  container.addEventListener('pointermove', onPtrMove);
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
      container.removeEventListener('pointermove', onPtrMove);
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
