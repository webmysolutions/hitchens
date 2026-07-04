/* Tank Duel — turn-based artillery vs AI on destructible terrain. MG contract game. */
(function () {
'use strict';
MG.register('tanks', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var raf = 0, lastT = 0, paused = false, ended = false;
  var GR = 0.00035, VMAX = 0.85, EXR = 30;
  var terr = null, TW = 0;
  var wind = 0, tms = 0;
  var round = 1, winsP = 0, winsA = 0, totalDmg = 0;
  var st = 'banner', stT = 1500, banner = '', after = 'start';
  var pl = { fx: 0.15, x: 0, y: 0, hp: 100, ang: Math.PI * 0.25, pw: 0.6 };
  var ai = { fx: 0.85, x: 0, y: 0, hp: 100, ang: Math.PI * 0.35, pw: 0.6 };
  var proj = { on: false, x: 0, y: 0, vx: 0, vy: 0, who: 0 };
  var aim = { on: false, sx: 0, sy: 0, dx: 0, dy: 0 };
  var aiPow = 0.55, aiNoise = 0.24, aiAng = 2.1;
  var exp = { t: 0, x: 0, y: 0 };
  var flt = { t: 0, x: 0, y: 0, s: '' };
  var hintX = new Float32Array(160), hintY = new Float32Array(160), hintN = 0;

  function genTerrain() {
    TW = Math.max(2, cv.W | 0);
    var n = 129, hs = new Float32Array(n), i, x;
    hs[0] = 0.45 + Math.random() * 0.3;
    hs[n - 1] = 0.45 + Math.random() * 0.3;
    var step = n - 1, amp = 0.3;
    while (step > 1) {
      for (i = 0; i < n - 1; i += step) {
        hs[i + step / 2] = (hs[i] + hs[i + step]) / 2 + (Math.random() - 0.5) * amp;
      }
      step /= 2; amp *= 0.55;
    }
    terr = new Float32Array(TW);
    for (x = 0; x < TW; x++) {
      var f = x / (TW - 1) * (n - 1), i0 = f | 0, fr = f - i0;
      var v = hs[i0] * (1 - fr) + hs[Math.min(n - 1, i0 + 1)] * fr;
      v = Math.max(0.2, Math.min(0.85, v));
      terr[x] = cv.H * (1 - (0.12 + v * 0.5));
    }
    placeTank(pl); placeTank(ai);
  }
  function placeTank(t) {
    t.x = Math.round(t.fx * (TW - 1));
    var h = terr[t.x], x;
    for (x = Math.max(0, t.x - 16); x <= Math.min(TW - 1, t.x + 16); x++) terr[x] = h;
    t.y = h;
  }
  cv.onResize = function () {
    if (!terr) return;
    var old = terr, ow = TW;
    TW = Math.max(2, cv.W | 0);
    terr = new Float32Array(TW);
    for (var x = 0; x < TW; x++) {
      var f = x / (TW - 1) * (ow - 1), i0 = f | 0, fr = f - i0;
      terr[x] = old[i0] * (1 - fr) + old[Math.min(ow - 1, i0 + 1)] * fr;
    }
    pl.x = Math.round(pl.fx * (TW - 1));
    ai.x = Math.round(ai.fx * (TW - 1));
  };

  function carve(ex, ey, r) {
    var x0 = Math.max(0, (ex - r) | 0), x1 = Math.min(TW - 1, (ex + r) | 0);
    for (var x = x0; x <= x1; x++) {
      var dx = x - ex, dy = Math.sqrt(r * r - dx * dx);
      var bot = ey + dy;
      if (terr[x] < bot) terr[x] = Math.min(cv.H - 4, bot);
    }
  }
  function newWind() { wind = (Math.random() - 0.5) * 0.00045; }
  function startRound() {
    pl.hp = 100; ai.hp = 100;
    genTerrain();
    newWind();
    aiPow = 0.5 + Math.random() * 0.15;
    aiNoise = 0.24;
    aiAng = (100 + Math.random() * 20) * Math.PI / 180; // up-left toward player
    st = 'player';
  }
  function setBanner(txt, nxt, ms) { st = 'banner'; banner = txt; after = nxt; stT = ms; }

  function fire(who, ang, pw) {
    var t = who === 0 ? pl : ai;
    var v = Math.max(0.18, Math.min(1, pw)) * VMAX;
    proj.on = true; proj.who = who;
    proj.x = t.x + Math.cos(ang) * 16;
    proj.y = t.y - 8 + Math.sin(ang) * -16;
    proj.vx = Math.cos(ang) * v;
    proj.vy = -Math.sin(ang) * v;
    st = 'fly';
    api.haptic('light');
  }
  function dmgTo(t, ex, ey) {
    var d = Math.sqrt((t.x - ex) * (t.x - ex) + (t.y - 6 - ey) * (t.y - 6 - ey));
    return d < 56 ? Math.max(0, Math.round(46 * (1 - d / 56))) : 0;
  }
  function explode(ex, ey) {
    proj.on = false;
    carve(ex, ey, EXR);
    exp.t = 420; exp.x = ex; exp.y = ey;
    var dp = dmgTo(pl, ex, ey), da = dmgTo(ai, ex, ey);
    pl.hp -= dp; ai.hp -= da;
    if (proj.who === 0 && da > 0) {
      totalDmg += da;
      api.score(totalDmg);
      flt.t = 900; flt.x = ai.x; flt.y = ai.y - 30; flt.s = '-' + da;
      api.haptic(da > 25 ? 'success' : 'medium');
    } else if (proj.who === 1 && dp > 0) {
      flt.t = 900; flt.x = pl.x; flt.y = pl.y - 30; flt.s = '-' + dp;
      api.haptic('error');
    } else api.haptic('light');
    if (proj.who === 1) aiLearn(ex);
    if (pl.hp <= 0 || ai.hp <= 0) roundOver();
    else {
      newWind();
      if (proj.who === 0) { st = 'think'; stT = 900 + Math.random() * 600; }
      else st = 'player';
    }
  }
  function aiLearn(landX) {
    var err = landX - pl.x; // shooting leftwards: short lands right of player
    aiPow += err * 0.0011;
    aiPow = Math.max(0.22, Math.min(1, aiPow));
    aiNoise *= 0.62;
  }
  function roundOver() {
    var pWin = ai.hp <= 0;
    if (pWin) winsP++; else winsA++;
    var done = winsP === 2 || winsA === 2 || round === 3;
    var txt = pWin ? api.t('you_win') : api.t('you_lose');
    txt += '  ' + winsP + ':' + winsA;
    if (done) {
      setBanner(txt, 'end', 1600);
    } else {
      round++;
      setBanner(txt, 'start', 1600);
    }
  }
  function finish() {
    if (ended) return;
    ended = true;
    var win = winsP > winsA;
    api.gameOver(Math.max(0, totalDmg + (win ? 100 : 0)), { win: win });
  }

  function simHint(ang, pw) {
    var v = Math.max(0.18, Math.min(1, pw)) * VMAX;
    var x = pl.x + Math.cos(ang) * 16, y = pl.y - 8 - Math.sin(ang) * 16;
    var vx = Math.cos(ang) * v, vy = -Math.sin(ang) * v;
    hintN = 0;
    var n = 0, i;
    for (i = 0; i < 640; i++) {
      vy += GR * 8; vx += wind * 8;
      x += vx * 8; y += vy * 8;
      if (i % 4 === 0 && n < 160) { hintX[n] = x; hintY[n] = y; n++; }
      var xi = x | 0;
      if (x < -40 || x > TW + 40 || y > cv.H) break;
      if (xi >= 0 && xi < TW && y >= terr[xi]) break;
    }
    hintN = Math.max(2, (n / 4) | 0); // first 25% of flight
  }

  function update(dt) {
    tms += dt;
    if (exp.t > 0) exp.t -= dt;
    if (flt.t > 0) flt.t -= dt;
    // tanks settle into craters
    var t, k;
    for (k = 0; k < 2; k++) {
      t = k === 0 ? pl : ai;
      var gy = terr[t.x];
      if (t.y < gy) t.y = Math.min(gy, t.y + 0.12 * dt);
      else t.y = gy;
    }
    if (st === 'banner') {
      stT -= dt;
      if (stT <= 0) {
        if (after === 'start') startRound();
        else if (after === 'end') finish();
      }
    } else if (st === 'think') {
      stT -= dt;
      if (stT <= 0) {
        var p = aiPow + (Math.random() - 0.5) * aiNoise;
        fire(1, aiAng, p);
      }
    } else if (st === 'fly' && proj.on) {
      var steps = Math.max(1, Math.round(dt / 4));
      for (var i = 0; i < steps; i++) {
        proj.vy += GR * 4; proj.vx += wind * 4;
        proj.x += proj.vx * 4; proj.y += proj.vy * 4;
        var tgt = proj.who === 0 ? ai : pl;
        var ddx = proj.x - tgt.x, ddy = proj.y - (tgt.y - 6);
        if (ddx * ddx + ddy * ddy < 196) { explode(proj.x, proj.y); return; }
        var xi = proj.x | 0;
        if (xi >= 0 && xi < TW && proj.y >= terr[xi]) { explode(proj.x, proj.y); return; }
        if (proj.x < -60 || proj.x > TW + 60 || proj.y > cv.H + 40) {
          proj.on = false;
          if (proj.who === 1) aiLearn(proj.x);
          newWind();
          if (proj.who === 0) { st = 'think'; stT = 900 + Math.random() * 600; }
          else st = 'player';
          return;
        }
      }
    }
  }

  function drawTank(t, col, mirror) {
    g.fillStyle = C.panel2;
    g.fillRect(t.x - 14, t.y - 5, 28, 5);
    g.fillStyle = col;
    g.fillRect(t.x - 12, t.y - 11, 24, 7);
    g.beginPath(); g.arc(t.x, t.y - 11, 5, Math.PI, 0); g.fill();
    var a = t === pl ? pl.ang : aiAng;
    g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.moveTo(t.x, t.y - 13);
    g.lineTo(t.x + Math.cos(a) * 16, t.y - 13 - Math.sin(a) * 16);
    g.stroke();
    g.lineWidth = 1;
    // hp bar
    var w = 36, frac = Math.max(0, t.hp) / 100;
    g.fillStyle = C.panel2; g.fillRect(t.x - w / 2, t.y - 30, w, 5);
    g.fillStyle = frac > 0.4 ? C.good : C.bad;
    g.fillRect(t.x - w / 2, t.y - 30, w * frac, 5);
  }

  function draw() {
    var W = cv.W, H = cv.H, x;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // terrain
    g.fillStyle = C.panel;
    g.beginPath();
    g.moveTo(0, terr[0]);
    for (x = 2; x < TW; x += 2) g.lineTo(x, terr[x]);
    g.lineTo(W, terr[TW - 1]);
    g.lineTo(W, H); g.lineTo(0, H);
    g.closePath(); g.fill();
    g.strokeStyle = C.good; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, terr[0]);
    for (x = 2; x < TW; x += 2) g.lineTo(x, terr[x]);
    g.stroke();
    g.lineWidth = 1;
    drawTank(pl, C.accent);
    drawTank(ai, C.bad);
    // wind arrow
    var wl = wind * 90000;
    g.strokeStyle = C.text; g.fillStyle = C.text;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '11px sans-serif';
    g.fillText((RU ? 'ветер' : 'wind'), W / 2, 14);
    g.beginPath();
    g.moveTo(W / 2 - wl, 26); g.lineTo(W / 2 + wl, 26);
    g.stroke();
    if (Math.abs(wl) > 2) {
      var sgn = wl > 0 ? 1 : -1;
      g.beginPath();
      g.moveTo(W / 2 + wl, 26);
      g.lineTo(W / 2 + wl - sgn * 5, 22);
      g.lineTo(W / 2 + wl - sgn * 5, 30);
      g.closePath(); g.fill();
    }
    // round + wins
    g.fillStyle = C.muted; g.font = '12px sans-serif';
    g.textAlign = 'left';
    g.fillText((RU ? 'Раунд ' : 'Round ') + round + '  ·  ' + winsP + ':' + winsA, 10, 14);
    g.textAlign = 'center';
    // aim hint
    if (aim.on && st === 'player') {
      g.fillStyle = C.text;
      for (var i = 1; i < hintN; i++) {
        g.globalAlpha = 1 - i / hintN * 0.7;
        g.beginPath(); g.arc(hintX[i], hintY[i], 2.5, 0, 6.29); g.fill();
      }
      g.globalAlpha = 1;
      g.fillStyle = C.muted; g.font = '12px sans-serif';
      g.fillText(((pl.ang * 180 / Math.PI) | 0) + '°  ' + ((pl.pw * 100) | 0) + '%', pl.x, pl.y - 44);
    }
    if (st === 'player' && !aim.on) {
      g.fillStyle = C.accent; g.font = 'bold 13px sans-serif';
      g.fillText(api.t('your_turn') + (RU ? ' — тяни от танка' : ' — drag from your tank'), W / 2, H - 16);
    }
    if (st === 'think') {
      g.fillStyle = C.muted; g.font = '13px sans-serif';
      g.fillText(api.t('thinking'), W / 2, H - 16);
    }
    // projectile
    if (proj.on) {
      g.fillStyle = C.text;
      g.beginPath(); g.arc(proj.x, proj.y, 3.5, 0, 6.29); g.fill();
    }
    // explosion
    if (exp.t > 0) {
      var pr = (1 - exp.t / 420) * EXR * 1.4;
      g.globalAlpha = exp.t / 420;
      g.strokeStyle = C.bad; g.lineWidth = 3;
      g.beginPath(); g.arc(exp.x, exp.y, pr, 0, 6.29); g.stroke();
      if (!api.lowEnd) {
        g.fillStyle = C.accent;
        for (var p2 = 0; p2 < 6; p2++) {
          var aa = p2 * 1.047, rr = pr * 0.8;
          g.fillRect(exp.x + Math.cos(aa) * rr - 1.5, exp.y + Math.sin(aa) * rr - 1.5, 3, 3);
        }
      }
      g.globalAlpha = 1; g.lineWidth = 1;
    }
    if (flt.t > 0) {
      g.globalAlpha = Math.min(1, flt.t / 500);
      g.fillStyle = C.bad; g.font = 'bold 15px sans-serif';
      g.fillText(flt.s, flt.x, flt.y - (900 - flt.t) * 0.02);
      g.globalAlpha = 1;
    }
    if (st === 'banner') {
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H);
      g.fillStyle = C.text; g.font = 'bold 22px sans-serif';
      g.fillText(banner, W / 2, H / 2);
    }
  }

  function pt(ev) {
    var r = container.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function updAim(p) {
    var dx = p.x - aim.sx, dy = p.y - aim.sy;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 6) return;
    pl.ang = Math.atan2(-(dy), dx);
    pl.pw = Math.min(160, len) / 160;
    simHint(pl.ang, pl.pw);
  }
  function onDown(ev) {
    if (st !== 'player' || ended) return;
    var p = pt(ev);
    aim.on = true; aim.sx = p.x; aim.sy = p.y;
    simHint(pl.ang, pl.pw);
  }
  function onMove(ev) {
    if (!aim.on) return;
    updAim(pt(ev));
  }
  function onUp(ev) {
    if (!aim.on) return;
    aim.on = false;
    if (st !== 'player') return;
    var p = pt(ev);
    var dx = p.x - aim.sx, dy = p.y - aim.sy;
    if (dx * dx + dy * dy < 144) return; // too small: cancel
    fire(0, pl.ang, pl.pw);
  }
  function onKey(e) {
    if (st !== 'player' || ended) return;
    var step = Math.PI / 90;
    if (e.key === 'ArrowLeft' || e.key === 'a') pl.ang += step;
    else if (e.key === 'ArrowRight' || e.key === 'd') pl.ang -= step;
    else if (e.key === 'ArrowUp' || e.key === 'w') pl.pw = Math.min(1, pl.pw + 0.03);
    else if (e.key === 'ArrowDown' || e.key === 's') pl.pw = Math.max(0.18, pl.pw - 0.03);
    else if (e.key === ' ') { fire(0, pl.ang, pl.pw); e.preventDefault(); return; }
    else return;
    aim.on = true;
    simHint(pl.ang, pl.pw);
    e.preventDefault();
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { lastT = ts; return; }
    var dt = Math.min(50, ts - lastT);
    lastT = ts;
    update(dt);
    draw();
  }
  genTerrain();
  api.score(0);
  setBanner((RU ? 'Раунд ' : 'Round ') + 1, 'start', 1400);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
