/* River Rush — vertical river slalom with gates, rocks and logs. */
(function () {
'use strict';
MG.register('boat', function (container, api) {
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
  var BANK = mix(C.good, C.bg, 0.6);
  var WAT1 = mix(C.accent, C.bg, 0.62);
  var WAT2 = mix(C.accent, C.bg, 0.54);
  var EDGE = mix(C.good, C.bg, 0.3);
  var ROCK = mix(C.text, C.bg, 0.6);
  var LOG = mix('#8a6136', C.bg, 0.2);
  var PXM = 20;

  // ---- river shape ----
  var A1 = Math.random() * 6, A2 = Math.random() * 6, A3 = Math.random() * 6;
  function cen(w) {
    var m = Math.min(1, w / 900); // straight start
    return cv.W * (0.5 + m * (0.17 * Math.sin(w * 0.0021 + A1) + 0.1 * Math.sin(w * 0.0009 + A2)));
  }
  function hw(w) {
    var base = 0.31 - Math.min(0.08, w * 0.000004);
    return cv.W * (base + 0.04 * Math.sin(w * 0.0014 + A3));
  }

  // ---- state ----
  var boatY, bx, bvx, bank2;
  var dist, spd, hearts, gatePts, invuln;
  var started = false, over = false, paused = false;
  var score = 0, shown = -1;
  var raf = 0, last = 0, accum = 0, STEP = 1 / 60;
  var flashT = 0, flashTx = '';

  // obstacles: t: 0 rock | 1 log | 2 gate
  var ON = 40;
  var obs = [];
  (function () {
    for (var i = 0; i < ON; i++) obs.push({ t: 0, w: 0, x: 0, vx: 0, gap: 0, done: false, miss: false, on: false });
  })();
  var nextW = 0, obCount = 0;

  var SPN = LOW ? 10 : 28;
  var spray = [];
  (function () { for (var i = 0; i < SPN; i++) spray.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }); })();
  function puff(x, y, n) {
    var k = 0;
    for (var i = 0; i < SPN && k < n; i++) {
      if (spray[i].life <= 0) {
        spray[i].x = x; spray[i].y = y;
        spray[i].vx = (Math.random() - 0.5) * 140;
        spray[i].vy = -30 - Math.random() * 90;
        spray[i].life = 0.55;
        k++;
      }
    }
  }

  var WKN = LOW ? 0 : 46;
  var wake = [], wkHead = 0;
  (function () { for (var i = 0; i < WKN; i++) wake.push({ x: 0, w: 0, life: 0 }); })();

  function reset() {
    boatY = cv.H * 0.78;
    bx = cv.W / 2; bvx = 0; bank2 = 0;
    dist = 0; spd = 150; hearts = 3; gatePts = 0; invuln = 0;
    started = false; over = false;
    nextW = 500; obCount = 0;
    var i;
    for (i = 0; i < ON; i++) obs[i].on = false;
    for (i = 0; i < SPN; i++) spray[i].life = 0;
    for (i = 0; i < WKN; i++) wake[i].life = 0;
    flashT = 0;
    score = 0; shown = 0; api.score(0);
  }
  cv.onResize = function () { boatY = cv.H * 0.78; };

  function spawn() {
    while (nextW < dist + cv.H + 160) {
      var slot = null, i;
      for (i = 0; i < ON; i++) if (!obs[i].on) { slot = obs[i]; break; }
      if (!slot) break;
      var c = cen(nextW), h = hw(nextW);
      slot.on = true; slot.w = nextW; slot.done = false; slot.miss = false;
      obCount++;
      if (obCount % 3 === 0) {
        slot.t = 2;
        slot.gap = Math.max(64, h * 0.6);
        slot.x = c + (Math.random() - 0.5) * (h * 2 - slot.gap - 50);
        slot.vx = 0;
      } else if (Math.random() < 0.5) {
        slot.t = 0;
        slot.x = c + (Math.random() - 0.5) * (h * 2 - 80);
        slot.vx = 0;
      } else {
        slot.t = 1;
        slot.x = c + (Math.random() - 0.5) * (h * 2 - 110);
        slot.vx = (Math.random() - 0.5) * 46;
      }
      nextW += 190 + Math.random() * 130;
    }
  }

  function hit(px2, py2) {
    if (invuln > 0 || over) return;
    hearts--;
    invuln = 1.8;
    api.haptic('error');
    puff(px2, py2, 8);
    var c = cen(dist);
    bvx = bx < c ? 240 : -240;
    if (hearts <= 0) {
      over = true;
      api.gameOver(score);
    }
  }

  var keyDir = 0, dragging = false, tx = 0;

  function step() {
    if (over) return;
    var dt = STEP, i;
    spd = Math.min(330, 150 + dist * 0.012);
    dist += spd * dt;

    // control with momentum
    if (dragging) bvx += (tx - bx) * 14 * dt * 22;
    else if (keyDir !== 0) bvx += keyDir * 1300 * dt;
    bvx *= Math.exp(-dt * (dragging ? 7 : 2.2));
    if (bvx > 460) bvx = 460;
    if (bvx < -460) bvx = -460;
    bx += bvx * dt;
    var tb = bvx / 460 * 0.45;
    bank2 += (tb - bank2) * Math.min(1, dt * 10);

    if (invuln > 0) invuln -= dt;

    // banks
    var c = cen(dist), h = hw(dist);
    if (bx - 13 < c - h + 4) { bx = c - h + 17; hit(bx - 14, boatY); if (bvx < 0) bvx = 80; }
    if (bx + 13 > c + h - 4) { bx = c + h - 17; hit(bx + 14, boatY); if (bvx > 0) bvx = -80; }

    spawn();

    // wake
    if (WKN && spd > 0) {
      var wp = wake[wkHead];
      wp.x = bx; wp.w = dist - 18; wp.life = 0.9;
      wkHead = (wkHead + 1) % WKN;
    }
    for (i = 0; i < WKN; i++) if (wake[i].life > 0) wake[i].life -= dt;

    // obstacles
    for (i = 0; i < ON; i++) {
      var o = obs[i];
      if (!o.on) continue;
      if (o.w < dist - 120) { o.on = false; continue; }
      var dy = o.w - dist; // >0 above boat
      if (o.t === 1) {
        o.x += o.vx * dt;
        o.w -= 26 * dt; // logs drift with current toward boat
        var cc = cen(o.w), hh = hw(o.w);
        if (o.x < cc - hh + 40 || o.x > cc + hh - 40) o.vx = -o.vx;
      }
      if (o.t === 2) {
        if (!o.done && dy < 0) {
          o.done = true;
          if (Math.abs(bx - o.x) < o.gap / 2 - 8) {
            gatePts += 15;
            flashT = 0.9; flashTx = '+15';
            api.haptic('light');
          }
        }
        // hitting a buoy hurts nothing (miss = nothing)
        continue;
      }
      var rw = o.t === 0 ? 17 : 34;
      var rh = o.t === 0 ? 17 : 12;
      if (Math.abs(dy) < rh + 17 && Math.abs(bx - o.x) < rw + 11) {
        hit((bx + o.x) / 2, boatY - dy);
        o.on = false;
        continue;
      }
      // near-miss spray
      if (!o.miss && dy < 22 && dy > -22 && Math.abs(bx - o.x) < rw + 34) {
        o.miss = true;
        puff(bx + (o.x > bx ? 12 : -12), boatY, 3);
      }
    }

    for (i = 0; i < SPN; i++) {
      var sp = spray[i];
      if (sp.life > 0) { sp.life -= dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.vy += 260 * dt; }
    }
    if (flashT > 0) flashT -= dt;

    var sc = ((dist / PXM) | 0) + gatePts;
    if (sc !== shown) { score = sc; api.score(sc); shown = sc; }
  }

  function sy(w) { return boatY - (w - dist); }

  function draw() {
    var i, y;
    g.fillStyle = BANK;
    g.fillRect(0, 0, cv.W, cv.H);

    // river polygon
    g.beginPath();
    var w0 = dist + boatY;
    g.moveTo(cen(w0) - hw(w0), 0);
    for (y = 0; y <= cv.H + 16; y += 16) {
      var w = dist + (boatY - y);
      g.lineTo(cen(w) - hw(w), y);
    }
    for (y = cv.H + 16; y >= 0; y -= 16) {
      var w2 = dist + (boatY - y);
      g.lineTo(cen(w2) + hw(w2), y);
    }
    g.closePath();
    g.fillStyle = WAT1;
    g.fill();
    g.save();
    g.clip();
    // two-tone wave stripes (move with current)
    g.fillStyle = WAT2;
    var off = (dist + boatY) % 88;
    for (y = off - 88; y < cv.H; y += 88) g.fillRect(0, y, cv.W, 40);
    // wake trail
    if (WKN) {
      for (i = 0; i < WKN; i++) {
        var wp = wake[i];
        if (wp.life > 0) {
          var wy = sy(wp.w);
          var age = 0.9 - wp.life;
          g.globalAlpha = wp.life * 0.28;
          g.fillStyle = C.text;
          g.fillRect(wp.x - 8 - age * 16, wy, 5, 3);
          g.fillRect(wp.x + 3 + age * 16, wy, 5, 3);
        }
      }
      g.globalAlpha = 1;
    }
    g.restore();
    // bank edges
    g.strokeStyle = EDGE; g.lineWidth = 3;
    g.beginPath();
    for (y = 0; y <= cv.H + 16; y += 16) {
      var w3 = dist + (boatY - y), lx = cen(w3) - hw(w3);
      if (y === 0) g.moveTo(lx, y); else g.lineTo(lx, y);
    }
    g.stroke();
    g.beginPath();
    for (y = 0; y <= cv.H + 16; y += 16) {
      var w4 = dist + (boatY - y), rx = cen(w4) + hw(w4);
      if (y === 0) g.moveTo(rx, y); else g.lineTo(rx, y);
    }
    g.stroke();

    // obstacles
    for (i = 0; i < ON; i++) {
      var o = obs[i];
      if (!o.on) continue;
      var oy = sy(o.w);
      if (oy < -30 || oy > cv.H + 30) continue;
      if (o.t === 0) {
        g.fillStyle = ROCK;
        g.beginPath();
        g.ellipse(o.x, oy, 17, 13, 0.3, 0, 6.283);
        g.fill();
        g.fillStyle = mix(ROCK, C.text, 0.3);
        g.beginPath();
        g.ellipse(o.x - 4, oy - 4, 7, 5, 0.3, 0, 6.283);
        g.fill();
      } else if (o.t === 1) {
        g.fillStyle = LOG;
        g.fillRect(o.x - 34, oy - 9, 68, 18);
        g.fillStyle = mix(LOG, C.text, 0.25);
        g.beginPath(); g.arc(o.x - 34, oy, 9, 0, 6.283); g.fill();
        g.beginPath(); g.arc(o.x + 34, oy, 9, 0, 6.283); g.fill();
        g.strokeStyle = mix(LOG, C.bg, 0.3); g.lineWidth = 1;
        g.beginPath();
        g.moveTo(o.x - 26, oy - 3); g.lineTo(o.x + 26, oy - 3);
        g.moveTo(o.x - 26, oy + 4); g.lineTo(o.x + 26, oy + 4);
        g.stroke();
      } else {
        var col = o.done ? C.good : C.bad;
        var k;
        for (k = -1; k <= 1; k += 2) {
          var bxp = o.x + k * o.gap / 2;
          g.fillStyle = col;
          g.beginPath(); g.arc(bxp, oy, 8, 0, 6.283); g.fill();
          g.fillStyle = C.text;
          g.fillRect(bxp - 6, oy - 2, 12, 3);
        }
      }
    }

    // boat
    var blink = invuln > 0 && ((invuln * 10) | 0) % 2 === 0;
    if (!blink) {
      g.save();
      g.translate(bx, boatY);
      g.rotate(bank2);
      g.fillStyle = C.accent;
      g.beginPath();
      g.moveTo(0, -19);
      g.quadraticCurveTo(12, -8, 11, 10);
      g.quadraticCurveTo(6, 16, 0, 16);
      g.quadraticCurveTo(-6, 16, -11, 10);
      g.quadraticCurveTo(-12, -8, 0, -19);
      g.fill();
      g.fillStyle = mix(C.accent, C.bg, 0.4);
      g.fillRect(-6, -4, 12, 12);
      g.fillStyle = C.text;
      g.fillRect(-4, -9, 8, 4);
      g.restore();
    }

    // spray
    g.fillStyle = C.text;
    for (i = 0; i < SPN; i++) {
      var sp = spray[i];
      if (sp.life > 0) {
        g.globalAlpha = sp.life * 1.4;
        g.fillRect(sp.x - 1.5, sp.y - 1.5, 3, 3);
      }
    }
    g.globalAlpha = 1;

    // hearts
    g.font = '18px sans-serif';
    g.textAlign = 'right'; g.textBaseline = 'top';
    for (i = 0; i < 3; i++) {
      g.fillStyle = i < hearts ? C.bad : C.muted;
      g.globalAlpha = i < hearts ? 1 : 0.35;
      g.fillText('♥', cv.W - 10 - i * 20, 10);
    }
    g.globalAlpha = 1;

    // gate flash
    if (flashT > 0) {
      g.globalAlpha = Math.min(1, flashT * 1.5);
      g.font = 'bold 20px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.good;
      g.fillText(flashTx, bx, boatY - 44);
      g.globalAlpha = 1;
    }

    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2 - 14);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Веди лодку пальцем, проходи ворота' : 'Drag to steer, pass the gates', cv.W / 2, cv.H / 2 + 14);
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
  var ptrId = -1;
  function px(e) { return e.clientX - container.getBoundingClientRect().left; }
  function onPtrDown(e) {
    started = true;
    ptrId = e.pointerId;
    dragging = true;
    tx = px(e);
    e.preventDefault();
  }
  function onPtrMove(e) {
    if (e.pointerId === ptrId && dragging) tx = px(e);
  }
  function onPtrUp(e) {
    if (e.pointerId === ptrId) { dragging = false; ptrId = -1; }
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { keyDir = -1; started = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keyDir = 1; started = true; e.preventDefault(); }
    else if (e.key === ' ') { started = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if ((e.key === 'ArrowLeft' || e.key === 'a') && keyDir === -1) keyDir = 0;
    else if ((e.key === 'ArrowRight' || e.key === 'd') && keyDir === 1) keyDir = 0;
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
