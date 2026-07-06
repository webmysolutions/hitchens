/* Archery — draw, aim, mind the wind (MG game contract). */
(function () {
'use strict';
MG.register('archery', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var raf = 0, last = 0, paused = false, started = false, over = false;
  var ARROWS = 15, shotN = 0, score = 0, level = 0, moving = false;
  var groundY, ax, ay, R, tx, tyBase, ty, GR, VMAX, movPh = 0;
  var wind = 0, windAx = 0;
  var state = 'ready'; // ready | draw | fly
  var dr = null;       // {t,ang,pow,sx,sy}
  var arrow = null;    // {x,y,vx,vy,px}
  var stuck = [];      // {dy,rot,wob}
  var grounded = [];   // {x,y,rot}
  var flash = null, delayT = 0, tnow = 0;
  var RINGS = [0.18, 0.38, 0.58, 0.79, 1];
  var PTS = [10, 8, 6, 4, 2];

  function layout() {
    groundY = cv.H * 0.86;
    ax = cv.W * 0.14; ay = groundY - cv.H * 0.16;
    R = Math.min(cv.W, cv.H) * 0.11;
    GR = cv.H * 1.35;
    VMAX = cv.W * 1.55;
    setTarget();
  }
  cv.onResize = function () { layout(); };

  function setTarget() {
    var nl = Math.min(4, (shotN / 3) | 0);
    if (nl !== level) { level = nl; stuck.length = 0; }
    tx = cv.W * (0.5 + 0.105 * level);
    tyBase = groundY - R * 1.35;
    ty = tyBase;
    moving = shotN >= 9;
  }

  function newWind() {
    var wf = (Math.random() * 2 - 1) * (0.35 + 0.16 * level);
    wind = wf;
    windAx = wf * cv.W * 0.9;
  }

  function clampAng(a) { return a < -1.45 ? -1.45 : (a > 0.12 ? 0.12 : a); }

  function effAng() {
    var w = Math.min(1, Math.max(0, dr.t - 0.5) / 3);
    return dr.ang + w * 0.1 * (Math.sin(tnow * 8.3) + 0.6 * Math.sin(tnow * 13.7));
  }

  function release() {
    if (!dr) return;
    if (dr.pow < 0.12) { dr = null; state = 'ready'; return; }
    var a = effAng();
    var sp = (0.4 + 0.6 * dr.pow) * VMAX;
    arrow = {
      x: ax + Math.cos(a) * 26, y: ay + Math.sin(a) * 26,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp
    };
    dr = null; state = 'fly';
    api.haptic('light');
  }

  function endShot() {
    arrow = null;
    shotN++;
    state = 'ready';
    delayT = 0.9;
  }

  function afterDelay() {
    if (shotN >= ARROWS) {
      over = true;
      api.gameOver(score);
      return;
    }
    setTarget();
    newWind();
  }

  function update(dt) {
    tnow += dt;
    if (moving) {
      movPh += dt * (1.5 + 0.15 * level);
      ty = tyBase - R * 0.8 * (0.5 + 0.5 * Math.sin(movPh));
    } else ty = tyBase;
    if (delayT > 0) {
      delayT -= dt;
      if (delayT <= 0) afterDelay();
    }
    if (dr) {
      dr.t += dt;
      dr.pow = Math.min(1, dr.t / 1.1);
    }
    if (arrow) {
      var pxx = arrow.x, pyy = arrow.y;
      arrow.vx += windAx * dt;
      arrow.vy += GR * dt;
      arrow.x += arrow.vx * dt;
      arrow.y += arrow.vy * dt;
      var rot = Math.atan2(arrow.vy, arrow.vx);
      // target plane hit
      if (pxx < tx && arrow.x >= tx && arrow.vx > 0) {
        var f = (tx - pxx) / (arrow.x - pxx);
        var hy = pyy + (arrow.y - pyy) * f;
        var dy = hy - ty;
        if (Math.abs(dy) <= R) {
          var q = Math.abs(dy) / R, pts = 2, i;
          for (i = 0; i < 5; i++) if (q <= RINGS[i]) { pts = PTS[i]; break; }
          score += pts;
          api.score(score);
          if (pts === 10) {
            flash = { t: 1.1, txt: '🎯 ' + (RU ? 'ЯБЛОЧКО! +10' : 'BULLSEYE! +10'), col: C.accent, big: true };
            api.haptic('success');
          } else {
            flash = { t: 0.8, txt: '+' + pts, col: C.good };
            api.haptic('light');
          }
          if (stuck.length > 7) stuck.shift();
          stuck.push({ dy: dy, rot: rot, wob: 1 });
          endShot();
          return;
        }
      }
      if (arrow.y >= groundY) {
        if (grounded.length > 7) grounded.shift();
        grounded.push({ x: arrow.x, y: groundY, rot: rot });
        flash = { t: 0.8, txt: RU ? 'Мимо' : 'Miss', col: C.muted };
        endShot();
      } else if (arrow.x > cv.W + 60 || arrow.x < -60) {
        flash = { t: 0.8, txt: RU ? 'Мимо' : 'Miss', col: C.muted };
        endShot();
      }
    }
    for (var i = 0; i < stuck.length; i++) if (stuck[i].wob > 0) stuck[i].wob -= dt * 1.3;
    if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
  }

  function drawArrowShape(x, y, rot, ln) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.strokeStyle = C.text; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-ln, 0); g.lineTo(0, 0); g.stroke();
    g.fillStyle = C.text;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-6, -2.5); g.lineTo(-6, 2.5); g.closePath(); g.fill();
    g.strokeStyle = C.bad; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-ln, 0); g.lineTo(-ln - 4, -3.5);
    g.moveTo(-ln, 0); g.lineTo(-ln - 4, 3.5);
    g.moveTo(-ln + 4, 0); g.lineTo(-ln, -3.5);
    g.stroke();
    g.restore();
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // ground
    g.fillStyle = C.panel;
    g.fillRect(0, groundY, cv.W, cv.H - groundY);
    g.globalAlpha = 0.25;
    g.fillStyle = C.good;
    g.fillRect(0, groundY, cv.W, cv.H - groundY);
    g.globalAlpha = 1;
    g.strokeStyle = C.muted; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, groundY); g.lineTo(cv.W, groundY); g.stroke();
    // wind flag
    var fpx = cv.W * 0.5, fpy = groundY;
    g.strokeStyle = C.muted; g.lineWidth = 2;
    g.beginPath(); g.moveTo(fpx, fpy); g.lineTo(fpx, fpy - 46); g.stroke();
    var fl = wind * 60;
    g.fillStyle = C.accent;
    g.beginPath();
    g.moveTo(fpx, fpy - 46);
    g.lineTo(fpx + fl, fpy - 41 + Math.sin(tnow * 6) * 2);
    g.lineTo(fpx, fpy - 36);
    g.closePath(); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = C.muted; g.font = '12px sans-serif';
    g.fillText((RU ? 'ветер ' : 'wind ') + (wind < 0 ? '←' : '→') + ' ' + Math.round(Math.abs(wind) * 10), fpx, fpy - 58);
    // target stand
    g.strokeStyle = C.muted; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(tx - R * 0.5, groundY); g.lineTo(tx, ty + R * 0.6);
    g.moveTo(tx + R * 0.5, groundY); g.lineTo(tx, ty + R * 0.6);
    g.stroke();
    // target rings
    var cols = [C.text, C.panel2, C.good, C.bad, C.accent], i;
    for (i = 0; i < 5; i++) {
      g.fillStyle = cols[i];
      g.beginPath(); g.arc(tx, ty, R * RINGS[4 - i], 0, 6.284); g.fill();
    }
    g.strokeStyle = C.bg; g.lineWidth = 1; g.globalAlpha = 0.4;
    for (i = 0; i < 5; i++) { g.beginPath(); g.arc(tx, ty, R * RINGS[i], 0, 6.284); g.stroke(); }
    g.globalAlpha = 1;
    // stuck arrows (wobble)
    for (i = 0; i < stuck.length; i++) {
      var st = stuck[i];
      var wr = st.wob > 0 ? Math.sin(tnow * 22) * 0.22 * st.wob : 0;
      drawArrowShape(tx, ty + st.dy, st.rot + wr, R * 0.85);
    }
    for (i = 0; i < grounded.length; i++) drawArrowShape(grounded[i].x, grounded[i].y, grounded[i].rot, 22);
    // archer
    g.strokeStyle = C.text; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(ax - 6, groundY); g.lineTo(ax, ay + 16);
    g.moveTo(ax + 6, groundY); g.lineTo(ax, ay + 16);
    g.moveTo(ax, ay + 16); g.lineTo(ax, ay);
    g.stroke();
    g.fillStyle = C.text;
    g.beginPath(); g.arc(ax, ay - 9, 6, 0, 6.284); g.fill();
    // bow + aim
    var a = dr ? effAng() : -0.35;
    var pull = dr ? dr.pow * 10 : 0;
    g.save();
    g.translate(ax, ay);
    g.rotate(a);
    g.strokeStyle = C.accent; g.lineWidth = 3;
    g.beginPath(); g.arc(6, 0, 20, -1.25, 1.25); g.stroke();
    g.strokeStyle = C.muted; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(6 + Math.cos(-1.25) * 20, Math.sin(-1.25) * 20);
    g.lineTo(6 - pull, 0);
    g.lineTo(6 + Math.cos(1.25) * 20, Math.sin(1.25) * 20);
    g.stroke();
    g.restore();
    if (dr) {
      drawArrowShape(ax + Math.cos(a) * (26 - pull), ay + Math.sin(a) * (26 - pull), a, 24);
      g.globalAlpha = 0.5;
      g.strokeStyle = C.accent; g.lineWidth = 2;
      g.setLineDash([5, 6]);
      g.beginPath();
      g.moveTo(ax + Math.cos(a) * 30, ay + Math.sin(a) * 30);
      g.lineTo(ax + Math.cos(a) * (70 + dr.pow * 50), ay + Math.sin(a) * (70 + dr.pow * 50));
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
      // power meter
      var mh = cv.H * 0.28, mx = 10, my = cv.H * 0.5 - mh / 2;
      g.strokeStyle = C.muted; g.lineWidth = 1;
      g.strokeRect(mx, my, 10, mh);
      g.fillStyle = dr.pow >= 1 ? C.good : C.accent;
      g.fillRect(mx + 1, my + mh - mh * dr.pow + 1, 8, mh * dr.pow - 2);
    }
    // flying arrow
    if (arrow) drawArrowShape(arrow.x, arrow.y, Math.atan2(arrow.vy, arrow.vx), 24);
    // HUD
    g.textAlign = 'left';
    g.fillStyle = C.text; g.font = 'bold 14px sans-serif';
    g.fillText('🏹 ' + (ARROWS - shotN), 12, 20);
    g.textAlign = 'center';
    if (flash) {
      g.globalAlpha = Math.min(1, flash.t * 2);
      g.fillStyle = flash.col;
      g.font = flash.big ? 'bold 26px sans-serif' : 'bold 20px sans-serif';
      g.fillText(flash.txt, cv.W / 2, cv.H * 0.32);
      g.globalAlpha = 1;
    }
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Держи — натяжение, тяни — прицел, отпусти' : 'Hold to draw, drag to aim, release', cv.W / 2, cv.H / 2 + 26);
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
    if (state !== 'ready' || delayT > 0) return;
    var p = xy(e);
    state = 'draw';
    dr = { t: 0, pow: 0, ang: -0.35, sx: p.x, sy: p.y };
  }
  function onMove(e) {
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    if (state === 'draw' && dr) {
      var p = xy(e);
      var dxv = dr.sx - p.x, dyv = dr.sy - p.y;
      if (dxv * dxv + dyv * dyv > 196) {
        if (dxv < 20) dxv = 20;
        dr.ang = clampAng(Math.atan2(dyv, dxv));
      }
    }
  }
  function onUp() {
    dragging = false;
    if (state === 'draw') release();
  }
  var keyHeld = false;
  function onKey(e) {
    if (over) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!started) { started = true; return; }
      if (!keyHeld && state === 'ready' && delayT <= 0) {
        keyHeld = true;
        state = 'draw';
        dr = { t: 0, pow: 0, ang: -0.35, sx: 0, sy: 0 };
      }
    } else if (state === 'draw' && dr) {
      if (e.key === 'ArrowUp') { dr.ang = clampAng(dr.ang - 0.06); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { dr.ang = clampAng(dr.ang + 0.06); e.preventDefault(); }
    }
  }
  function onKeyUp(e) {
    if (e.key !== ' ') return;
    if (keyHeld && state === 'draw') release();
    keyHeld = false;
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
    if (started && !over) update(dt);
    else { tnow += dt; if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; } }
    draw();
  }

  layout();
  newWind();
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
