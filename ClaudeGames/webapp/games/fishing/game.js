/* Deep Fishing — 90-second fishing round. MG contract game. */
(function () {
'use strict';
MG.register('fishing', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var ROUND = 90000;
  var raf = 0, lastT = 0, paused = false, over = false, started = false;
  var timeLeft = ROUND, score = 0, tms = 0;

  var waterY, botY, boatX, grad;
  var LN = 7, laneYs = [];
  function layout() {
    waterY = Math.max(64, cv.H * 0.16);
    botY = cv.H - 18;
    boatX = cv.W / 2;
    laneYs.length = 0;
    var top = waterY + 34, span = botY - top - 8, i;
    for (i = 0; i < LN; i++) laneYs.push(top + span * (i + 0.5) / LN);
    grad = g.createLinearGradient(0, waterY, 0, cv.H);
    grad.addColorStop(0, C.panel);
    grad.addColorStop(1, C.panel2);
  }
  cv.onResize = function () { layout(); };

  // kinds: 0 small fish, 1 medium, 2 shark, 3 junk boot, 4 jellyfish
  var VAL = [5, 15, 40, -10, 0];
  var EMO = ['🐟', '🐠', '🦈', '🥾', '🪼'];
  var SZ = [15, 19, 28, 17, 17];
  var MAXE = api.lowEnd ? 12 : 20;
  var ents = [], i;
  for (i = 0; i < MAXE; i++) ents.push({ on: false, x: 0, y: 0, vx: 0, k: 0, ly: 0, ph: 0 });

  function spawn() {
    var e = null, j;
    for (j = 0; j < MAXE; j++) if (!ents[j].on) { e = ents[j]; break; }
    if (!e) return;
    var lane = (Math.random() * LN) | 0, d = lane / (LN - 1), r = Math.random();
    if (r < 0.13) e.k = 3;
    else if (r < 0.25) e.k = 4;
    else if (d > 0.66) e.k = Math.random() < 0.55 ? 2 : 1; // deep = worth more
    else if (d > 0.33) e.k = Math.random() < 0.6 ? 1 : 0;
    else e.k = 0;
    e.ly = laneYs[lane]; e.y = e.ly;
    var sp = (0.02 + Math.random() * 0.03) * (e.k === 2 ? 1.35 : e.k === 4 ? 0.5 : 1);
    var fl = Math.random() < 0.5;
    e.vx = fl ? sp : -sp;
    e.x = fl ? -34 : cv.W + 34;
    e.ph = Math.random() * 6.28;
    e.on = true;
  }

  // hook state machine
  var METER = 0, DROP = 1, SINK = 2, REEL = 3, SNAG = 4;
  var st = METER, meter = 0, mdir = 1;
  var hx = 0, hy = 0, tgx = 0, tdepth = 0;
  var ck = -1, snagT = 0, spawnAcc = 0, dn = false;
  var keys = { l: false, r: false };

  function cast() {
    tdepth = waterY + 46 + meter * (botY - waterY - 66);
    hx = boatX; tgx = boatX; hy = waterY + 4;
    st = DROP; ck = -1;
    api.haptic('light');
  }
  function land() {
    if (ck >= 0) {
      score = Math.max(0, score + VAL[ck]);
      api.score(score);
      api.haptic(VAL[ck] >= 40 ? 'success' : VAL[ck] > 0 ? 'light' : 'error');
    }
    ck = -1;
    st = METER; meter = 0; mdir = 1;
  }
  function steer(dt) {
    if (keys.l) tgx -= 0.25 * dt;
    if (keys.r) tgx += 0.25 * dt;
    tgx = Math.max(12, Math.min(cv.W - 12, tgx));
    hx += (tgx - hx) * Math.min(1, dt * 0.012);
  }
  function checkCatch() {
    for (var j = 0; j < MAXE; j++) {
      var e = ents[j];
      if (!e.on) continue;
      var r = SZ[e.k] * 0.75 + 7;
      if (Math.abs(e.x - hx) < r && Math.abs(e.y - hy) < r) {
        e.on = false;
        if (e.k === 4) { st = SNAG; snagT = 2000; api.haptic('error'); }
        else { ck = e.k; st = REEL; api.haptic(e.k === 3 ? 'error' : 'medium'); }
        return;
      }
    }
  }

  function update(dt) {
    tms += dt;
    if (!started || over) return;
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0; over = true;
      api.haptic('medium');
      api.gameOver(score);
      return;
    }
    spawnAcc += dt;
    if (spawnAcc > (api.lowEnd ? 950 : 650)) { spawnAcc = 0; spawn(); }
    for (var j = 0; j < MAXE; j++) {
      var e = ents[j];
      if (!e.on) continue;
      e.x += e.vx * dt;
      e.y = e.ly + Math.sin(e.ph + tms * 0.002) * 4;
      if (e.x < -40 || e.x > cv.W + 40) e.on = false;
    }
    if (st === METER) {
      meter += mdir * dt * 0.0013;
      if (meter > 1) { meter = 1; mdir = -1; }
      else if (meter < 0) { meter = 0; mdir = 1; }
    } else if (st === DROP) {
      hy += 0.55 * dt;
      steer(dt);
      checkCatch();
      if (hy >= tdepth) { hy = tdepth; st = SINK; }
    } else if (st === SINK) {
      hy += 0.02 * dt;
      steer(dt);
      checkCatch();
      if (hy >= botY - 6) st = REEL;
    } else if (st === SNAG) {
      snagT -= dt;
      if (snagT <= 0) st = SINK;
    } else if (st === REEL) {
      hy -= 0.16 * dt;
      if (hy <= waterY + 2) land();
    }
  }

  function draw() {
    var W = cv.W, H = cv.H;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = grad; g.fillRect(0, waterY, W, H - waterY);
    g.globalAlpha = 0.5;
    g.strokeStyle = C.accent;
    g.beginPath(); g.moveTo(0, waterY); g.lineTo(W, waterY); g.stroke();
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var j = 0; j < MAXE; j++) {
      var e = ents[j];
      if (!e.on) continue;
      g.font = SZ[e.k] + 'px sans-serif';
      if (e.vx > 0 && e.k < 3) {
        g.save(); g.translate(e.x, e.y); g.scale(-1, 1);
        g.fillText(EMO[e.k], 0, 0); g.restore();
      } else g.fillText(EMO[e.k], e.x, e.y);
    }
    g.font = '30px sans-serif';
    g.fillText('🚤', boatX, waterY - 13);
    if (st !== METER) {
      var wob = 0, dx = hx;
      if (st === REEL) wob = Math.sin(tms * 0.022) * (3 + (ck >= 0 ? VAL[ck] * 0.12 : 0));
      if (st === SNAG) wob = Math.sin(tms * 0.05) * 2;
      dx += wob;
      g.strokeStyle = C.muted;
      g.beginPath(); g.moveTo(boatX + 12, waterY - 20);
      g.quadraticCurveTo(dx + wob * 2, (waterY + hy) / 2, dx, hy);
      g.stroke();
      g.strokeStyle = C.text; g.lineWidth = 2;
      g.beginPath(); g.arc(dx, hy + 4, 5, -0.4, 2.6); g.stroke();
      g.lineWidth = 1;
      if (st === REEL && ck >= 0) { g.font = SZ[ck] + 'px sans-serif'; g.fillText(EMO[ck], dx, hy + 12); }
      if (st === SNAG) { g.font = '18px sans-serif'; g.fillText('🪼', dx, hy + 9); }
    }
    if (st === METER && started && !over) {
      var mx = W - 24, my = waterY + 24, mh = Math.min(220, H * 0.42);
      g.fillStyle = C.panel2; g.fillRect(mx - 7, my, 14, mh);
      g.fillStyle = C.accent; g.fillRect(mx - 7, my + mh * (1 - meter), 14, mh * meter);
      g.strokeStyle = C.muted; g.strokeRect(mx - 7, my, 14, mh);
      g.fillStyle = C.text; g.font = 'bold 14px sans-serif';
      g.fillText(RU ? 'Тап — заброс!' : 'Tap to cast!', W / 2, waterY + 26);
    }
    g.fillStyle = C.panel2; g.fillRect(0, 0, W, 6);
    g.fillStyle = timeLeft < 15000 ? C.bad : C.good;
    g.fillRect(0, 0, W * timeLeft / ROUND, 6);
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H);
      g.fillStyle = C.text; g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2);
      g.font = '13px sans-serif'; g.fillStyle = C.muted;
      g.fillText(RU ? 'Тап — заброс, веди крючок пальцем' : 'Tap to cast, drag to steer the hook', W / 2, H / 2 + 24);
    }
  }

  function px(ev) { return ev.clientX - container.getBoundingClientRect().left; }
  function onDown(ev) {
    if (over) return;
    dn = true;
    if (!started) { started = true; return; }
    if (st === METER) cast();
    else tgx = px(ev);
  }
  function onMove(ev) {
    if (dn && (st === DROP || st === SINK)) tgx = px(ev);
  }
  function onUp() { dn = false; }
  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.l = e.type === 'keydown';
    else if (e.key === 'ArrowRight' || e.key === 'd') keys.r = e.type === 'keydown';
    else if (e.key === ' ' && e.type === 'keydown' && !over) {
      if (!started) started = true;
      else if (st === METER) cast();
    } else return;
    e.preventDefault();
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { lastT = ts; return; }
    var dt = Math.min(50, ts - lastT);
    lastT = ts;
    update(dt);
    draw();
  }
  layout();
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
