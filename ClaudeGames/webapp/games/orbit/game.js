/* Orbit — gravity slingshot arcade. Premium visuals, 60fps on weak phones. */
(function () {
'use strict';
MG.register('orbit', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var low = api.lowEnd;
  var ru = api.lang === 'ru';

  /* ---------- palette helpers ---------- */
  function hexRgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    return [(a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  var BG = hexRgb(C.bg), ACC = hexRgb(C.accent), GOOD = hexRgb(C.good), BAD = hexRgb(C.bad), TXT = hexRgb(C.text);
  var WHITE = [255, 255, 255], BLACK = [4, 6, 14];
  var DEEP = mix(BG, BLACK, 0.55);
  function aTable(c, maxA) { // quantized alpha strings -> zero alloc in loops
    var arr = [], q;
    for (q = 0; q <= 8; q++) arr.push(rgba(c, Math.round(maxA * q / 8 * 1000) / 1000));
    return arr;
  }
  var partCols = [aTable(ACC, 1), aTable(GOOD, 1), aTable(mix(BAD, WHITE, 0.25), 1), aTable(mix(TXT, WHITE, 0.5), 1)];
  var trailCols = aTable(mix(ACC, WHITE, 0.35), 0.6);
  var predCols = aTable(mix(TXT, ACC, 0.3), 0.9);
  var starCols = aTable(mix(TXT, WHITE, 0.4), 0.9);

  /* ---------- constants ---------- */
  var DT = 1 / 60, GC = 6200, PR = 6;
  var VMAX = 560, VMIN = 80, DRAGK = 3.0, BOOSTV = 150, BOOSTS = 3, LIVES = 3;
  var PMAX = low ? 30 : 120, TN = low ? 24 : 56, PREDMAX = 32;

  /* ---------- state ---------- */
  var raf = 0, last = 0, paused = false, over = false;
  var state = 'ready';       // ready | aim | fly | win | crash | over
  var simTime = 0, stTimer = 0;
  var level = 1, score = 0, attempts = LIVES, boosts = BOOSTS;
  var planets = [];          // {ox,oy,r,m,orb,orbR,spd,ph,x,y,grad,glow,col,edge,fs,minD}
  var padX = 0, padY = 0, whX = 0, whY = 0, whR = 20, whGrad = null;
  var probeX = 0, probeY = 0, probeVX = 0, probeVY = 0, probeA = -Math.PI / 2;
  var shake = 0, boostFx = 0, camX = 0, camY = 0;
  var winD = 0, winA = 0, crashSilent = false;

  /* aiming */
  var aiming = false, aimVX = 0, aimVY = 0, aimOK = false;
  var kbAim = false, kbA = -Math.PI / 2, kbP = 320;
  var predX = new Float32Array(PREDMAX), predY = new Float32Array(PREDMAX);
  var predN = 0, predRes = 0;

  /* trail ring buffer */
  var trail = new Float32Array(TN * 2), tH = 0, tCnt = 0, tSkip = 0;

  /* particle pool (flat arrays, swap-remove) */
  var pX = new Float32Array(PMAX), pY = new Float32Array(PMAX),
      pVX = new Float32Array(PMAX), pVY = new Float32Array(PMAX),
      pLife = new Float32Array(PMAX), pMax = new Float32Array(PMAX),
      pSize = new Float32Array(PMAX), pCol = new Uint8Array(PMAX), pc = 0;

  /* floating labels */
  var FN = 6, fX = new Float32Array(FN), fY = new Float32Array(FN),
      fT = new Float32Array(FN), fStr = [], fc = 0;
  for (var fi = 0; fi < FN; fi++) fStr.push('');

  /* stars (dynamic parallax layers, skipped on lowEnd) */
  var st1 = null, st2 = null, ST1 = 54, ST2 = 30;

  /* cached HUD strings (rebuilt only on change) */
  var levelStr = '', heartStr = '', boltStr = '';
  var FONT_S = '12px sans-serif', FONT_M = 'bold 15px sans-serif', FONT_H = '15px sans-serif';
  var hintA = 1;

  var bgCv = document.createElement('canvas'), bgG = bgCv.getContext('2d');

  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  /* ---------- background bake ---------- */
  function bakeBg() {
    var W = cv.W, H = cv.H, i;
    bgCv.width = W; bgCv.height = H;
    var hue = (level % 5) / 5;
    var top = mix(mix(BG, ACC, 0.16 + hue * 0.06), BLACK, 0.15);
    var gr = bgG.createRadialGradient(W * 0.32, H * 0.16, 0, W * 0.5, H * 0.55, Math.max(W, H) * 1.05);
    gr.addColorStop(0, rgba(top, 1));
    gr.addColorStop(0.45, rgba(mix(BG, BLACK, 0.25), 1));
    gr.addColorStop(1, rgba(DEEP, 1));
    bgG.fillStyle = gr;
    bgG.fillRect(0, 0, W, H);
    if (!low) { // soft nebula blobs
      var nebs = [[W * 0.75, H * 0.3, ACC], [W * 0.2, H * 0.7, GOOD], [W * 0.6, H * 0.85, mix(ACC, BAD, 0.5)]];
      for (i = 0; i < 3; i++) {
        var nb = nebs[i], nr = Math.max(W, H) * rnd(0.25, 0.4);
        var ng = bgG.createRadialGradient(nb[0], nb[1], 0, nb[0], nb[1], nr);
        ng.addColorStop(0, rgba(nb[2], 0.10));
        ng.addColorStop(1, rgba(nb[2], 0));
        bgG.fillStyle = ng;
        bgG.fillRect(nb[0] - nr, nb[1] - nr, nr * 2, nr * 2);
      }
    }
    var nFar = low ? 70 : 110; // far static stars baked in
    for (i = 0; i < nFar; i++) {
      bgG.fillStyle = starCols[2 + ((Math.random() * 5) | 0)];
      var ss = Math.random() < 0.85 ? 1 : 2;
      bgG.fillRect(Math.random() * W, Math.random() * H, ss, ss);
    }
  }
  function makeStars() {
    if (low) { st1 = st2 = null; return; }
    st1 = new Float32Array(ST1 * 4); st2 = new Float32Array(ST2 * 4);
    var i;
    for (i = 0; i < ST1; i++) { st1[i * 4] = Math.random() * cv.W; st1[i * 4 + 1] = Math.random() * cv.H; st1[i * 4 + 2] = 1; st1[i * 4 + 3] = Math.random() * 6.28; }
    for (i = 0; i < ST2; i++) { st2[i * 4] = Math.random() * cv.W; st2[i * 4 + 1] = Math.random() * cv.H; st2[i * 4 + 2] = Math.random() < 0.6 ? 1.5 : 2; st2[i * 4 + 3] = Math.random() * 6.28; }
  }

  /* ---------- shared physics simulation (prediction + solver) ---------- */
  var simRes = 0; // 0 timeout, 1 crash, 2 wormhole, 3 out of bounds
  function boundM() { return 140 + Math.max(cv.W, cv.H) * 0.35; }
  function simulate(x, y, vx, vy, t0, steps, store, stride) {
    var n = 0, i, j, ax, ay, dx, dy, d2, mm, p, px, py, t, np = planets.length;
    var M = boundM(), W = cv.W, H = cv.H, wr2 = whR * whR;
    for (i = 0; i < steps; i++) {
      t = t0 + i * DT; ax = 0; ay = 0;
      for (j = 0; j < np; j++) {
        p = planets[j];
        if (p.orb) { px = p.ox + Math.cos(p.ph + t * p.spd) * p.orbR; py = p.oy + Math.sin(p.ph + t * p.spd) * p.orbR; }
        else { px = p.ox; py = p.oy; }
        dx = px - x; dy = py - y; d2 = dx * dx + dy * dy;
        if (d2 < (p.r + PR) * (p.r + PR)) { simRes = 1; return n; }
        mm = GC * p.m / (d2 * Math.sqrt(d2));
        ax += dx * mm; ay += dy * mm;
      }
      vx += ax * DT; vy += ay * DT;
      x += vx * DT; y += vy * DT;
      if (store && i % stride === 0 && n < PREDMAX) { predX[n] = x; predY[n] = y; n++; }
      dx = whX - x; dy = whY - y;
      if (dx * dx + dy * dy < wr2) { simRes = 2; return n; }
      if (x < -M || x > W + M || y < -M || y > H + M) { simRes = 3; return n; }
    }
    simRes = 0;
    return n;
  }
  function solvable() { // try a fan of launches; level is kept only if one succeeds
    var base = Math.atan2(whY - (padY - 16), whX - padX), k, pw;
    var pows = [VMAX * 0.45, VMAX * 0.7, VMAX];
    for (k = -12; k <= 12; k++) {
      var ang = base + k * 0.26;
      for (pw = 0; pw < 3; pw++) {
        simulate(padX, padY - 16, Math.cos(ang) * pows[pw], Math.sin(ang) * pows[pw], 0, 480, false, 3);
        if (simRes === 2) return true;
      }
    }
    return false;
  }

  /* ---------- level generation ---------- */
  function buildCandidate(np, wr, nMov) {
    var W = cv.W, H = cv.H, i, tries, ok;
    whR = wr;
    padX = rnd(W * 0.25, W * 0.75); padY = H - 62;
    whX = rnd(W * 0.18, W * 0.82); whY = rnd(H * 0.1 + 40, H * 0.28);
    planets.length = 0;
    var bases = [ACC, GOOD, mix(ACC, BAD, 0.55), mix(ACC, GOOD, 0.5), mix(BAD, WHITE, 0.15), mix(GOOD, WHITE, 0.25)];
    for (i = 0; i < np; i++) {
      for (tries = 0; tries < 40; tries++) {
        var r = rnd(17, np > 4 ? 36 : 46);
        var orb = 0, orbR = 0, spd = 0;
        if (i < nMov) { orb = 1; orbR = rnd(18, 42); spd = rnd(0.35, 0.75) * (Math.random() < 0.5 ? -1 : 1); }
        var x = rnd(r + 26, W - r - 26), y = rnd(H * 0.26, H * 0.74);
        var marg = r + orbR;
        var dx = x - padX, dy = y - padY;
        if (dx * dx + dy * dy < (marg + 74) * (marg + 74)) continue;
        dx = x - whX; dy = y - whY;
        if (dx * dx + dy * dy < (marg + whR + 40) * (marg + whR + 40)) continue;
        ok = true;
        for (var j = 0; j < planets.length; j++) {
          var q = planets[j];
          dx = x - q.ox; dy = y - q.oy;
          var need = marg + q.r + q.orbR + 26;
          if (dx * dx + dy * dy < need * need) { ok = false; break; }
        }
        if (!ok) continue;
        planets.push({
          ox: x, oy: y, x: x, y: y, r: r, m: r * r * rnd(0.85, 1.35),
          orb: orb, orbR: orbR, spd: spd, ph: rnd(0, 6.28),
          col: bases[(Math.random() * bases.length) | 0], grad: null, glow: null, fs: 0, minD: 1e9
        });
        break;
      }
    }
  }
  function buildFallback() { // guaranteed-easy: clear vertical corridor
    var W = cv.W, H = cv.H;
    whR = 26;
    padX = W * 0.5; padY = H - 62;
    whX = W * 0.5; whY = H * 0.16;
    planets.length = 0;
    planets.push({ ox: W * 0.12, oy: H * 0.5, x: W * 0.12, y: H * 0.5, r: 22, m: 420, orb: 0, orbR: 0, spd: 0, ph: 0, col: ACC, grad: null, glow: null, fs: 0, minD: 1e9 });
    planets.push({ ox: W * 0.88, oy: H * 0.5, x: W * 0.88, y: H * 0.5, r: 22, m: 420, orb: 0, orbR: 0, spd: 0, ph: 0, col: GOOD, grad: null, glow: null, fs: 0, minD: 1e9 });
  }
  function finishLevel() { // cache all gradients once per level (never per frame)
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i], r = p.r;
      var hi = mix(p.col, WHITE, 0.55), md = p.col, dk = mix(p.col, BLACK, 0.68);
      var gr = g.createRadialGradient(-r * 0.38, -r * 0.4, r * 0.1, 0, 0, r);
      gr.addColorStop(0, rgba(hi, 1));
      gr.addColorStop(0.35, rgba(md, 1));
      gr.addColorStop(0.8, rgba(mix(md, dk, 0.6), 1));
      gr.addColorStop(1, rgba(dk, 1));
      p.grad = gr;
      p.edge = rgba(mix(p.col, WHITE, 0.3), 0.4);
      if (!low) {
        var gl = g.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.6);
        gl.addColorStop(0, rgba(p.col, 0.28));
        gl.addColorStop(1, rgba(p.col, 0));
        p.glow = gl;
      }
    }
    var wg = g.createRadialGradient(0, 0, 0, 0, 0, whR * 2.4);
    wg.addColorStop(0, rgba(mix(ACC, WHITE, 0.75), 0.95));
    wg.addColorStop(0.28, rgba(ACC, 0.75));
    wg.addColorStop(0.6, rgba(mix(ACC, BG, 0.4), 0.28));
    wg.addColorStop(1, rgba(ACC, 0));
    whGrad = wg;
    bakeBg();
  }
  function genLevel() {
    var np = 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + (level >= 8 ? 1 : 0) + (level >= 12 ? 1 : 0);
    if (np > 6) np = 6;
    var wr = Math.max(13, 25 - level * 0.7);
    var nMov = level > 8 ? Math.min(2, ((level - 6) / 3) | 0) : 0;
    var found = false;
    for (var att = 0; att < 34 && !found; att++) {
      var relax = att >= 24; // late attempts get easier so we always converge fast
      buildCandidate(relax ? Math.max(2, np - 2) : np, relax ? wr + 8 : wr, relax ? 0 : nMov);
      found = solvable();
    }
    if (!found) { buildFallback(); solvable(); }
    finishLevel();
    boosts = BOOSTS; attempts = LIVES;
    heartStr = ''; for (var h = 0; h < attempts; h++) heartStr += '❤';
    boltStr = ''; for (var b = 0; b < boosts; b++) boltStr += '⚡';
    levelStr = api.t('level') + ' ' + level;
    resetProbe();
    showBanner(levelStr);
  }
  function resetProbe() {
    probeX = padX; probeY = padY - 16;
    probeVX = 0; probeVY = 0; probeA = -Math.PI / 2;
    tCnt = 0; tH = 0; tSkip = 0;
    aiming = false; kbAim = false; predN = 0;
    for (var i = 0; i < planets.length; i++) { planets[i].fs = 0; planets[i].minD = 1e9; }
    state = 'aim';
  }

  /* ---------- banner (DOM, eased) ---------- */
  var banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;left:0;right:0;top:34%;text-align:center;' +
    'font:800 30px/1.2 sans-serif;letter-spacing:2px;color:' + C.text + ';pointer-events:none;' +
    'opacity:0;transform:translateY(22px) scale(.94);transition:opacity .45s ease,transform .45s cubic-bezier(.2,.9,.3,1.2);' +
    'text-shadow:0 0 22px ' + rgba(ACC, 0.9) + ',0 2px 8px rgba(0,0,0,.6);';
  container.appendChild(banner);
  var timers = [];
  function setT(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function showBanner(txt) {
    banner.textContent = txt;
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(22px) scale(.94)';
    void banner.offsetWidth;
    banner.style.opacity = '1';
    banner.style.transform = 'translateY(0) scale(1)';
    setT(function () { banner.style.opacity = '0'; banner.style.transform = 'translateY(-16px) scale(.96)'; }, 1300);
  }

  /* ---------- particles / floats ---------- */
  function spawn(x, y, n, col, spd, life, size) {
    for (var i = 0; i < n && pc < PMAX; i++) {
      var a = Math.random() * 6.283, v = spd * (0.3 + Math.random() * 0.7);
      pX[pc] = x; pY[pc] = y;
      pVX[pc] = Math.cos(a) * v; pVY[pc] = Math.sin(a) * v;
      pLife[pc] = pMax[pc] = life * (0.6 + Math.random() * 0.4);
      pSize[pc] = size * (0.6 + Math.random() * 0.8);
      pCol[pc] = col; pc++;
    }
  }
  function float(x, y, str) {
    var i = fc < FN ? fc++ : FN - 1;
    fX[i] = x; fY[i] = y; fT[i] = 1; fStr[i] = str;
  }

  /* ---------- flight step (fixed timestep) ---------- */
  function addScore(n) { score += n; api.score(score); }
  function stepFly() {
    var ax = 0, ay = 0, i, p, dx, dy, d2, mm, t = simTime;
    for (i = 0; i < planets.length; i++) {
      p = planets[i];
      if (p.orb) { p.x = p.ox + Math.cos(p.ph + t * p.spd) * p.orbR; p.y = p.oy + Math.sin(p.ph + t * p.spd) * p.orbR; }
      dx = p.x - probeX; dy = p.y - probeY; d2 = dx * dx + dy * dy;
      if (d2 < (p.r + PR) * (p.r + PR)) { crash(false); return; }
      var d = Math.sqrt(d2);
      if (d < p.minD) p.minD = d;
      if (p.fs === 0 && d < p.r * 1.3) p.fs = 1;                     // near-miss entered
      else if (p.fs === 1 && d > p.r * 1.7) {                        // survived flyby
        p.fs = 2; addScore(15);
        float(probeX, probeY - 14, ru ? '+15 пролёт!' : '+15 flyby!');
        api.haptic('light');
      }
      mm = GC * p.m / (d2 * d);
      ax += dx * mm; ay += dy * mm;
    }
    probeVX += ax * DT; probeVY += ay * DT;
    probeX += probeVX * DT; probeY += probeVY * DT;
    probeA = Math.atan2(probeVY, probeVX);
    if (++tSkip >= 2) {
      tSkip = 0;
      trail[tH * 2] = probeX; trail[tH * 2 + 1] = probeY;
      tH = (tH + 1) % TN; if (tCnt < TN) tCnt++;
    }
    dx = whX - probeX; dy = whY - probeY;
    if (dx * dx + dy * dy < whR * whR) { arrive(); return; }
    var M = boundM();
    if (probeX < -M || probeX > cv.W + M || probeY < -M || probeY > cv.H + M) crash(true);
  }
  function crash(silent) {
    crashSilent = silent;
    state = 'crash'; stTimer = 0; shake = silent ? 3 : 9;
    if (!silent) spawn(probeX, probeY, low ? 12 : 42, 2, 240, 0.9, 3.5);
    else float(cv.W / 2, cv.H * 0.45, ru ? 'улетел…' : 'lost in space…');
    api.haptic('error');
  }
  function arrive() {
    state = 'win'; stTimer = 0;
    winD = Math.sqrt((probeX - whX) * (probeX - whX) + (probeY - whY) * (probeY - whY));
    winA = Math.atan2(probeY - whY, probeX - whX);
    spawn(whX, whY, low ? 10 : 30, 0, 160, 0.8, 2.5);
    addScore(100 + boosts * 20);
    api.haptic('success');
  }

  /* ---------- input ---------- */
  function launch(vx, vy) {
    probeVX = vx; probeVY = vy;
    state = 'fly'; tCnt = 0; tH = 0; tSkip = 0; predN = 0;
    aiming = false; kbAim = false;
    api.haptic('light');
  }
  function doBoost() {
    if (boosts <= 0) return;
    boosts--;
    boltStr = ''; for (var b = 0; b < boosts; b++) boltStr += '⚡';
    var sp = Math.sqrt(probeVX * probeVX + probeVY * probeVY) || 1;
    probeVX += probeVX / sp * BOOSTV; probeVY += probeVY / sp * BOOSTV;
    boostFx = 0.35;
    spawn(probeX - Math.cos(probeA) * 8, probeY - Math.sin(probeA) * 8, low ? 5 : 14, 1, 130, 0.5, 2.5);
    api.haptic('light');
  }
  var pd = false, dx0 = 0, dy0 = 0;
  function evPt(e) { var r = container.getBoundingClientRect(); ptX = e.clientX - r.left; ptY = e.clientY - r.top; }
  var ptX = 0, ptY = 0;
  function onDown(e) {
    if (over) return;
    evPt(e);
    if (state === 'ready') { state = 'aim'; }
    if (state === 'aim') {
      pd = true; aiming = true; kbAim = false;
      dx0 = ptX; dy0 = ptY; aimVX = 0; aimVY = 0; aimOK = false;
      hintA = 0;
    } else if (state === 'fly') doBoost();
    e.preventDefault();
  }
  function onMove(e) {
    if (!pd || state !== 'aim') return;
    evPt(e);
    var vx = (dx0 - ptX) * DRAGK, vy = (dy0 - ptY) * DRAGK;
    var sp = Math.sqrt(vx * vx + vy * vy);
    if (sp > VMAX) { vx *= VMAX / sp; vy *= VMAX / sp; sp = VMAX; }
    aimVX = vx; aimVY = vy; aimOK = sp >= VMIN;
    e.preventDefault();
  }
  function onUp(e) {
    if (pd && state === 'aim') {
      if (aimOK) launch(aimVX, aimVY);
      else { aiming = false; predN = 0; }
    }
    pd = false;
  }
  function onKey(e) {
    if (over) return;
    var k = e.key;
    if (state === 'ready' && (k === ' ' || k === 'Enter')) { state = 'aim'; e.preventDefault(); return; }
    if (state === 'aim') {
      var used = true;
      if (k === 'ArrowLeft' || k === 'a') kbA -= 0.07;
      else if (k === 'ArrowRight' || k === 'd') kbA += 0.07;
      else if (k === 'ArrowUp' || k === 'w') kbP = Math.min(VMAX, kbP + 22);
      else if (k === 'ArrowDown' || k === 's') kbP = Math.max(VMIN, kbP - 22);
      else if (k === ' ' && kbAim) { launch(Math.cos(kbA) * kbP, Math.sin(kbA) * kbP); e.preventDefault(); return; }
      else used = false;
      if (used) { kbAim = true; aiming = false; hintA = 0; e.preventDefault(); }
    } else if (state === 'fly' && k === ' ') { doBoost(); e.preventDefault(); }
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);

  /* ---------- resize ---------- */
  var oldW = cv.W, oldH = cv.H;
  cv.onResize = function (W, H) {
    var sx = W / oldW, sy = H / oldH;
    padX *= sx; padY = H - 62; whX *= sx; whY *= sy;
    for (var i = 0; i < planets.length; i++) { planets[i].ox *= sx; planets[i].oy *= sy; planets[i].x = planets[i].ox; planets[i].y = planets[i].oy; }
    if (state === 'fly' || state === 'win') { probeX *= sx; probeY *= sy; }
    else if (state === 'aim') resetProbe();
    else { probeX = padX; probeY = padY - 16; }
    oldW = W; oldH = H;
    bakeBg(); makeStars();
  };

  /* ---------- drawing ---------- */
  function drawStars(t) {
    if (low || !st1) return;
    var W = cv.W, H = cv.H, i, x, y, q;
    var ox1 = -camX * 0.03, oy1 = -camY * 0.03, ox2 = -camX * 0.07, oy2 = -camY * 0.07;
    for (i = 0; i < ST1; i++) {
      x = st1[i * 4] + ox1; y = st1[i * 4 + 1] + oy1;
      x -= W * Math.floor(x / W); y -= H * Math.floor(y / H);
      q = 3 + ((2.4 + 2.4 * Math.sin(t * 1.6 + st1[i * 4 + 3])) | 0);
      g.fillStyle = starCols[q];
      g.fillRect(x, y, 1, 1);
    }
    for (i = 0; i < ST2; i++) {
      x = st2[i * 4] + ox2; y = st2[i * 4 + 1] + oy2;
      x -= W * Math.floor(x / W); y -= H * Math.floor(y / H);
      q = 4 + ((2 + 2 * Math.sin(t * 2.1 + st2[i * 4 + 3])) | 0);
      g.fillStyle = starCols[q];
      g.fillRect(x, y, st2[i * 4 + 2], st2[i * 4 + 2]);
    }
  }
  function drawPlanets(t) {
    var i, p;
    for (i = 0; i < planets.length; i++) {
      p = planets[i];
      if (p.orb) { // faint orbit path
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        g.lineWidth = 1;
        g.beginPath(); g.arc(p.ox, p.oy, p.orbR, 0, 6.283); g.stroke();
        if (state !== 'fly') { p.x = p.ox + Math.cos(p.ph + t * p.spd) * p.orbR; p.y = p.oy + Math.sin(p.ph + t * p.spd) * p.orbR; }
      }
      g.save();
      g.translate(p.x, p.y);
      if (p.glow) { // atmosphere halo (cached gradient)
        g.fillStyle = p.glow;
        g.beginPath(); g.arc(0, 0, p.r * 1.6, 0, 6.283); g.fill();
      }
      g.fillStyle = p.grad;
      g.beginPath(); g.arc(0, 0, p.r, 0, 6.283); g.fill();
      g.strokeStyle = p.edge; // atmosphere ring
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, p.r * 1.12, 0, 6.283); g.stroke();
      g.restore();
    }
  }
  function drawWormhole(t) {
    var p = 1 + 0.08 * Math.sin(t * 3.1);
    g.save();
    g.translate(whX, whY);
    g.scale(p, p);
    g.fillStyle = whGrad;
    g.beginPath(); g.arc(0, 0, whR * 2.4, 0, 6.283); g.fill();
    var arcs = low ? 2 : 3, i;
    g.lineWidth = 2;
    for (i = 0; i < arcs; i++) { // rotating swirl arcs
      var a0 = t * (1.1 + 0.5 * i) * (i % 2 ? -1 : 1) + i * 2.1;
      g.strokeStyle = i === 0 ? rgba(mix(ACC, WHITE, 0.6), 0.9) : rgba(ACC, 0.55 - i * 0.12);
      g.beginPath(); g.arc(0, 0, whR * (0.55 + 0.3 * i), a0, a0 + 2.4); g.stroke();
    }
    if (!low) { g.shadowBlur = 14; g.shadowColor = C.accent; }
    g.fillStyle = rgba(mix(ACC, WHITE, 0.85), 0.95);
    g.beginPath(); g.arc(0, 0, whR * 0.32 * (1 + 0.15 * Math.sin(t * 5)), 0, 6.283); g.fill();
    g.shadowBlur = 0;
    g.restore();
  }
  function drawPad(t) {
    g.save();
    g.translate(padX, padY);
    g.strokeStyle = rgba(GOOD, 0.35 + 0.15 * Math.sin(t * 2.5));
    g.lineWidth = 2;
    g.beginPath(); g.arc(0, -16, 15, 0, 6.283); g.stroke();
    g.fillStyle = rgba(mix(GOOD, BG, 0.45), 0.9);
    g.beginPath();
    g.moveTo(-16, 4); g.lineTo(16, 4); g.lineTo(11, 10); g.lineTo(-11, 10);
    g.closePath(); g.fill();
    g.restore();
  }
  function drawTrail() {
    if (tCnt < 2) return;
    var i, idx, x0, y0, x1, y1;
    if (low) {
      g.strokeStyle = trailCols[4];
      g.lineWidth = 1.5;
      g.beginPath();
      for (i = 0; i < tCnt; i++) {
        idx = ((tH - tCnt + i) % TN + TN) % TN;
        if (i === 0) g.moveTo(trail[idx * 2], trail[idx * 2 + 1]);
        else g.lineTo(trail[idx * 2], trail[idx * 2 + 1]);
      }
      g.stroke();
      return;
    }
    for (i = 1; i < tCnt; i++) { // fading glow polyline
      idx = ((tH - tCnt + i - 1) % TN + TN) % TN;
      x0 = trail[idx * 2]; y0 = trail[idx * 2 + 1];
      idx = ((tH - tCnt + i) % TN + TN) % TN;
      x1 = trail[idx * 2]; y1 = trail[idx * 2 + 1];
      var q = ((i / tCnt) * 8) | 0;
      g.strokeStyle = trailCols[q];
      g.lineWidth = 0.5 + 2.5 * i / tCnt;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  function drawProbe(t, scale, hover) {
    g.save();
    g.translate(probeX, probeY + (hover ? Math.sin(simTime * 2.2) * 2 : 0));
    g.rotate(probeA);
    if (scale !== 1) g.scale(scale, scale);
    if (!low) { g.shadowBlur = 10; g.shadowColor = C.accent; }
    if (boostFx > 0 || state === 'fly') { // engine flame
      var fl = 6 + (boostFx > 0 ? 10 : 3) * (0.6 + 0.4 * Math.sin(t * 30));
      g.fillStyle = rgba(mix(ACC, WHITE, 0.3), boostFx > 0 ? 0.95 : 0.55);
      g.beginPath(); g.moveTo(-5, 2.6); g.lineTo(-5 - fl, 0); g.lineTo(-5, -2.6); g.closePath(); g.fill();
    }
    g.fillStyle = rgba(mix(TXT, WHITE, 0.5), 1);
    g.beginPath();
    g.moveTo(7, 0); g.lineTo(-5, 4.6); g.lineTo(-2.5, 0); g.lineTo(-5, -4.6);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = C.accent;
    g.beginPath(); g.arc(1.2, 0, 1.8, 0, 6.283); g.fill();
    g.restore();
  }
  function drawPrediction() {
    if (predN < 1) return;
    var i, q;
    for (i = 0; i < predN; i++) {
      q = 8 - ((i / predN) * 6 | 0);
      g.fillStyle = predCols[q];
      var s = 3 - 1.6 * i / predN;
      g.beginPath(); g.arc(predX[i], predY[i], s, 0, 6.283); g.fill();
    }
    var ex = predX[predN - 1], ey = predY[predN - 1];
    if (predRes === 1) { // will crash
      g.strokeStyle = rgba(BAD, 0.9); g.lineWidth = 2;
      g.beginPath(); g.moveTo(ex - 5, ey - 5); g.lineTo(ex + 5, ey + 5); g.moveTo(ex + 5, ey - 5); g.lineTo(ex - 5, ey + 5); g.stroke();
    } else if (predRes === 2) { // reaches wormhole
      g.strokeStyle = rgba(GOOD, 0.9); g.lineWidth = 2;
      g.beginPath(); g.arc(ex, ey, 7, 0, 6.283); g.stroke();
    }
  }
  function drawParticles() {
    for (var i = 0; i < pc; i++) {
      var q = ((pLife[i] / pMax[i]) * 8) | 0;
      g.fillStyle = partCols[pCol[i]][q];
      var s = pSize[i];
      g.fillRect(pX[i] - s / 2, pY[i] - s / 2, s, s);
    }
  }
  function drawHud(t) {
    g.textBaseline = 'middle';
    g.font = FONT_M;
    g.textAlign = 'left';
    g.fillStyle = rgba(TXT, 0.9);
    g.fillText(levelStr, 14, 24);
    g.textAlign = 'right';
    g.font = FONT_H;
    g.fillStyle = rgba(BAD, 0.95);
    g.fillText(heartStr, cv.W - 12, 24);
    if (boltStr) {
      g.textAlign = 'center';
      g.fillStyle = rgba(mix(ACC, WHITE, 0.3), 0.95);
      g.fillText(boltStr, cv.W / 2, cv.H - 20);
    }
    if (hintA > 0.01 && state === 'aim' && level === 1 && !aiming) {
      g.font = FONT_S;
      g.textAlign = 'center';
      g.fillStyle = rgba(TXT, 0.55 * hintA * (0.7 + 0.3 * Math.sin(t * 3)));
      g.fillText(ru ? 'тяни и отпусти — гравитация поможет' : 'drag & release — gravity does the rest', cv.W / 2, padY - 52);
      g.fillText(ru ? 'тап в полёте = ускорение ⚡' : 'tap mid-flight = boost ⚡', cv.W / 2, padY - 38);
    }
    for (var i = 0; i < fc; i++) {
      g.font = FONT_M;
      g.textAlign = 'center';
      var q = (fT[i] * 8) | 0;
      g.fillStyle = partCols[1][q];
      g.fillText(fStr[i], fX[i], fY[i] - (1 - fT[i]) * 26);
    }
  }

  /* ---------- main loop ---------- */
  var acc = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    if (!last) last = ts;
    var dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    var t, i;

    /* fixed-timestep physics */
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      simTime += DT;
      if (state === 'fly') stepFly();
    }
    t = simTime;

    /* timers / non-physics anim */
    if (boostFx > 0) boostFx -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 14);
    if (hintA > 0 && (state === 'fly' || level > 1)) hintA = Math.max(0, hintA - dt * 2);
    for (i = 0; i < pc; i++) {
      pLife[i] -= dt;
      if (pLife[i] <= 0) { pc--; pX[i] = pX[pc]; pY[i] = pY[pc]; pVX[i] = pVX[pc]; pVY[i] = pVY[pc]; pLife[i] = pLife[pc]; pMax[i] = pMax[pc]; pSize[i] = pSize[pc]; pCol[i] = pCol[pc]; i--; continue; }
      pVX[i] *= 0.985; pVY[i] *= 0.985;
      pX[i] += pVX[i] * dt; pY[i] += pVY[i] * dt;
    }
    for (i = 0; i < fc; i++) {
      fT[i] -= dt * 0.7;
      if (fT[i] <= 0) { fc--; fX[i] = fX[fc]; fY[i] = fY[fc]; fT[i] = fT[fc]; fStr[i] = fStr[fc]; i--; }
    }
    if (state === 'win') {
      stTimer += dt;
      var k = Math.min(1, stTimer / 0.8);
      winD *= (1 - dt * 6); winA += dt * 9;
      probeX = whX + Math.cos(winA) * winD;
      probeY = whY + Math.sin(winA) * winD;
      probeA = winA + 1.9;
      if (!low && Math.random() < 0.4) spawn(probeX, probeY, 1, 0, 40, 0.4, 2);
      if (k >= 1) { level++; genLevel(); }
    } else if (state === 'crash') {
      stTimer += dt;
      if (stTimer >= 0.9) {
        attempts--;
        heartStr = ''; for (var h = 0; h < attempts; h++) heartStr += '❤';
        if (attempts <= 0) { state = 'over'; over = true; api.gameOver(score); }
        else resetProbe();
      }
    }

    /* camera parallax target */
    var tx = (state === 'fly' ? probeX : padX) - cv.W / 2;
    var ty = (state === 'fly' ? probeY : padY) - cv.H / 2;
    camX += (tx - camX) * Math.min(1, dt * 3);
    camY += (ty - camY) * Math.min(1, dt * 3);

    /* aim prediction (re-simmed each frame so moving planets stay honest) */
    if (state === 'aim' && (aiming || kbAim)) {
      var avx = kbAim ? Math.cos(kbA) * kbP : aimVX;
      var avy = kbAim ? Math.sin(kbA) * kbP : aimVY;
      if (kbAim || aimOK || (aimVX || aimVY)) {
        predN = simulate(probeX, probeY, avx, avy, t, 90, true, low ? 4 : 3);
        predRes = simRes;
      }
    } else predN = 0;

    /* ---------- render ---------- */
    g.drawImage(bgCv, 0, 0, cv.W, cv.H);
    if (shake > 0.05) {
      g.save();
      g.translate(Math.sin(ts * 0.11) * shake, Math.cos(ts * 0.093) * shake);
    }
    drawStars(t);
    drawPlanets(t);
    drawWormhole(t);
    drawPad(t);
    if (state === 'fly' || state === 'win' || state === 'crash') drawTrail();
    drawPrediction();
    if (state !== 'crash' || crashSilent) {
      var sc = state === 'win' ? Math.max(0.05, 1 - stTimer / 0.7) : 1;
      drawProbe(ts * 0.001, sc, state === 'aim'); // hover is visual only — launch physics stay exact
    }
    drawParticles();
    if (shake > 0.05) g.restore();
    drawHud(t);

    if (state === 'ready') {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 20px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = FONT_S;
      g.fillStyle = rgba(TXT, 0.6);
      g.fillText(ru ? 'долети до червоточины через гравитацию планет' : 'reach the wormhole using planet gravity', cv.W / 2, cv.H / 2 + 28);
    }
  }

  /* ---------- boot ---------- */
  api.score(0);
  makeStars();
  genLevel();
  state = 'ready';
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      window.removeEventListener('keydown', onKey);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      if (banner.parentNode) banner.parentNode.removeChild(banner);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; last = 0; }
  };
});
})();
