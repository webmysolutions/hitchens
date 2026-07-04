/* Penalty Kicks — 10 shots vs an adaptive keeper (MG game contract). */
(function () {
'use strict';
MG.register('penalty', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var raf = 0, last = 0, paused = false, started = false, over = false;
  var KICKS = 10, kick = 0, goals = 0, score = 0;
  var results = [];           // 'g' goal, 't' top corner, 's' saved, 'm' wide
  var hist = [];              // shot columns 0/1/2 for keeper AI
  var gx, gy, gw, gh, bx, by, BRad;
  var state = 'ready';        // ready | hold | flight | result | done
  var hold = null, shot = null;
  var ripples = [], flash = null, resT = 0, tnow = 0;

  function layout() {
    gw = cv.W * 0.8; gx = (cv.W - gw) / 2;
    gh = Math.min(cv.H * 0.3, gw * 0.5);
    gy = cv.H * 0.13;
    BRad = Math.max(10, Math.min(cv.W, cv.H) * 0.035);
    bx = cv.W / 2; by = cv.H - Math.max(60, cv.H * 0.12);
  }
  cv.onResize = function () { layout(); };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function swayOff(t) {
    var amp = Math.min(1, t / 2.5) * gw * 0.085;
    return { x: Math.sin(tnow * 3.3) * amp, y: Math.sin(tnow * 2.1 + 1.7) * amp * 0.7 };
  }

  function decide(T) {
    var w = [1, 1, 1], i;
    var s0 = Math.max(0, hist.length - 5);
    for (i = s0; i < hist.length; i++) w[hist[i]] += 0.8 + (i - s0) * 0.18;
    var col;
    if (Math.random() < 0.22) col = (Math.random() * 3) | 0;
    else {
      var tot = w[0] + w[1] + w[2], r = Math.random() * tot;
      col = r < w[0] ? 0 : (r < w[0] + w[1] ? 1 : 2);
    }
    var speed = gw * (0.55 + 0.22 * Math.floor(goals / 5));
    var cx = gx + gw / 2;
    var destx = gx + gw * (col === 0 ? 0.13 : col === 1 ? 0.5 : 0.87);
    var reach = Math.min(Math.abs(destx - cx), speed * T);
    return {
      col: col,
      x0: cx,
      kx: cx + (destx < cx ? -reach : reach),
      handY: gy + gh * (0.2 + Math.random() * 0.55)
    };
  }

  function shootAt(tx, ty, pow) {
    tx = clamp(tx, gx - gw * 0.14, gx + gw * 1.14);
    ty = clamp(ty, gy - gh * 0.3, gy + gh);
    var col = tx < gx + gw / 3 ? 0 : (tx < gx + gw * 2 / 3 ? 1 : 2);
    hist.push(col);
    var T = 0.95 - 0.6 * pow;
    var k = decide(T);
    var dx = tx - bx, dy = ty - by;
    shot = {
      sx: bx, sy: by, tx: tx, ty: ty, T: T, t: 0,
      arc: Math.sqrt(dx * dx + dy * dy) * 0.1,
      k0: k.x0, kx: k.kx, khy: k.handY
    };
    state = 'flight';
    api.haptic('light');
  }

  function resolve() {
    var s = shot, res;
    var inGoal = s.tx > gx + 5 && s.tx < gx + gw - 5 && s.ty > gy + 5 && s.ty < gy + gh - 3;
    if (!inGoal) {
      res = 'm'; flash = { txt: RU ? 'МИМО!' : 'WIDE!', col: C.bad };
      api.haptic('error');
    } else if (Math.sqrt((s.tx - s.kx) * (s.tx - s.kx) + (s.ty - s.khy) * (s.ty - s.khy)) < gh * 0.28) {
      res = 's'; flash = { txt: RU ? 'СЕЙВ!' : 'SAVED!', col: C.bad };
      api.haptic('error');
    } else {
      var top = s.ty < gy + gh * 0.38 && (s.tx < gx + gw * 0.25 || s.tx > gx + gw * 0.75);
      score += top ? 15 : 10; goals++;
      api.score(score);
      res = top ? 't' : 'g';
      flash = { txt: top ? (RU ? 'ДЕВЯТКА! +15' : 'TOP CORNER! +15') : (RU ? 'ГОЛ! +10' : 'GOAL! +10'), col: top ? C.accent : C.good };
      api.haptic(top ? 'success' : 'medium');
      if (!api.lowEnd) ripples.push({ x: s.tx, y: s.ty, t: 0 });
    }
    results.push(res);
    state = 'result'; resT = 1.15;
  }

  function next() {
    kick++;
    flash = null;
    if (kick >= KICKS) {
      state = 'done'; over = true;
      api.gameOver(score, { win: goals >= 6 });
    } else {
      state = 'ready'; shot = null;
    }
  }

  function update(dt) {
    tnow += dt;
    if (hold) {
      hold.t += dt;
      hold.hist.push({ t: tnow, y: hold.y });
      if (hold.hist.length > 40) hold.hist.shift();
    }
    if (state === 'flight' && shot) {
      shot.t += dt;
      if (shot.t >= shot.T) { shot.t = shot.T; resolve(); }
    } else if (state === 'result') {
      resT -= dt;
      if (resT <= 0) next();
    }
    for (var i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt * 1.8;
      if (ripples[i].t >= 1) ripples.splice(i, 1);
    }
  }

  function drawKeeper() {
    var cx = gx + gw / 2, x = cx, lean = 0, f = 0;
    if (state === 'flight' || state === 'result') {
      f = state === 'result' ? 1 : shot.t / shot.T;
      x = shot.k0 + (shot.kx - shot.k0) * f;
      lean = (x - cx) / (gw * 0.4) * 0.9;
    } else {
      x = cx + Math.sin(tnow * 1.2) * gw * 0.04;
    }
    var kh = gh * 0.62;
    g.save();
    g.translate(x, gy + gh);
    g.rotate(lean);
    // legs
    g.strokeStyle = C.text; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, -kh * 0.42); g.lineTo(-kh * 0.14, 0);
    g.moveTo(0, -kh * 0.42); g.lineTo(kh * 0.14, 0);
    g.stroke();
    // body
    g.fillStyle = C.bad;
    g.fillRect(-kh * 0.14, -kh * 0.78, kh * 0.28, kh * 0.4);
    // arms (spread up when diving)
    var up = 0.55 + Math.abs(lean) * 0.5;
    g.strokeStyle = C.bad; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, -kh * 0.72); g.lineTo(-kh * 0.3, -kh * (0.72 + up * 0.35));
    g.moveTo(0, -kh * 0.72); g.lineTo(kh * 0.3, -kh * (0.72 + up * 0.35));
    g.stroke();
    // gloves
    g.fillStyle = C.accent;
    g.beginPath(); g.arc(-kh * 0.3, -kh * (0.72 + up * 0.35), 3.5, 0, 6.284); g.fill();
    g.beginPath(); g.arc(kh * 0.3, -kh * (0.72 + up * 0.35), 3.5, 0, 6.284); g.fill();
    // head
    g.fillStyle = C.text;
    g.beginPath(); g.arc(0, -kh * 0.88, kh * 0.11, 0, 6.284); g.fill();
    g.restore();
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // pitch
    var hz = gy + gh;
    g.fillStyle = C.panel;
    g.fillRect(0, hz, cv.W, cv.H - hz);
    g.globalAlpha = 0.25;
    g.fillStyle = C.good;
    g.fillRect(0, hz, cv.W, cv.H - hz);
    g.globalAlpha = 0.12;
    for (var s = 0; s < 5; s++) {
      g.fillStyle = s % 2 ? C.good : C.panel2;
      var sy = hz + (cv.H - hz) * s / 5;
      g.fillRect(0, sy, cv.W, (cv.H - hz) / 5);
    }
    g.globalAlpha = 1;
    // penalty spot
    g.fillStyle = C.muted;
    g.beginPath(); g.arc(bx, by + BRad + 4, 3, 0, 6.284); g.fill();
    // net
    g.globalAlpha = 0.22;
    g.strokeStyle = C.text; g.lineWidth = 1;
    g.beginPath();
    var i;
    for (i = 0; i <= 12; i++) { var nx = gx + gw * i / 12; g.moveTo(nx, gy); g.lineTo(nx, gy + gh); }
    for (i = 0; i <= 6; i++) { var ny = gy + gh * i / 6; g.moveTo(gx, ny); g.lineTo(gx + gw, ny); }
    g.stroke();
    g.globalAlpha = 1;
    // net ripples
    for (i = 0; i < ripples.length; i++) {
      var rp = ripples[i];
      g.globalAlpha = 0.6 * (1 - rp.t);
      g.strokeStyle = C.text; g.lineWidth = 1.5;
      g.beginPath(); g.arc(rp.x, rp.y, 4 + rp.t * gh * 0.7, 0, 6.284); g.stroke();
      g.beginPath(); g.arc(rp.x, rp.y, 2 + rp.t * gh * 0.4, 0, 6.284); g.stroke();
      g.globalAlpha = 1;
    }
    // goal frame
    g.strokeStyle = C.text; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(gx, gy + gh); g.lineTo(gx, gy); g.lineTo(gx + gw, gy); g.lineTo(gx + gw, gy + gh);
    g.stroke();
    g.lineCap = 'butt';
    drawKeeper();
    // ball
    var bxx = bx, byy = by, br = BRad;
    if ((state === 'flight' || state === 'result') && shot) {
      var f = state === 'result' ? 1 : shot.t / shot.T;
      bxx = shot.sx + (shot.tx - shot.sx) * f;
      byy = shot.sy + (shot.ty - shot.sy) * f - Math.sin(Math.PI * f) * shot.arc;
      br = BRad * (1 - 0.45 * f);
    }
    g.fillStyle = C.text;
    g.beginPath(); g.arc(bxx, byy, br, 0, 6.284); g.fill();
    g.globalAlpha = 0.5;
    g.strokeStyle = C.bg; g.lineWidth = 1.5;
    g.beginPath(); g.arc(bxx, byy, br, 0, 6.284); g.stroke();
    g.beginPath(); g.arc(bxx, byy, br * 0.45, 0, 6.284); g.stroke();
    g.globalAlpha = 1;
    // reticle
    if (state === 'hold' && hold) {
      var so = swayOff(hold.t);
      var rx = clamp(hold.x + so.x, gx - gw * 0.14, gx + gw * 1.14);
      var ry = clamp(hold.y + so.y, gy - gh * 0.3, gy + gh);
      g.strokeStyle = C.accent; g.lineWidth = 2;
      g.beginPath(); g.arc(rx, ry, 14, 0, 6.284); g.stroke();
      g.beginPath();
      g.moveTo(rx - 20, ry); g.lineTo(rx - 8, ry);
      g.moveTo(rx + 8, ry); g.lineTo(rx + 20, ry);
      g.moveTo(rx, ry - 20); g.lineTo(rx, ry - 8);
      g.moveTo(rx, ry + 8); g.lineTo(rx, ry + 20);
      g.stroke();
      g.fillStyle = C.accent;
      g.beginPath(); g.arc(rx, ry, 2.5, 0, 6.284); g.fill();
    }
    // kick dots
    var dw = 16, dx0 = cv.W / 2 - (KICKS - 1) * dw / 2;
    for (i = 0; i < KICKS; i++) {
      var rr = results[i];
      g.fillStyle = rr === 't' ? C.accent : rr === 'g' ? C.good : rr ? C.bad : C.muted;
      g.globalAlpha = rr ? 1 : 0.4;
      g.beginPath(); g.arc(dx0 + i * dw, 16, 5, 0, 6.284); g.fill();
    }
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = C.text; g.font = 'bold 14px sans-serif';
    g.fillText('⚽ ' + goals + '/' + KICKS, cv.W / 2, 36);
    // hint
    if (state === 'ready' && started && !over) {
      g.fillStyle = C.muted; g.font = '13px sans-serif';
      g.fillText(RU ? 'Держи и целься, резкий свайп вверх — удар' : 'Hold to aim, flick up to shoot', cv.W / 2, by + BRad * 3.2);
    }
    if (flash) {
      g.fillStyle = flash.col;
      g.font = 'bold 28px sans-serif';
      g.fillText(flash.txt, cv.W / 2, cv.H * 0.55);
    }
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
    }
  }

  // input
  function xy(e) {
    var rc = container.getBoundingClientRect();
    var p = e.changedTouches ? e.changedTouches[0] : e;
    return { x: p.clientX - rc.left, y: p.clientY - rc.top };
  }
  var dragging = false;
  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    dragging = true;
    if (over) return;
    if (!started) { started = true; return; }
    if (state !== 'ready') return;
    var p = xy(e);
    state = 'hold';
    hold = { x: p.x, y: p.y, t: 0, hist: [{ t: tnow, y: p.y }] };
  }
  function onMove(e) {
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    if (state === 'hold' && hold) {
      var p = xy(e);
      hold.x = p.x; hold.y = p.y;
      hold.hist.push({ t: tnow, y: p.y });
      if (hold.hist.length > 40) hold.hist.shift();
    }
  }
  function onUp() {
    dragging = false;
    if (state !== 'hold' || !hold) return;
    var h = hold; hold = null;
    // vertical flick velocity over last ~90ms
    var vy = 0, n = h.hist.length, t0 = tnow - 0.09, i;
    for (i = 0; i < n; i++) {
      if (h.hist[i].t >= t0) {
        var a = h.hist[i], b = h.hist[n - 1];
        if (b.t > a.t) vy = (b.y - a.y) / (b.t - a.t);
        break;
      }
    }
    var pow = clamp(-vy / 1300, 0.25, 1);
    var so = swayOff(h.t);
    shootAt(h.x + so.x, h.y + so.y, pow);
  }
  var keyHeld = false;
  function onKey(e) {
    if (over) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!started) { started = true; return; }
      if (!keyHeld && state === 'ready') {
        keyHeld = true;
        state = 'hold';
        hold = { x: gx + gw / 2, y: gy + gh / 2, t: 0, hist: [{ t: tnow, y: 0 }] };
      }
    } else if (state === 'hold' && hold) {
      var st = gw * 0.06;
      if (e.key === 'ArrowLeft') { hold.x -= st; e.preventDefault(); }
      else if (e.key === 'ArrowRight') { hold.x += st; e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hold.y -= st; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { hold.y += st; e.preventDefault(); }
    }
  }
  function onKeyUp(e) {
    if (e.key !== ' ') return;
    if (keyHeld && state === 'hold' && hold) {
      var h = hold; hold = null; keyHeld = false;
      var so = swayOff(h.t);
      shootAt(h.x + so.x, h.y + so.y, 0.85);
    } else keyHeld = false;
  }
  container.addEventListener('touchstart', onDown, { passive: false });
  container.addEventListener('touchmove', onMove, { passive: false });
  container.addEventListener('touchend', onUp);
  container.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!over) update(dt); else tnow += dt;
    draw();
  }

  layout();
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('touchstart', onDown);
      container.removeEventListener('touchmove', onMove);
      container.removeEventListener('touchend', onUp);
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
