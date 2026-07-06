/* Bowling — 10 frames, full scoring, drag to place + flick to bowl (MG contract). */
(function () {
'use strict';
MG.register('bowling', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g, C = api.colors, RU = api.lang === 'ru', LOW = api.lowEnd;
  var TAU = Math.PI * 2;
  var CARD = 56;
  var PIN_OFF = [[0, 0], [-0.5, 1], [0.5, 1], [-1, 2], [0, 2], [1, 2], [-1.5, 3], [-0.5, 3], [0.5, 3], [1.5, 3]];

  var laneL, laneR, laneW, gutW, s, pinR, ballR, headY, rowH, startY, cx;
  var pins = [];
  var rolls = [], frame = 0, sub = 0, t10 = [];
  var ball = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, gutter: false };
  var state = 'aim'; // aim | roll | settle | over
  var settleT = 0, downBefore = 0, banner = null, started = false, hapticDone = false;
  var drag = null, rect = null, samples = [], dragBallX = 0;
  var raf = 0, last = 0, paused = false, endTO = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function layout() {
    cx = cv.W / 2;
    laneW = Math.min(cv.W * 0.72, 330);
    laneL = cx - laneW / 2; laneR = cx + laneW / 2;
    gutW = Math.max(12, laneW * 0.09);
    s = laneW / 3.46;
    pinR = s * 0.2;
    ballR = s * 0.33;
    headY = CARD + (cv.H - CARD) * 0.20;
    rowH = s * 0.87;
    startY = cv.H - Math.max(64, cv.H * 0.09);
    for (var i = 0; i < 10; i++) {
      var p = pins[i];
      if (!p) { p = pins[i] = { st: 2, ft: 0, rot: 0, rv: 0, vx: 0, vy: 0, x: 0, y: 0, bx: 0, by: 0 }; }
      p.bx = cx + PIN_OFF[i][0] * s;
      p.by = headY - PIN_OFF[i][1] * rowH;
      if (p.st === 2) { p.x = p.bx; p.y = p.by; }
    }
    if (state === 'aim') { ball.y = startY; ball.x = clamp(ball.x || cx, laneL + ballR, laneR - ballR); }
    rect = cv.canvas.getBoundingClientRect();
  }
  cv.onResize = layout;

  function resetPins() {
    for (var i = 0; i < 10; i++) {
      var p = pins[i];
      p.st = 2; p.ft = 0; p.rot = 0; p.rv = 0; p.vx = 0; p.vy = 0;
      p.x = p.bx; p.y = p.by;
    }
  }
  function hideFallen() {
    for (var i = 0; i < 10; i++) if (pins[i].st < 2) pins[i].st = 0;
  }
  function countDown() {
    var n = 0;
    for (var i = 0; i < 10; i++) if (pins[i].st < 2) n++;
    return n;
  }

  // ---- scoring (standard 10-pin rules) ----
  function calc(rolls) {
    var totals = [], cum = 0, prov = 0, i = 0;
    for (var f = 0; f < 10; f++) {
      var a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
      if (a == null) { totals[f] = null; continue; }
      if (f < 9) {
        if (a === 10) {
          prov += 10 + (b || 0) + (c || 0);
          if (b != null && c != null) { cum += 10 + b + c; totals[f] = cum; }
          else totals[f] = null;
          i += 1;
        } else if (b == null) {
          prov += a; totals[f] = null; i += 2;
        } else if (a + b === 10) {
          prov += 10 + (c || 0);
          if (c != null) { cum += 10 + c; totals[f] = cum; } else totals[f] = null;
          i += 2;
        } else {
          prov += a + b; cum += a + b; totals[f] = cum; i += 2;
        }
      } else {
        var need3 = a === 10 || (b != null && a + b === 10);
        prov += a + (b || 0) + (c || 0);
        if (b != null && (!need3 || c != null)) { cum += a + b + (c || 0); totals[f] = cum; }
        else totals[f] = null;
      }
    }
    return { totals: totals, total: cum, prov: prov };
  }

  function marks() {
    var m = [], i = 0;
    for (var f = 0; f < 9; f++) {
      var cell = [], a = rolls[i];
      if (a == null) { m.push(cell); i += 2; continue; }
      if (a === 10) { cell.push('X'); i += 1; }
      else {
        cell.push(a === 0 ? '–' : '' + a);
        var b = rolls[i + 1];
        if (b != null) cell.push(a + b === 10 ? '/' : (b === 0 ? '–' : '' + b));
        i += 2;
      }
      m.push(cell);
    }
    var cell10 = [], r0 = rolls[i], r1 = rolls[i + 1], r2 = rolls[i + 2];
    if (r0 != null) cell10.push(r0 === 10 ? 'X' : r0 === 0 ? '–' : '' + r0);
    if (r1 != null) {
      if (r0 !== 10 && r0 + r1 === 10) cell10.push('/');
      else cell10.push(r1 === 10 ? 'X' : r1 === 0 ? '–' : '' + r1);
    }
    if (r2 != null) {
      if (r0 === 10 && r1 !== 10 && r1 + r2 === 10) cell10.push('/');
      else cell10.push(r2 === 10 ? 'X' : r2 === 0 ? '–' : '' + r2);
    }
    m.push(cell10);
    return m;
  }

  function showBanner(kind) {
    banner = { t: 0, txt: kind === 'X' ? (RU ? 'СТРАЙК! 🎳' : 'STRIKE! 🎳') : (RU ? 'СПЭР!' : 'SPARE!') };
    api.haptic(kind === 'X' ? 'success' : 'medium');
  }

  function endRoll() {
    var down = countDown() - downBefore;
    rolls.push(down);
    var respot = false, over = false;
    if (frame < 9) {
      if (sub === 0) {
        if (down === 10) { showBanner('X'); frame++; respot = true; }
        else sub = 1;
      } else {
        if (countDown() === 10) showBanner('/');
        frame++; sub = 0; respot = true;
      }
    } else {
      t10.push(down);
      if (t10.length === 1) {
        if (down === 10) { showBanner('X'); respot = true; }
      } else if (t10.length === 2) {
        if (t10[0] === 10) {
          if (down === 10) { showBanner('X'); respot = true; }
          else if (countDown() === 10) { showBanner('/'); respot = true; }
        } else if (t10[0] + t10[1] === 10) { showBanner('/'); respot = true; }
        else over = true;
      } else {
        if (down === 10) showBanner('X');
        over = true;
      }
    }
    var res = calc(rolls);
    api.score(res.prov);
    if (over) {
      state = 'over';
      endTO = setTimeout(function () {
        api.gameOver(res.total, { win: res.total >= 100 });
      }, 1400);
      return;
    }
    if (respot) resetPins(); else hideFallen();
    ball.x = cx; ball.y = startY;
    ball.vx = ball.vy = ball.spin = 0;
    ball.gutter = false;
    state = 'aim';
  }

  function throwBall(vx, vy, spin) {
    ball.vx = vx; ball.vy = vy; ball.spin = spin;
    ball.gutter = false;
    downBefore = countDown();
    hapticDone = false;
    state = 'roll';
  }

  function updatePins(dt) {
    for (var i = 0; i < 10; i++) {
      var p = pins[i];
      if (p.st !== 1 || p.ft >= 1) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      var f = Math.pow(0.94, dt * 60);
      p.vx *= f; p.vy *= f;
      p.rot += p.rv * dt;
      p.ft += dt / 0.7;
      var sp2 = p.vx * p.vx + p.vy * p.vy;
      if (sp2 < 3600) continue;
      // pin-on-pin cascade
      for (var j = 0; j < 10; j++) {
        var q = pins[j];
        if (q.st !== 2) continue;
        var dx = q.x - p.x, dy = q.y - p.y;
        var rr = pinR * 2.1, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0) {
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          var ps = Math.sqrt(sp2);
          q.st = 1; q.ft = 0;
          q.vx = nx * ps * 0.65 + (Math.random() - 0.5) * 50;
          q.vy = ny * ps * 0.65;
          q.rv = (Math.random() - 0.5) * 14;
          p.vx *= 0.55; p.vy *= 0.55;
        }
      }
    }
  }

  function updateBall(dt) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vx += ball.spin * dt;
    if (!ball.gutter && (ball.x < laneL + ballR * 0.5 || ball.x > laneR - ballR * 0.5)) {
      ball.gutter = true;
      ball.x = ball.x < cx ? laneL - gutW / 2 : laneR + gutW / 2;
      ball.vx = 0; ball.spin = 0;
    }
    if (!ball.gutter) {
      for (var i = 0; i < 10; i++) {
        var p = pins[i];
        if (p.st !== 2) continue;
        var dx = p.x - ball.x, dy = p.y - ball.y;
        var rr = ballR + pinR, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 0) {
          var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
          var sp = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          p.st = 1; p.ft = 0;
          p.vx = nx * sp * 0.7 + ball.vx * 0.25 + (Math.random() - 0.5) * 80;
          p.vy = ny * sp * 0.7 + ball.vy * 0.2;
          p.rv = (Math.random() - 0.5) * 12;
          ball.vx = ball.vx * 0.9 - nx * sp * 0.08;
          ball.vy *= 0.94;
          if (!hapticDone) { api.haptic('light'); hapticDone = true; }
        }
      }
    }
    if (ball.y < CARD - ballR * 2 || -ball.vy < 60) {
      state = 'settle';
      settleT = 0;
    }
  }

  // ---- input ----
  function pt(e) { return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  function pd(e) {
    if (!started) { started = true; return; }
    if (state !== 'aim' || paused) return;
    var p = pt(e);
    drag = { x: p.x, y: p.y };
    dragBallX = ball.x;
    samples = [{ t: performance.now(), x: p.x, y: p.y }];
    e.preventDefault();
  }
  function pm(e) {
    if (!drag || state !== 'aim') return;
    var p = pt(e);
    ball.x = clamp(dragBallX + (p.x - drag.x), laneL + ballR, laneR - ballR);
    samples.push({ t: performance.now(), x: p.x, y: p.y });
    if (samples.length > 8) samples.shift();
    e.preventDefault();
  }
  function pu() {
    if (!drag) { return; }
    drag = null;
    if (state !== 'aim' || samples.length < 2) return;
    var now = performance.now();
    var a = samples[0];
    for (var i = 0; i < samples.length; i++) {
      if (now - samples[i].t < 130) { a = samples[i]; break; }
    }
    var b = samples[samples.length - 1];
    var dt = Math.max(16, b.t - a.t);
    var vyf = (b.y - a.y) / dt * 1000;
    var vxf = (b.x - a.x) / dt * 1000;
    if (vyf < -300) {
      var speed = clamp(-vyf * 1.3, 520, 1150);
      var spin = clamp(vxf * 0.55, -330, 330);
      throwBall(vxf * 0.12, -speed, spin);
    }
  }
  cv.canvas.style.touchAction = 'none';
  cv.canvas.addEventListener('pointerdown', pd);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu);
  window.addEventListener('pointercancel', pu);
  function onKey(e) {
    if (!started) { started = true; return; }
    if (state !== 'aim') return;
    if (e.key === 'ArrowLeft') { ball.x = clamp(ball.x - 12, laneL + ballR, laneR - ballR); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { ball.x = clamp(ball.x + 12, laneL + ballR, laneR - ballR); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'ArrowUp') { throwBall(0, -820, 0); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  // ---- drawing ----
  function drawCard() {
    g.fillStyle = C.panel;
    g.fillRect(0, 0, cv.W, CARD);
    var res = calc(rolls), mk = marks();
    var unit = (cv.W - 8) / 10.45;
    var x = 4;
    g.textBaseline = 'middle';
    for (var f = 0; f < 10; f++) {
      var w = f === 9 ? unit * 1.45 : unit;
      g.strokeStyle = f === frame && state !== 'over' ? C.accent : C.panel2;
      g.lineWidth = f === frame && state !== 'over' ? 1.5 : 1;
      g.strokeRect(x + 0.5, 4.5, w - 1, CARD - 9);
      var cell = mk[f];
      g.fillStyle = C.muted;
      g.font = '9px sans-serif';
      g.textAlign = 'center';
      var slots = f === 9 ? 3 : 2;
      for (var r = 0; r < cell.length; r++) {
        var sx = x + w - (slots - r) * (w / (slots + 0.4)) + w / (slots + 0.4) / 2;
        g.fillText(cell[r], sx, 13);
      }
      if (res.totals[f] != null) {
        g.fillStyle = C.text;
        g.font = 'bold 12px sans-serif';
        g.fillText(res.totals[f], x + w / 2, CARD - 16);
      }
      x += w;
    }
  }

  function drawPin(p) {
    if (p.st === 0 || (p.st === 1 && p.ft >= 1)) return;
    g.save();
    g.translate(p.x, p.y);
    if (p.st === 1) {
      g.rotate(p.rot);
      g.globalAlpha = Math.max(0, 1 - p.ft);
      g.scale(1, 1 + p.ft * 1.3);
    }
    g.fillStyle = C.text;
    g.beginPath(); g.arc(0, 0, pinR, 0, TAU); g.fill();
    g.strokeStyle = C.bad;
    g.lineWidth = pinR * 0.35;
    g.beginPath(); g.arc(0, 0, pinR * 0.58, 0, TAU); g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // gutters + lane
    g.fillStyle = C.panel2;
    g.fillRect(laneL - gutW, CARD, gutW, cv.H - CARD);
    g.fillRect(laneR, CARD, gutW, cv.H - CARD);
    g.fillStyle = C.panel;
    g.fillRect(laneL, CARD, laneW, cv.H - CARD);
    var i;
    if (!LOW) {
      g.strokeStyle = C.muted;
      g.globalAlpha = 0.15;
      g.lineWidth = 1;
      for (i = 1; i < 7; i++) {
        var bx = laneL + laneW / 7 * i;
        g.beginPath(); g.moveTo(bx, CARD); g.lineTo(bx, cv.H); g.stroke();
      }
      g.globalAlpha = 1;
    }
    // aiming arrows
    g.fillStyle = C.muted;
    g.globalAlpha = 0.5;
    var ay = CARD + (cv.H - CARD) * 0.55;
    for (i = -2; i <= 2; i++) {
      var axx = cx + i * s * 0.6, ayy = ay + Math.abs(i) * 14;
      g.beginPath();
      g.moveTo(axx, ayy - 7); g.lineTo(axx + 5, ayy + 4); g.lineTo(axx - 5, ayy + 4);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    // foul line
    g.strokeStyle = C.muted;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(laneL, startY + ballR + 10); g.lineTo(laneR, startY + ballR + 10); g.stroke();
    // pins
    for (i = 0; i < 10; i++) drawPin(pins[i]);
    // ball
    g.fillStyle = C.accent;
    g.beginPath(); g.arc(ball.x, ball.y, ballR, 0, TAU); g.fill();
    g.fillStyle = C.bg;
    g.beginPath(); g.arc(ball.x - ballR * 0.25, ball.y - ballR * 0.2, ballR * 0.09, 0, TAU); g.fill();
    g.beginPath(); g.arc(ball.x + ballR * 0.05, ball.y - ballR * 0.35, ballR * 0.09, 0, TAU); g.fill();
    g.beginPath(); g.arc(ball.x + ballR * 0.3, ball.y - ballR * 0.15, ballR * 0.09, 0, TAU); g.fill();
    // aim hint
    if (state === 'aim' && started) {
      g.setLineDash([4, 8]);
      g.strokeStyle = C.muted;
      g.globalAlpha = 0.5;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(ball.x, ball.y - ballR - 6); g.lineTo(ball.x, headY + s); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.fillStyle = C.muted;
      g.font = '12px sans-serif';
      g.textAlign = 'center';
      g.fillText(RU ? '↔ двигай · смахни вверх — бросок' : '↔ drag to place · flick up to bowl', cv.W / 2, cv.H - 12);
    }
    // banner
    if (banner) {
      banner.t += 0.016;
      if (banner.t > 1.2) banner = null;
      else {
        var bt = banner.t;
        g.globalAlpha = bt > 0.8 ? Math.max(0, 1 - (bt - 0.8) / 0.4) : 1;
        g.fillStyle = C.accent;
        g.font = 'bold ' + Math.round(34 + Math.max(0, 0.15 - bt) * 90) + 'px sans-serif';
        g.textAlign = 'center';
        g.fillText(banner.txt, cv.W / 2, cv.H * 0.45);
        g.globalAlpha = 1;
      }
    }
    // start overlay
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
    }
    drawCard();
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (state === 'roll') {
      updateBall(dt);
      updatePins(dt);
    } else if (state === 'settle') {
      updatePins(dt);
      settleT += dt;
      if (settleT > 1.0) endRoll();
    }
    draw();
  }

  layout();
  resetPins();
  ball.x = cx; ball.y = startY;
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      clearTimeout(endTO);
      cv.canvas.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
