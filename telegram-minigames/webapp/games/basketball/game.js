/* Basketball — flick-shot hoops (MG game contract). */
(function () {
'use strict';
MG.register('basketball', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var raf = 0, last = 0, paused = false, started = false, over = false;
  var timeLeft = 45, score = 0, baskets = 0, streak = 0;
  var BR, GRAV, VMAX, ball = null, hoop = null, drag = null, flash = null;
  var trail = [], respawn = 0, tnow = 0;

  function layout() {
    BR = Math.max(12, Math.min(cv.W, cv.H) * 0.042);
    GRAV = cv.H * 3.0;
    VMAX = cv.H * 2.7;
    placeHoop(true);
    if (!ball || !ball.fly) restBall();
  }
  cv.onResize = function () { layout(); };

  function placeHoop(keep) {
    var bx, y;
    if (keep && hoop) {
      bx = Math.min(Math.max(hoop.bx, cv.W * 0.22), cv.W * 0.78);
      y = Math.min(Math.max(hoop.y, cv.H * 0.16), cv.H * 0.42);
    } else {
      bx = cv.W * (0.22 + Math.random() * 0.56);
      y = cv.H * (0.18 + Math.random() * 0.22);
    }
    hoop = {
      bx: bx, x: bx, y: y,
      rh: BR * 1.7, rr: BR * 0.28,
      move: baskets >= 5, ph: Math.random() * 6,
      spd: 1.3 + baskets * 0.07,
      amp: Math.max(0, Math.min(bx - cv.W * 0.13, cv.W * 0.87 - bx, cv.W * 0.2))
    };
  }

  function restBall() {
    ball = { x: cv.W / 2, y: cv.H - BR * 3.2, vx: 0, vy: 0, py: 0, fly: false, scored: false, rim: false };
  }

  function boardRect() {
    var bw = hoop.rh * 2.8, bh = BR * 3.0;
    return { x: hoop.x - bw / 2, y: hoop.y - BR * 1.1 - bh, w: bw, h: bh };
  }

  function collideRect(r) {
    var px = Math.max(r.x, Math.min(ball.x, r.x + r.w));
    var py = Math.max(r.y, Math.min(ball.y, r.y + r.h));
    var dx = ball.x - px, dy = ball.y - py, d2 = dx * dx + dy * dy;
    if (d2 >= BR * BR || d2 === 0) return;
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    ball.x = px + nx * BR; ball.y = py + ny * BR;
    var dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) { ball.vx -= 1.55 * dot * nx; ball.vy -= 1.55 * dot * ny; }
    ball.rim = true;
  }

  function collideCircle(cx, cy) {
    var dx = ball.x - cx, dy = ball.y - cy;
    var rr = BR + hoop.rr, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return;
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    ball.x = cx + nx * rr; ball.y = cy + ny * rr;
    var dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) { ball.vx -= 1.55 * dot * nx; ball.vy -= 1.55 * dot * ny; }
    ball.rim = true;
    api.haptic('light');
  }

  function shoot(vx, vy) {
    var sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > VMAX) { vx *= VMAX / sp; vy *= VMAX / sp; }
    ball.vx = vx; ball.vy = vy; ball.py = ball.y;
    ball.fly = true; ball.rim = false; ball.scored = false;
    api.haptic('light');
  }

  function update(dt) {
    tnow += dt;
    if (hoop.move) { hoop.ph += hoop.spd * dt; hoop.x = hoop.bx + Math.sin(hoop.ph) * hoop.amp; }
    else hoop.x = hoop.bx;

    if (started && !over) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0; over = true; drag = null;
        api.gameOver(score);
      }
    }
    if (respawn > 0) { respawn -= dt; if (respawn <= 0 && !ball) restBall(); }

    if (ball && ball.fly) {
      ball.py = ball.y;
      ball.vy += GRAV * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < BR) { ball.x = BR; ball.vx = -ball.vx * 0.6; }
      if (ball.x > cv.W - BR) { ball.x = cv.W - BR; ball.vx = -ball.vx * 0.6; }
      collideRect(boardRect());
      collideCircle(hoop.x - hoop.rh, hoop.y);
      collideCircle(hoop.x + hoop.rh, hoop.y);
      if (!ball.scored && ball.vy > 0 && ball.py <= hoop.y && ball.y > hoop.y &&
          Math.abs(ball.x - hoop.x) < hoop.rh - BR * 0.45) {
        ball.scored = true;
        var sw = !ball.rim, pts = sw ? 3 : 2;
        score += pts; baskets++; streak++;
        api.score(score);
        api.haptic(sw ? 'success' : 'medium');
        flash = { t: 1, txt: sw ? (RU ? 'ЧИСТО! +3' : 'SWISH! +3') : '+2', col: sw ? C.accent : C.good };
        placeHoop(false);
      }
      if (streak >= 3 && !api.lowEnd) {
        trail.push({ x: ball.x, y: ball.y, l: 1 });
        if (trail.length > 24) trail.shift();
      }
      if (ball.y - BR > cv.H) {
        if (!ball.scored) { streak = 0; trail.length = 0; }
        ball = null; respawn = 0.3;
      }
    }
    for (var i = trail.length - 1; i >= 0; i--) { trail[i].l -= dt * 2.2; if (trail[i].l <= 0) trail.splice(i, 1); }
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // floor
    g.fillStyle = C.panel2;
    g.fillRect(0, cv.H - BR * 1.4, cv.W, BR * 1.4);
    g.strokeStyle = C.muted; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, cv.H - BR * 1.4); g.lineTo(cv.W, cv.H - BR * 1.4); g.stroke();
    // backboard
    var r = boardRect();
    g.fillStyle = C.panel;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = C.muted; g.lineWidth = 2;
    g.strokeRect(r.x, r.y, r.w, r.h);
    g.strokeRect(r.x + r.w * 0.28, r.y + r.h * 0.35, r.w * 0.44, r.h * 0.55);
    // net
    g.globalAlpha = 0.35;
    g.strokeStyle = C.text; g.lineWidth = 1;
    g.beginPath();
    var k;
    for (k = 0; k < 5; k++) {
      var fx = hoop.x - hoop.rh + (2 * hoop.rh) * k / 4;
      g.moveTo(fx, hoop.y);
      g.lineTo(hoop.x + (fx - hoop.x) * 0.5, hoop.y + BR * 2.1);
    }
    g.stroke();
    g.globalAlpha = 1;
    // trail flames
    if (trail.length) {
      for (k = 0; k < trail.length; k++) {
        var tr = trail[k];
        g.globalAlpha = tr.l * 0.4;
        g.fillStyle = C.bad;
        g.beginPath(); g.arc(tr.x, tr.y, BR * (0.35 + 0.75 * tr.l), 0, 6.284); g.fill();
        g.globalAlpha = tr.l * 0.55;
        g.fillStyle = C.accent;
        g.beginPath(); g.arc(tr.x, tr.y, BR * (0.18 + 0.45 * tr.l), 0, 6.284); g.fill();
      }
      g.globalAlpha = 1;
    }
    // rim
    g.strokeStyle = C.bad; g.lineWidth = 4;
    g.beginPath(); g.moveTo(hoop.x - hoop.rh, hoop.y); g.lineTo(hoop.x + hoop.rh, hoop.y); g.stroke();
    g.fillStyle = C.bad;
    g.beginPath(); g.arc(hoop.x - hoop.rh, hoop.y, hoop.rr, 0, 6.284); g.fill();
    g.beginPath(); g.arc(hoop.x + hoop.rh, hoop.y, hoop.rr, 0, 6.284); g.fill();
    // aim line
    if (drag && ball && !ball.fly) {
      g.globalAlpha = 0.6;
      g.strokeStyle = C.accent; g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.moveTo(ball.x, ball.y);
      g.lineTo(ball.x + (drag.cx - drag.sx) * 1.6, ball.y + (drag.cy - drag.sy) * 1.6);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    // ball
    if (ball) {
      g.fillStyle = C.accent;
      g.beginPath(); g.arc(ball.x, ball.y, BR, 0, 6.284); g.fill();
      g.globalAlpha = 0.45;
      g.strokeStyle = C.bg; g.lineWidth = 1.5;
      g.beginPath(); g.arc(ball.x, ball.y, BR, 0, 6.284); g.stroke();
      g.beginPath(); g.moveTo(ball.x - BR, ball.y); g.lineTo(ball.x + BR, ball.y); g.stroke();
      g.beginPath(); g.moveTo(ball.x, ball.y - BR); g.lineTo(ball.x, ball.y + BR); g.stroke();
      g.beginPath(); g.arc(ball.x - BR * 1.4, ball.y, BR * 1.7, -0.55, 0.55); g.stroke();
      g.globalAlpha = 1;
    }
    // HUD
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = timeLeft <= 10 ? C.bad : C.text;
    g.font = 'bold 18px sans-serif';
    g.fillText('⏱ ' + Math.ceil(timeLeft), cv.W / 2, 22);
    if (streak >= 3) {
      g.fillStyle = C.accent;
      g.font = 'bold 14px sans-serif';
      g.fillText('🔥 ×' + streak, cv.W / 2, 44);
    }
    if (flash) {
      g.globalAlpha = Math.min(1, flash.t * 1.6);
      g.fillStyle = flash.col;
      g.font = 'bold 30px sans-serif';
      g.fillText(flash.txt, cv.W / 2, cv.H * 0.5 - (1 - flash.t) * 30);
      g.globalAlpha = 1;
    }
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Потяни от мяча и отпусти' : 'Drag from the ball, release to shoot', cv.W / 2, cv.H / 2 + 26);
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
    var p = xy(e);
    if (over) return;
    if (!started) { started = true; return; }
    if (ball && !ball.fly) {
      var dx = p.x - ball.x, dy = p.y - ball.y;
      if (dx * dx + dy * dy < BR * BR * 16) drag = { sx: p.x, sy: p.y, cx: p.x, cy: p.y };
    }
  }
  function onMove(e) {
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    if (drag) { var p = xy(e); drag.cx = p.x; drag.cy = p.y; }
  }
  function onUp() {
    dragging = false;
    if (!drag) return;
    var dx = drag.cx - drag.sx, dy = drag.cy - drag.sy;
    drag = null;
    if (over || !ball || ball.fly) return;
    if (dy > -14 || dx * dx + dy * dy < 324) return;
    shoot(dx * 7.5, dy * 7.5);
  }
  function onKey(e) {
    if (e.key !== ' ') return;
    e.preventDefault();
    if (over) return;
    if (!started) { started = true; return; }
    if (ball && !ball.fly) {
      var T = 0.85;
      var vx = (hoop.x - ball.x) / T + (Math.random() - 0.5) * 80;
      var vy = (hoop.y - ball.y - 0.5 * GRAV * T * T) / T + (Math.random() - 0.5) * 60;
      shoot(vx, vy);
    }
  }
  container.addEventListener('touchstart', onDown, { passive: false });
  container.addEventListener('touchmove', onMove, { passive: false });
  container.addEventListener('touchend', onUp);
  container.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (started && !over) update(dt);
    else { tnow += dt; if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; } }
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
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
