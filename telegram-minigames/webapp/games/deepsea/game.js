/* Deep Sea — atmospheric submarine descent into a glowing abyss. */
(function () {
'use strict';
MG.register('deepsea', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var LOW = api.lowEnd;
  var RU = api.lang === 'ru';
  var TAU = Math.PI * 2;
  var sin = Math.sin, cos = Math.cos, mn = Math.min, mx = Math.max, ab = Math.abs;

  var PXM = 6;          // world px per meter
  var SUBR = 13;        // sub collision radius
  var SEG = 26;         // wall sampling step (px)

  /* ---------------- color helpers (init / band-change only) ---------------- */
  function hx(s) {
    if (!s || s.charAt(0) !== '#') return [40, 60, 90];
    s = s.slice(1);
    if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
    var n = parseInt(s, 16);
    if (isNaN(n)) return [40, 60, 90];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixN(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(a) { return 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')'; }
  function rgba(a, al) { return 'rgba(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ',' + al + ')'; }

  var cBG = hx(C.bg), cACC = hx(C.accent), cGOOD = hx(C.good), cBAD = hx(C.bad),
      cTXT = hx(C.text), cPAN = hx(C.panel), cMUT = hx(C.muted);

  // depth gradient stops: palette bg blended into deep ocean blues
  var DSTOP = [
    mixN(cBG, [16, 94, 128], 0.55),   // sunlit teal
    mixN(cBG, [10, 56, 100], 0.70),   // twilight blue
    mixN(cBG, [5, 24, 56], 0.86),     // midnight
    [2, 5, 14]                        // abyss
  ];
  var DDEP = [0, 200, 500, 950];      // meters for each stop
  function colAt(d, out) {
    var i = 0;
    while (i < 2 && d > DDEP[i + 1]) i++;
    var t = (d - DDEP[i]) / (DDEP[i + 1] - DDEP[i]);
    if (t < 0) t = 0; if (t > 1) t = 1;
    var a = DSTOP[i], b = DSTOP[i + 1];
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
  }

  // static derived colors (strings prebuilt, no per-frame allocation)
  var rockCol   = rgb(mixN(cPAN, [3, 7, 18], 0.74));
  var rockEdge  = rgba(mixN(cACC, [70, 160, 190], 0.55), 0.30);
  var rockEdge2 = rgba(mixN(cBG, [0, 0, 0], 0.6), 0.35);
  var pearlCore = rgb(mixN(cTXT, [255, 250, 235], 0.75));
  var pearlGlow = rgb(mixN(cACC, [120, 220, 255], 0.6));
  var airCol    = rgb(mixN(cGOOD, [170, 240, 255], 0.55));
  var jellyCol  = mixN(cACC, [180, 120, 255], 0.5);
  var jellyStr  = rgba(jellyCol, 0.34);
  var jellyStr2 = rgba(jellyCol, 0.16);
  var jellyGlow = rgb(mixN(jellyCol, [255, 255, 255], 0.25));
  var angBody   = rgb(mixN(cPAN, [10, 12, 24], 0.65));
  var angBody2  = rgb(mixN(cPAN, [30, 36, 58], 0.4));
  var lureCol   = rgb(mixN(cGOOD, [200, 255, 220], 0.5));
  var fishCol   = rgba(mixN(cMUT, [140, 200, 230], 0.5), 0.75);
  var bubbleCol = rgba(mixN(cTXT, [200, 235, 255], 0.6), 0.35);
  var moteCol   = rgba(cTXT, 0.4);
  var txtDim    = rgba(cMUT, 0.75);
  var barBack   = rgba(cPAN, 0.72);
  var goodStr   = rgb(cGOOD);
  var badStr    = rgb(cBAD);
  var textStr   = rgb(cTXT);
  var popCol    = rgb(mixN(cGOOD, cTXT, 0.35));
  var darkTint  = mixN(cBG, [1, 3, 10], 0.85); // darkness overlay tint
  var lowDarkStr = '';                          // lowEnd cached overlay string
  var lowDarkBand = -1;

  /* ---------------- state ---------------- */
  var raf = 0, last = 0, paused = false;
  var started, alive, tGame, subX, subWY, vx, camY, tilt, propA;
  var o2, o2Warned, pearlPts, lastScore, deadT;
  var genY, lastAirY, airGap, nextMarkM;
  var keyL = false, keyR = false, tDir = 0;
  var ptrs = {};                 // pointerId -> -1|1
  var swx = 0, swy = 0;          // camera sway
  var depM = 0, depStr = '0 m', depStrM = -1;
  var UNIT = RU ? ' м' : ' m';

  /* ---------------- pools ---------------- */
  function pool(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f()); return a; }
  function alloc(p) { for (var i = 0; i < p.length; i++) if (!p[i].a) return p[i]; return null; }

  var pearls = pool(16, function () { return { a: false, x: 0, y: 0, ph: 0 }; });
  var airs = pool(5, function () { return { a: false, x: 0, y: 0, ph: 0 }; });
  var jellies = pool(LOW ? 9 : 14, function () { return { a: false, x: 0, y: 0, bx: 0, ph: 0, r: 0, sp: 0, sw: 0 }; });
  var anglers = pool(2, function () { return { a: false, x: 0, y: 0, vx: 0, mode: 0, ct: 0, cool: 0, ph: 0, face: 1 }; });
  var schools = LOW ? [] : pool(3, function () {
    var f = [];
    for (var i = 0; i < 8; i++) f.push({ ph: Math.random() * TAU, ra: 14 + Math.random() * 26, rb: 8 + Math.random() * 16, sp: 0.7 + Math.random() * 0.8 });
    return { a: false, x: 0, y: 0, ph: 0, dx: 0, fish: f };
  });
  var NB = LOW ? 22 : 44;
  var bubbles = pool(NB, function () { return { a: false, x: 0, y: 0, r: 0, vy: 0, ph: 0, life: 0, max: 0 }; });
  var pops = pool(6, function () { return { a: false, x: 0, y: 0, t: 0, txt: '' }; });
  var markers = pool(4, function () { return { a: false, y: 0, txt: '' }; });
  var NM = 34;
  var moteX = null, moteY = null, motePh = null;
  if (!LOW) {
    moteX = new Float64Array(NM); moteY = new Float64Array(NM); motePh = new Float64Array(NM);
  }
  var AIROFF = [[0, 0, 15], [14, -9, 10], [-13, -6, 11], [9, 10, 8], [-8, 11, 8], [1, -14, 7]];

  /* ---------------- cave geometry ---------------- */
  var WLS = [0, 0];
  function spike(t) { var s = sin(t); if (s <= 0) return 0; s *= s; s *= s; return s * s; }
  function caveC(y) { return 0.5 + 0.20 * sin(y * 0.00115) + 0.11 * sin(y * 0.00293 + 2.0) + 0.045 * sin(y * 0.0071 + 4.2); }
  function caveH(y) {
    var d = y / PXM;
    var f = 0.40 - mn(0.235, d * 0.00030);
    return f + 0.028 * sin(y * 0.0017 + 1.0);
  }
  function walls(y) {
    var c = caveC(y), h = caveH(y);
    var l = (c - h + 0.028 * sin(y * 0.0127 + 0.8) + 0.015 * sin(y * 0.0311 + 2.3) + 0.042 * spike(y * 0.0035 + 0.9)) * cv.W;
    var r = (c + h - 0.028 * sin(y * 0.0139 + 3.9) - 0.015 * sin(y * 0.0293 + 5.1) - 0.042 * spike(y * 0.0031 + 4.4)) * cv.W;
    var gmin = cv.W * 0.15;
    if (r - l < gmin) { var m2 = (l + r) * 0.5; l = m2 - gmin * 0.5; r = m2 + gmin * 0.5; }
    WLS[0] = l; WLS[1] = r;
  }
  var wlx = new Float64Array(90), wrx = new Float64Array(90);

  /* ---------------- gradients (band-cached) ---------------- */
  var bgGrad = null, bgBand = -1;
  var _c0 = [0, 0, 0], _c1 = [0, 0, 0];
  function updateBg() {
    var band = (depM / 12) | 0;
    if (band === bgBand && bgGrad) return;
    bgBand = band;
    colAt(depM, _c0); colAt(depM + cv.H / PXM, _c1);
    bgGrad = g.createLinearGradient(0, 0, 0, cv.H);
    bgGrad.addColorStop(0, rgb(_c0));
    bgGrad.addColorStop(1, rgb(_c1));
  }

  // sub-local gradients (fixed local coords, built once)
  var hullTop = mixN(cACC, [220, 235, 245], 0.35);
  var hullBot = mixN(cACC, [8, 16, 30], 0.72);
  var hullG = g.createLinearGradient(0, -13, 0, 13);
  hullG.addColorStop(0, rgb(hullTop));
  hullG.addColorStop(0.55, rgb(mixN(cACC, [30, 50, 70], 0.35)));
  hullG.addColorStop(1, rgb(hullBot));
  var towerG = g.createLinearGradient(0, -22, 0, -8);
  towerG.addColorStop(0, rgb(mixN(cACC, [180, 200, 220], 0.3)));
  towerG.addColorStop(1, rgb(mixN(cACC, [16, 26, 44], 0.6)));
  var portG = g.createRadialGradient(8, -1, 0.5, 8, -1, 6);
  portG.addColorStop(0, 'rgba(255,244,200,0.95)');
  portG.addColorStop(0.5, 'rgba(255,220,140,0.55)');
  portG.addColorStop(1, 'rgba(255,200,90,0)');

  /* ---------------- darkness mask (offscreen, half-res) ---------------- */
  var MS = 0.5, mcv = null, mg2 = null, mw = 0, mh = 0;
  var punchG = null, punchS = null, vigG = null;
  var PR = 118;   // big light radius in mask px
  function buildMask() {
    if (LOW) return;
    if (!mcv) { mcv = document.createElement('canvas'); mg2 = mcv.getContext('2d'); }
    mw = mx(2, (cv.W * MS) | 0); mh = mx(2, (cv.H * MS) | 0);
    mcv.width = mw; mcv.height = mh;
    punchG = mg2.createRadialGradient(0, 0, 0, 0, 0, PR);
    punchG.addColorStop(0, 'rgba(255,255,255,1)');
    punchG.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    punchG.addColorStop(1, 'rgba(255,255,255,0)');
    punchS = mg2.createRadialGradient(0, 0, 0, 0, 0, 30);
    punchS.addColorStop(0, 'rgba(255,255,255,0.9)');
    punchS.addColorStop(1, 'rgba(255,255,255,0)');
    vigG = g.createRadialGradient(cv.W / 2, cv.H / 2, mn(cv.W, cv.H) * 0.38, cv.W / 2, cv.H / 2, mx(cv.W, cv.H) * 0.72);
    vigG.addColorStop(0, 'rgba(0,0,0,0)');
    vigG.addColorStop(1, 'rgba(0,0,10,0.42)');
  }
  var darkStr = rgb(darkTint);

  /* ---------------- reset ---------------- */
  function reset() {
    started = false; alive = true; tGame = 0; deadT = 0;
    subWY = 80; subX = cv.W * caveC(80); vx = 0; tilt = 0; propA = 0;
    o2 = 100; o2Warned = false; pearlPts = 0; lastScore = -1;
    genY = subWY + 220; lastAirY = subWY; airGap = 1500; nextMarkM = 1;
    depM = subWY / PXM; depStrM = -1;
    keyL = keyR = false; tDir = 0; ptrs = {};
    var i;
    for (i = 0; i < pearls.length; i++) pearls[i].a = false;
    for (i = 0; i < airs.length; i++) airs[i].a = false;
    for (i = 0; i < jellies.length; i++) jellies[i].a = false;
    for (i = 0; i < anglers.length; i++) anglers[i].a = false;
    for (i = 0; i < schools.length; i++) schools[i].a = false;
    for (i = 0; i < bubbles.length; i++) bubbles[i].a = false;
    for (i = 0; i < pops.length; i++) pops[i].a = false;
    for (i = 0; i < markers.length; i++) markers[i].a = false;
    if (!LOW) for (i = 0; i < NM; i++) { moteX[i] = subX + (Math.random() - 0.5) * 400; moteY[i] = subWY + (Math.random() - 0.3) * 400; motePh[i] = Math.random() * TAU; }
    bgBand = -1; lowDarkBand = -1;
    api.score(0);
  }

  /* ---------------- input ---------------- */
  function inputDir() {
    var d = 0;
    if (keyL) d -= 1; if (keyR) d += 1;
    return mx(-1, mn(1, d + tDir));
  }
  function sumPtrs() { var s = 0; for (var k in ptrs) s += ptrs[k]; tDir = mx(-1, mn(1, s)); }
  function onDown(e) {
    if (!started && alive) { started = true; }
    ptrs[e.pointerId] = e.clientX - container.getBoundingClientRect().left < cv.W / 2 ? -1 : 1;
    sumPtrs();
  }
  function onUp(e) { if (ptrs[e.pointerId] !== undefined) { delete ptrs[e.pointerId]; sumPtrs(); } }
  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keyL = true; started = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keyR = true; started = true; e.preventDefault(); }
    else if (e.key === ' ') { started = true; e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keyL = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keyR = false;
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  /* ---------------- spawning ---------------- */
  function spawnAt(y) {
    walls(y);
    var l = WLS[0] + 34, r = WLS[1] - 34, span = r - l;
    if (span < 50) return;
    var dep = y / PXM;
    if (y - lastAirY > airGap) {
      var ap = alloc(airs);
      if (ap) { ap.a = true; ap.x = l + Math.random() * span; ap.y = y; ap.ph = Math.random() * TAU; lastAirY = y; airGap = 1350 + Math.random() * 850; return; }
    }
    var rr = Math.random();
    var jp = mn(0.30, 0.10 + dep * 0.00028);
    if (rr < 0.26) {
      var p = alloc(pearls);
      if (p) { p.a = true; p.x = l + Math.random() * span; p.y = y; p.ph = Math.random() * TAU; }
    } else if (rr < 0.26 + jp) {
      var j = alloc(jellies);
      if (j) {
        j.a = true; j.bx = l + Math.random() * span; j.x = j.bx; j.y = y + 40;
        j.ph = Math.random() * TAU; j.r = 11 + Math.random() * 11;
        j.sp = 14 + Math.random() * 18; j.sw = 18 + Math.random() * 22;
      }
    } else if (dep > 400 && rr < 0.26 + jp + 0.055) {
      var an = alloc(anglers);
      if (an) {
        an.a = true; an.x = l + Math.random() * span; an.y = y + 60;
        an.vx = (Math.random() < 0.5 ? -1 : 1) * 26; an.mode = 0; an.ct = 0; an.cool = 0;
        an.ph = Math.random() * TAU; an.face = an.vx > 0 ? 1 : -1;
      }
    } else if (!LOW && rr < 0.26 + jp + 0.055 + 0.09) {
      var s = alloc(schools);
      if (s) { s.a = true; s.x = l + span * 0.5; s.y = y + 30; s.ph = Math.random() * TAU; s.dx = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 14); }
    }
  }
  function spawnPop(x, y, txt) {
    var p = alloc(pops);
    if (p) { p.a = true; p.x = x; p.y = y; p.t = 0; p.txt = txt; }
  }
  function burst(x, y, n) {
    for (var i = 0; i < n; i++) {
      var b = alloc(bubbles);
      if (!b) return;
      b.a = true; b.x = x + (Math.random() - 0.5) * 24; b.y = y + (Math.random() - 0.5) * 18;
      b.r = 1.5 + Math.random() * 3; b.vy = 46 + Math.random() * 60;
      b.ph = Math.random() * TAU; b.max = b.life = 0.9 + Math.random() * 0.9;
    }
  }

  /* ---------------- game over ---------------- */
  function die() {
    if (!alive) return;
    alive = false; deadT = 0;
    burst(subX, subWY, 12);
    api.haptic('error');
    api.gameOver(mx(0, (depM | 0) + pearlPts));
  }

  /* ---------------- update ---------------- */
  var bubT = 0;
  function update(dt) {
    tGame += dt;
    swx = 3.5 * sin(tGame * 0.6); swy = 2.6 * sin(tGame * 0.43);
    propA += dt * (started && alive ? 22 : 6);
    var i, j, dx, dy, d2;

    if (!started) { subWY += sin(tGame * 1.2) * 0.06; camY = subWY - cv.H * 0.30; depM = subWY / PXM; return; }

    if (alive) {
      // motion with inertia
      var inp = inputDir();
      vx += inp * 780 * dt;
      vx -= vx * mn(1, 3.0 * dt);
      if (vx > 290) vx = 290; if (vx < -290) vx = -290;
      subX += vx * dt;
      var vy = 62 + mn(86, depM * 0.10);
      subWY += vy * dt;
      depM = subWY / PXM;
      tilt = mx(-0.32, mn(0.32, vx * 0.0011));

      // oxygen
      o2 -= dt * (1.28 + depM * 0.00045);
      if (o2 < 20 && !o2Warned) { o2Warned = true; api.haptic('medium'); }
      if (o2 > 45) o2Warned = false;
      if (o2 <= 0) { o2 = 0; die(); }

      // walls
      walls(subWY);
      if (subX - SUBR < WLS[0] || subX + SUBR > WLS[1]) die();
      if (alive) {
        walls(subWY - 9);
        if (subX - SUBR + 4 < WLS[0] || subX + SUBR - 4 > WLS[1]) die();
      }
      if (alive) {
        walls(subWY + 9);
        if (subX - SUBR + 4 < WLS[0] || subX + SUBR - 4 > WLS[1]) die();
      }

      // score
      var sc = (depM | 0) + pearlPts;
      if (sc !== lastScore) { lastScore = sc; api.score(sc); }

      // spawn ahead
      while (genY < subWY + cv.H + 320) { genY += 130; spawnAt(genY); }
      while (nextMarkM * 100 * PXM < subWY + cv.H + 320) {
        var mk = alloc(markers);
        if (mk) { mk.a = true; mk.y = nextMarkM * 100 * PXM; mk.txt = (nextMarkM * 100) + UNIT; }
        nextMarkM++;
      }

      // sub bubbles
      bubT -= dt;
      if (bubT <= 0) {
        bubT = LOW ? 0.14 : 0.07;
        var b = alloc(bubbles);
        if (b) {
          b.a = true; b.x = subX - 24 * cos(tilt); b.y = subWY - 24 * sin(tilt);
          b.r = 1 + Math.random() * 2.4; b.vy = 40 + Math.random() * 46;
          b.ph = Math.random() * TAU; b.max = b.life = 1.1 + Math.random() * 1.1;
        }
      }
    } else {
      deadT += dt;
    }
    camY = subWY - cv.H * 0.30;
    var cull = camY - 150, cullB = camY + cv.H + 460;

    // pearls / air: collect + cull
    for (i = 0; i < pearls.length; i++) {
      var pe = pearls[i];
      if (!pe.a) continue;
      if (pe.y < cull) { pe.a = false; continue; }
      if (alive) {
        dx = subX - pe.x; dy = subWY - pe.y;
        if (dx * dx + dy * dy < 26 * 26) {
          pe.a = false; pearlPts += 25;
          api.haptic('light');
          spawnPop(pe.x, pe.y, '+25');
          burst(pe.x, pe.y, 3);
        }
      }
    }
    for (i = 0; i < airs.length; i++) {
      var ai = airs[i];
      if (!ai.a) continue;
      if (ai.y < cull) { ai.a = false; continue; }
      if (alive) {
        dx = subX - ai.x; dy = subWY - ai.y;
        if (dx * dx + dy * dy < 36 * 36) {
          ai.a = false; o2 = mn(100, o2 + 55);
          api.haptic('success');
          spawnPop(ai.x, ai.y, '+O₂');
          burst(ai.x, ai.y, 8);
        }
      }
    }

    // jellyfish
    for (i = 0; i < jellies.length; i++) {
      var je = jellies[i];
      if (!je.a) continue;
      je.y -= je.sp * dt;
      je.x = je.bx + je.sw * sin(tGame * 0.7 + je.ph);
      if (je.y < cull) { je.a = false; continue; }
      if (alive) {
        dx = subX - je.x; dy = subWY - je.y;
        var rr2 = je.r * 0.82 + SUBR - 2;
        if (dx * dx + dy * dy < rr2 * rr2) die();
      }
    }

    // anglerfish
    for (i = 0; i < anglers.length; i++) {
      var an = anglers[i];
      if (!an.a) continue;
      if (an.y < cull || an.y > cullB) { an.a = false; continue; }
      an.cool -= dt;
      dx = subX - an.x; dy = subWY - an.y; d2 = dx * dx + dy * dy;
      if (an.mode === 0) {
        an.x += an.vx * dt;
        walls(an.y);
        if (an.x < WLS[0] + 40) { an.x = WLS[0] + 40; an.vx = ab(an.vx); }
        if (an.x > WLS[1] - 40) { an.x = WLS[1] - 40; an.vx = -ab(an.vx); }
        an.face = an.vx > 0 ? 1 : -1;
        if (alive && an.cool <= 0 && d2 < 200 * 200) { an.mode = 1; an.ct = 0; }
      } else {
        an.ct += dt;
        var dd = Math.sqrt(d2) || 1;
        an.x += (dx / dd) * 165 * dt;
        an.y += (dy / dd) * 150 * dt;
        an.face = dx > 0 ? 1 : -1;
        if (an.ct > 2.6 || d2 > 360 * 360 || !alive) { an.mode = 0; an.cool = 3.4; an.vx = an.face * 26; }
      }
      if (alive) {
        var ar = 20 + SUBR - 3;
        if (d2 < ar * ar) die();
      }
    }

    // fish schools (ambience, harmless)
    for (i = 0; i < schools.length; i++) {
      var sc2 = schools[i];
      if (!sc2.a) continue;
      sc2.x += sc2.dx * dt + 14 * sin(tGame * 0.5 + sc2.ph) * dt;
      sc2.y -= 11 * dt;
      if (sc2.y < cull) { sc2.a = false; continue; }
    }

    // bubbles
    for (i = 0; i < bubbles.length; i++) {
      var bu = bubbles[i];
      if (!bu.a) continue;
      bu.life -= dt;
      bu.y -= bu.vy * dt;
      bu.x += sin(tGame * 4 + bu.ph) * 14 * dt;
      if (bu.life <= 0 || bu.y < camY - 30) bu.a = false;
    }

    // popups
    for (i = 0; i < pops.length; i++) {
      var po = pops[i];
      if (!po.a) continue;
      po.t += dt; po.y -= 32 * dt;
      if (po.t > 0.9) po.a = false;
    }

    // markers cull
    for (i = 0; i < markers.length; i++) if (markers[i].a && markers[i].y < cull) markers[i].a = false;

    // dust motes drift near sub
    if (!LOW) {
      for (i = 0; i < NM; i++) {
        moteY[i] -= (5 + 3 * sin(motePh[i])) * dt;
        moteX[i] += sin(tGame * 0.8 + motePh[i]) * 6 * dt;
        dx = moteX[i] - subX; dy = moteY[i] - subWY;
        if (dx * dx + dy * dy > 260 * 260) {
          var aA = Math.random() * TAU, rA = 60 + Math.random() * 190;
          moteX[i] = subX + cos(aA) * rA;
          moteY[i] = subWY + sin(aA) * rA + 70;
          motePh[i] = Math.random() * TAU;
        }
      }
    }
  }

  /* ---------------- drawing ---------------- */
  function circ(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  function glow(x, y, r, col) {
    g.fillStyle = col;
    g.globalAlpha = 0.07; circ(x, y, r * 2.3);
    g.globalAlpha = 0.16; circ(x, y, r * 1.45);
    g.globalAlpha = 0.34; circ(x, y, r * 0.95);
    g.globalAlpha = 1;
  }
  var DASH = [5, 9], NODASH = [];

  function drawWalls() {
    var y0 = camY - 40;
    var n = ((cv.H + 90) / SEG | 0) + 2;
    if (n > 88) n = 88;
    for (var i = 0; i < n; i++) { walls(y0 + i * SEG); wlx[i] = WLS[0]; wrx[i] = WLS[1]; }
    // left rock mass
    g.fillStyle = rockCol;
    g.beginPath();
    g.moveTo(-40, y0 - 10);
    for (i = 0; i < n; i++) g.lineTo(wlx[i], y0 + i * SEG);
    g.lineTo(-40, y0 + (n - 1) * SEG + 10);
    g.closePath(); g.fill();
    // right rock mass
    g.beginPath();
    g.moveTo(cv.W + 40, y0 - 10);
    for (i = 0; i < n; i++) g.lineTo(wrx[i], y0 + i * SEG);
    g.lineTo(cv.W + 40, y0 + (n - 1) * SEG + 10);
    g.closePath(); g.fill();
    // lit rims
    g.lineWidth = 2;
    g.strokeStyle = rockEdge;
    g.beginPath();
    for (i = 0; i < n; i++) { if (i === 0) g.moveTo(wlx[i], y0); else g.lineTo(wlx[i], y0 + i * SEG); }
    g.stroke();
    g.beginPath();
    for (i = 0; i < n; i++) { if (i === 0) g.moveTo(wrx[i], y0); else g.lineTo(wrx[i], y0 + i * SEG); }
    g.stroke();
    // inner shade line
    g.lineWidth = 5;
    g.strokeStyle = rockEdge2;
    g.beginPath();
    for (i = 0; i < n; i++) { if (i === 0) g.moveTo(wlx[i] - 4, y0); else g.lineTo(wlx[i] - 4, y0 + i * SEG); }
    g.stroke();
    g.beginPath();
    for (i = 0; i < n; i++) { if (i === 0) g.moveTo(wrx[i] + 4, y0); else g.lineTo(wrx[i] + 4, y0 + i * SEG); }
    g.stroke();
  }

  function drawMarkers() {
    g.font = '600 11px sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.setLineDash(DASH);
    g.lineWidth = 1;
    g.strokeStyle = txtDim;
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      if (!m.a) continue;
      walls(m.y);
      g.beginPath();
      g.moveTo(WLS[0] + 10, m.y);
      g.lineTo(WLS[1] - 10, m.y);
      g.stroke();
      g.fillStyle = txtDim;
      g.fillText(m.txt, WLS[0] + 12, m.y - 6);
    }
    g.setLineDash(NODASH);
  }

  function drawPearls() {
    for (var i = 0; i < pearls.length; i++) {
      var p = pearls[i];
      if (!p.a) continue;
      var bob = 3 * sin(tGame * 1.6 + p.ph);
      glow(p.x, p.y + bob, 9, pearlGlow);
      g.fillStyle = pearlCore;
      circ(p.x, p.y + bob, 5.5);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circ(p.x - 1.7, p.y + bob - 1.8, 1.7);
    }
  }

  function drawAirs() {
    for (var i = 0; i < airs.length; i++) {
      var a = airs[i];
      if (!a.a) continue;
      var bob = 2.5 * sin(tGame * 1.2 + a.ph);
      glow(a.x, a.y + bob, 20, airCol);
      g.strokeStyle = airCol;
      g.lineWidth = 1.5;
      for (var k = 0; k < AIROFF.length; k++) {
        var o = AIROFF[k];
        var wob = 1.5 * sin(tGame * 2 + a.ph + k);
        g.globalAlpha = 0.65;
        g.beginPath();
        g.arc(a.x + o[0] + wob, a.y + o[1] + bob, o[2], 0, TAU);
        g.stroke();
        g.globalAlpha = 0.16;
        g.fillStyle = airCol;
        g.beginPath();
        g.arc(a.x + o[0] + wob, a.y + o[1] + bob, o[2], 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  }

  function drawJellies() {
    for (var i = 0; i < jellies.length; i++) {
      var j = jellies[i];
      if (!j.a) continue;
      if (j.y < camY - 60 || j.y > camY + cv.H + 60) continue;
      var pu = 1 + 0.13 * sin(tGame * 2.3 + j.ph);
      var r = j.r * pu;
      glow(j.x, j.y, j.r, jellyGlow);
      // bell
      g.fillStyle = jellyStr;
      g.beginPath();
      g.arc(j.x, j.y, r, Math.PI, 0);
      g.quadraticCurveTo(j.x + r * 0.6, j.y + r * 0.45, j.x, j.y + r * 0.32);
      g.quadraticCurveTo(j.x - r * 0.6, j.y + r * 0.45, j.x - r, j.y);
      g.closePath(); g.fill();
      g.fillStyle = jellyStr2;
      g.beginPath();
      g.arc(j.x, j.y - r * 0.15, r * 0.62, Math.PI, 0);
      g.closePath(); g.fill();
      // tentacles
      g.strokeStyle = jellyStr;
      g.lineWidth = 1.4;
      for (var t = -1; t <= 1; t++) {
        var sway = 6 * sin(tGame * 1.8 + j.ph + t);
        g.beginPath();
        g.moveTo(j.x + t * r * 0.45, j.y + r * 0.3);
        g.quadraticCurveTo(j.x + t * r * 0.5 + sway, j.y + r * 1.1, j.x + t * r * 0.4 - sway, j.y + r * 1.9);
        g.stroke();
      }
    }
  }

  function drawAnglers() {
    for (var i = 0; i < anglers.length; i++) {
      var a = anglers[i];
      if (!a.a) continue;
      if (a.y < camY - 80 || a.y > camY + cv.H + 80) continue;
      var f = a.face;
      var bob = 2.5 * sin(tGame * 2 + a.ph);
      var y = a.y + bob;
      var lx = a.x + f * 26, ly = y - 16;
      // lure glow
      glow(lx, ly, 6, lureCol);
      g.save();
      g.translate(a.x, y);
      g.scale(f, 1);
      // body
      g.fillStyle = angBody;
      g.beginPath();
      g.ellipse(0, 0, 20, 13, 0, 0, TAU);
      g.fill();
      // tail
      g.beginPath();
      g.moveTo(-17, 0); g.lineTo(-29, -9); g.lineTo(-29, 9);
      g.closePath(); g.fill();
      // belly sheen
      g.fillStyle = angBody2;
      g.beginPath();
      g.ellipse(-2, 4, 13, 6, 0, 0, TAU);
      g.fill();
      // jaw
      g.strokeStyle = angBody2;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(19, 2);
      g.quadraticCurveTo(8, 9 + (a.mode === 1 ? 3 : 0), -2, 6);
      g.stroke();
      // teeth
      g.strokeStyle = 'rgba(230,240,255,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(15, 3); g.lineTo(13, 7);
      g.moveTo(10, 5); g.lineTo(8, 9);
      g.stroke();
      // eye
      g.fillStyle = lureCol;
      circ(8, -4, 2.2);
      g.fillStyle = 'rgba(0,0,0,0.8)';
      circ(8.6, -4, 1);
      // lure stalk
      g.strokeStyle = angBody2;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(10, -11);
      g.quadraticCurveTo(20, -24, 26, -16);
      g.stroke();
      g.restore();
      // lure orb
      g.fillStyle = lureCol;
      circ(lx, ly, 3.2);
      g.fillStyle = 'rgba(255,255,255,0.9)';
      circ(lx, ly, 1.3);
    }
  }

  function drawSchools() {
    g.fillStyle = fishCol;
    for (var i = 0; i < schools.length; i++) {
      var s = schools[i];
      if (!s.a) continue;
      if (s.y < camY - 60 || s.y > camY + cv.H + 60) continue;
      for (var k = 0; k < s.fish.length; k++) {
        var fi = s.fish[k];
        var fx = s.x + fi.ra * cos(tGame * fi.sp + fi.ph);
        var fy = s.y + fi.rb * sin(tGame * fi.sp * 1.3 + fi.ph);
        var dir = -sin(tGame * fi.sp + fi.ph) >= 0 ? 1 : -1;
        g.beginPath();
        g.ellipse(fx, fy, 3.4, 1.4, 0, 0, TAU);
        g.fill();
        g.beginPath();
        g.moveTo(fx - dir * 3, fy);
        g.lineTo(fx - dir * 6, fy - 2);
        g.lineTo(fx - dir * 6, fy + 2);
        g.closePath(); g.fill();
      }
    }
  }

  function drawBubbles() {
    g.strokeStyle = bubbleCol;
    g.lineWidth = 1.2;
    for (var i = 0; i < bubbles.length; i++) {
      var b = bubbles[i];
      if (!b.a) continue;
      g.globalAlpha = mx(0, b.life / b.max) * 0.8;
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function drawMotes() {
    g.fillStyle = moteCol;
    for (var i = 0; i < NM; i++) {
      var dx = moteX[i] - subX, dy = moteY[i] - subWY;
      var d2 = dx * dx + dy * dy;
      if (d2 > 230 * 230) continue;
      g.globalAlpha = (1 - d2 / (230 * 230)) * 0.5;
      g.fillRect(moteX[i], moteY[i], 1.6, 1.6);
    }
    g.globalAlpha = 1;
  }

  function drawSub() {
    g.save();
    g.translate(subX, subWY);
    g.rotate(tilt);
    if (!alive) g.globalAlpha = mx(0.25, 1 - deadT * 1.5);
    // hull
    g.fillStyle = hullG;
    g.beginPath();
    g.ellipse(0, 0, 26, 12, 0, 0, TAU);
    g.fill();
    // belly shadow
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(0, 5, 22, 6, 0, 0, TAU);
    g.fill();
    // conning tower
    g.fillStyle = towerG;
    g.beginPath();
    g.moveTo(-7, -9);
    g.lineTo(-5, -19); g.lineTo(9, -19); g.lineTo(11, -9);
    g.closePath(); g.fill();
    // periscope
    g.fillStyle = rgb(hullBot);
    g.fillRect(0, -25, 2.5, 7);
    g.fillRect(0, -25, 6, 2.2);
    // tail fin
    g.fillStyle = towerG;
    g.beginPath();
    g.moveTo(-20, -6); g.lineTo(-30, -13); g.lineTo(-24, -1);
    g.closePath(); g.fill();
    // porthole
    g.fillStyle = portG;
    circ(8, -1, 6.5);
    g.fillStyle = 'rgba(255,238,180,0.95)';
    circ(8, -1, 3.4);
    g.strokeStyle = rgb(hullTop);
    g.lineWidth = 1.4;
    g.beginPath(); g.arc(8, -1, 4.6, 0, TAU); g.stroke();
    // headlamp housing
    g.fillStyle = 'rgba(255,246,210,0.9)';
    circ(21, 5, 2.6);
    // propeller (fake spin via scaled ellipse)
    var sp = sin(propA);
    g.save();
    g.translate(-28, 0);
    g.fillStyle = rgb(mixN(cACC, [200, 220, 235], 0.25));
    g.beginPath();
    g.ellipse(0, 0, 2.4, 9 * ab(sp) + 1.5, 0, 0, TAU);
    g.fill();
    g.fillStyle = rgb(hullBot);
    circ(0, 0, 2.6);
    g.restore();
    g.restore();
    g.globalAlpha = 1;
  }

  function drawPops() {
    g.font = '700 14px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (var i = 0; i < pops.length; i++) {
      var p = pops[i];
      if (!p.a) continue;
      g.globalAlpha = mx(0, 1 - p.t / 0.9);
      g.fillStyle = popCol;
      g.fillText(p.txt, p.x, p.y);
    }
    g.globalAlpha = 1;
  }

  function darkAlpha() { return mn(LOW ? 0.55 : 0.86, 0.22 + depM * 0.00075); }

  function punch(x, y, s, al) {
    mg2.save();
    mg2.translate((x + swx) * MS, (y - camY + swy) * MS);
    mg2.scale(s, s);
    mg2.globalAlpha = al;
    mg2.fillStyle = punchS;
    mg2.fillRect(-30, -30, 60, 60);
    mg2.restore();
  }

  function drawDarkness() {
    var da = darkAlpha();
    if (LOW) {
      var band = (depM / 25) | 0;
      if (band !== lowDarkBand) { lowDarkBand = band; lowDarkStr = rgba(darkTint, mn(0.55, 0.22 + band * 25 * 0.00075)); }
      g.fillStyle = lowDarkStr;
      g.fillRect(0, 0, cv.W, cv.H);
      // faint halo so the sub stays readable
      glow(subX + swx, subWY - camY + swy, 60, 'rgb(210,225,240)');
      return;
    }
    // opaque dark layer on mask, then punch lights out
    mg2.globalCompositeOperation = 'source-over';
    mg2.globalAlpha = 1;
    mg2.fillStyle = darkStr;
    mg2.fillRect(0, 0, mw, mh);
    mg2.globalCompositeOperation = 'destination-out';
    var sx = (subX + swx) * MS, sy = (subWY - camY + swy) * MS;
    // main halo around the sub
    mg2.save();
    mg2.translate(sx, sy);
    mg2.fillStyle = punchG;
    mg2.fillRect(-PR, -PR, PR * 2, PR * 2);
    // headlight cone, elongated downward, follows tilt
    mg2.rotate(tilt * 0.7);
    mg2.scale(0.66, 1.85);
    mg2.translate(0, PR * 0.52);
    mg2.globalAlpha = 0.85;
    mg2.fillRect(-PR, -PR, PR * 2, PR * 2);
    mg2.restore();
    // bioluminescence punches through the dark
    var i, np = 0;
    for (i = 0; i < pearls.length && np < 10; i++) {
      var p = pearls[i];
      if (p.a && p.y > camY && p.y < camY + cv.H) { punch(p.x, p.y, 0.9, 0.7); np++; }
    }
    for (i = 0; i < airs.length && np < 13; i++) {
      var a = airs[i];
      if (a.a && a.y > camY && a.y < camY + cv.H) { punch(a.x, a.y, 1.6, 0.75); np++; }
    }
    for (i = 0; i < jellies.length && np < 18; i++) {
      var j = jellies[i];
      if (j.a && j.y > camY && j.y < camY + cv.H) { punch(j.x, j.y, 1.1, 0.55); np++; }
    }
    for (i = 0; i < anglers.length; i++) {
      var an = anglers[i];
      if (an.a && an.y > camY && an.y < camY + cv.H) punch(an.x + an.face * 26, an.y - 16, 1.2, 0.8);
    }
    mg2.globalCompositeOperation = 'source-over';
    mg2.globalAlpha = 1;
    g.globalAlpha = da;
    g.drawImage(mcv, 0, 0, cv.W, cv.H);
    g.globalAlpha = 1;
    // vignette
    g.fillStyle = vigG;
    g.fillRect(0, 0, cv.W, cv.H);
  }

  function drawHUD() {
    // oxygen bar
    var bw = mn(cv.W * 0.56, 270), bh = 10;
    var bx = (cv.W - bw) / 2, by = 12;
    var frac = o2 / 100;
    var lowO2 = o2 < 25;
    var pulse = lowO2 ? 0.6 + 0.4 * sin(tGame * 8) : 1;
    g.fillStyle = barBack;
    g.beginPath();
    g.moveTo(bx + 5, by); g.lineTo(bx + bw - 5, by);
    g.arc(bx + bw - 5, by + 5, 5, -Math.PI / 2, Math.PI / 2);
    g.lineTo(bx + 5, by + bh);
    g.arc(bx + 5, by + 5, 5, Math.PI / 2, -Math.PI / 2);
    g.fill();
    g.globalAlpha = pulse;
    g.fillStyle = lowO2 ? badStr : goodStr;
    if (frac > 0.01) {
      g.beginPath();
      var fw = mx(6, bw * frac);
      g.moveTo(bx + 4, by + 1.5); g.lineTo(bx + fw - 4, by + 1.5);
      g.arc(bx + fw - 4, by + 5, 3.5, -Math.PI / 2, Math.PI / 2);
      g.lineTo(bx + 4, by + bh - 1.5);
      g.arc(bx + 4, by + 5, 3.5, Math.PI / 2, -Math.PI / 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.font = '700 10px sans-serif';
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = textStr;
    g.fillText('O₂', bx - 7, by + bh / 2 + 0.5);
    // depth counter
    var m = depM | 0;
    if (m !== depStrM) { depStrM = m; depStr = m + UNIT; }
    g.textAlign = 'right';
    g.font = '700 13px sans-serif';
    g.fillStyle = txtDim;
    g.fillText(depStr, cv.W - 12, by + bh / 2 + 1);
  }

  function drawStart() {
    g.fillStyle = 'rgba(0,4,14,0.5)';
    g.fillRect(0, 0, cv.W, cv.H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = textStr;
    g.font = 'bold 19px sans-serif';
    g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H * 0.44);
    g.font = '13px sans-serif';
    g.fillStyle = txtDim;
    g.fillText(RU ? 'Держи левую / правую сторону — рули' : 'Hold left / right side to steer',
      cv.W / 2, cv.H * 0.44 + 30);
    g.fillText(RU ? 'Собирай жемчуг, лови воздух' : 'Collect pearls, catch air pockets',
      cv.W / 2, cv.H * 0.44 + 50);
  }

  function draw() {
    updateBg();
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, cv.W, cv.H);

    g.save();
    g.translate(swx, -camY + swy);
    drawWalls();
    drawMarkers();
    drawAirs();
    drawPearls();
    if (!LOW) drawSchools();
    drawJellies();
    drawAnglers();
    if (!LOW) drawMotes();
    drawBubbles();
    drawSub();
    g.restore();

    drawDarkness();

    g.save();
    g.translate(swx, -camY + swy);
    drawPops();
    g.restore();

    drawHUD();
    if (!started && alive) drawStart();
  }

  /* ---------------- loop ---------------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = mn(0.033, (ts - last) / 1000) || 0;
    last = ts;
    update(dt);
    draw();
  }

  cv.onResize = function () {
    buildMask();
    bgBand = -1;
    // keep the sub inside the (fraction-of-width) cave after relayout
    if (alive) {
      walls(subWY);
      if (subX < WLS[0] + SUBR + 6 || subX > WLS[1] - SUBR - 6) subX = (WLS[0] + WLS[1]) * 0.5;
    }
  };

  buildMask();
  reset();
  camY = subWY - cv.H * 0.30;
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      mcv = null; mg2 = null;
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
