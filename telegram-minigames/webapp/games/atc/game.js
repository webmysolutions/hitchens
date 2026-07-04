/* ATC — radar approach control. Draw paths, land planes, avoid collisions. */
(function () {
'use strict';
MG.register('atc', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var lowEnd = api.lowEnd;
  var RU = api.lang === 'ru';
  var PI = Math.PI, TAU = PI * 2;

  /* ---------- color helpers (derive radar palette from api.colors) ---------- */
  function hexRGB(c) {
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var m = c.match(/(\d+)[^\d]+(\d+)[^\d]+(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [0, 220, 160];
  }
  function rgba(rgb, a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'; }
  function mix(a, b, t) {
    return [(a[0] + (b[0] - a[0]) * t) | 0, (a[1] + (b[1] - a[1]) * t) | 0, (a[2] + (b[2] - a[2]) * t) | 0];
  }
  var GOOD = hexRGB(C.good), ACC = hexRGB(C.accent), BAD = hexRGB(C.bad),
      TXT = hexRGB(C.text), BG = hexRGB(C.bg);
  var RADAR = mix(GOOD, ACC, 0.25);            // radar phosphor tint
  var SEA = mix(BG, RADAR, 0.05);              // field base
  var COAST = mix(BG, RADAR, 0.14);
  var HELI = mix(TXT, GOOD, 0.35);             // heli/helipad tint
  var TYPECOL = [ACC, GOOD, HELI];             // jet, prop, heli

  /* ---------- strings ---------- */
  var S_GO = RU ? 'УХОД НА ВТОРОЙ КРУГ' : 'GO AROUND';
  var S_WIND = RU ? 'ВЕТЕР' : 'WIND';
  var S_HINT = RU ? 'Веди самолёты к своим полосам' : 'Drag planes to matching strips';
  var S_JET = RU ? 'ДЖЕТ' : 'JET', S_PROP = RU ? 'ВИНТ' : 'PROP', S_HELI = RU ? 'ВЕРТ' : 'HELI';

  /* ---------- landing zones ---------- */
  var zones = [
    { kind: 0, type: 0, cx: 0, cy: 0, ang: 0, len: 0, w: 0, label: 'A', col: TYPECOL[0] },
    { kind: 0, type: 1, cx: 0, cy: 0, ang: 0, len: 0, w: 0, label: 'B', col: TYPECOL[1] },
    { kind: 1, type: 2, cx: 0, cy: 0, r: 0, label: 'H', col: TYPECOL[2] }
  ];
  var CAP = 30, CAPA = 25 * PI / 180; // capture radius / alignment cone

  /* ---------- plane pool ---------- */
  var MAXP = 10, PMAX = 112, TMAX = 9;
  var planes = [];
  for (var pi = 0; pi < MAXP; pi++) {
    planes.push({
      active: false, type: 0, x: 0, y: 0, hdg: 0, spd: 0, sepR: 22,
      path: new Float32Array(PMAX * 2), pT: 0, pH: 0, pN: 0,
      trail: new Float32Array(TMAX * 2), trH: 0, trN: 0, trT: 0,
      state: 0, landT: 0, sx: 0, sy: 0, lang: 0, roll: 0, ldur: 1,
      gaT: 0, grace: 0, warn: 0, blink: Math.random() * TAU
    });
  }
  var SPD = [82, 54, 44], SEP = [24, 22, 20];

  /* ---------- particles pool ---------- */
  var PN = lowEnd ? 28 : 64;
  var px = new Float32Array(PN), py = new Float32Array(PN),
      pvx = new Float32Array(PN), pvy = new Float32Array(PN),
      pl = new Float32Array(PN), pm = new Float32Array(PN),
      ps = new Float32Array(PN), pk = new Uint8Array(PN);
  function spawnP(kind, x, y, vx, vy, life, size) {
    for (var i = 0; i < PN; i++) if (pl[i] <= 0) {
      px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy;
      pl[i] = life; pm[i] = life; ps[i] = size; pk[i] = kind; return;
    }
  }

  /* ---------- game state ---------- */
  var score = 0, elapsed = 0, started = false, over = false, paused = false;
  var raf = 0, last = 0, now = 0;
  var spawnT = 1.2, sweepA = 0, dashOff = 0;
  var crashT = -1, crashX = 0, crashY = 0, shake = 0;
  var bannerT = 0, bannerTxt = '';
  var warnT = 0, warnX = 0, warnY = 0, warnHapT = 0, lastMile = 0;
  var windNext = 30, windAge = -1, windDur = 0, windAng = 0, windPow = 0, wdx = 0, wdy = 0;
  var sel = null, drawing = false, lastPX = 0, lastPY = 0;
  var cx = 0, cy = 0;

  /* ---------- static background (offscreen) ---------- */
  var bg = document.createElement('canvas'), bgx = bg.getContext('2d');

  function layout() {
    var W = cv.W, H = cv.H, m = Math.min(W, H);
    cx = W / 2; cy = H / 2;
    var z = zones[0];
    z.cx = W * 0.40; z.cy = H * 0.36; z.ang = -0.32; z.len = m * 0.42; z.w = 14;
    z = zones[1];
    z.cx = W * 0.60; z.cy = H * 0.64; z.ang = 1.15; z.len = m * 0.34; z.w = 12;
    z = zones[2];
    z.cx = W * 0.24; z.cy = H * 0.80; z.r = Math.max(18, m * 0.055);
    buildBG();
  }
  cv.onResize = function () { layout(); };

  function blob(bx, by, r, n, seed) {
    bgx.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = i / n * TAU;
      var rr = r * (0.7 + 0.3 * Math.sin(a * 3 + seed) + 0.18 * Math.sin(a * 7 + seed * 2.3));
      var X = bx + Math.cos(a) * rr, Y = by + Math.sin(a) * rr * 0.8;
      if (i === 0) bgx.moveTo(X, Y); else bgx.lineTo(X, Y);
    }
    bgx.closePath();
    bgx.fillStyle = rgba(COAST, 0.5);
    bgx.fill();
    bgx.strokeStyle = rgba(RADAR, 0.18);
    bgx.lineWidth = 1;
    bgx.stroke();
  }

  function buildBG() {
    var W = cv.W, H = cv.H, d = cv.dpr;
    bg.width = Math.max(1, (W * d) | 0); bg.height = Math.max(1, (H * d) | 0);
    bgx.setTransform(d, 0, 0, d, 0, 0);
    bgx.fillStyle = rgba(SEA, 1);
    bgx.fillRect(0, 0, W, H);
    // faint grid
    bgx.strokeStyle = rgba(RADAR, 0.055);
    bgx.lineWidth = 1;
    bgx.beginPath();
    var step = 46, i;
    for (i = step; i < W; i += step) { bgx.moveTo(i, 0); bgx.lineTo(i, H); }
    for (i = step; i < H; i += step) { bgx.moveTo(0, i); bgx.lineTo(W, i); }
    bgx.stroke();
    // coastline blobs for flavor
    blob(W * 0.82, H * 0.16, Math.min(W, H) * 0.22, 22, 1.7);
    blob(W * 0.10, H * 0.52, Math.min(W, H) * 0.17, 20, 4.2);
    blob(W * 0.86, H * 0.88, Math.min(W, H) * 0.15, 18, 7.9);
    // concentric range rings + cross hairs
    var maxR = Math.sqrt(cx * cx + cy * cy);
    bgx.strokeStyle = rgba(RADAR, 0.10);
    for (i = 1; i <= 4; i++) {
      bgx.beginPath();
      bgx.arc(cx, cy, maxR * i / 4, 0, TAU);
      bgx.stroke();
    }
    bgx.strokeStyle = rgba(RADAR, 0.07);
    bgx.beginPath();
    bgx.moveTo(0, cy); bgx.lineTo(W, cy);
    bgx.moveTo(cx, 0); bgx.lineTo(cx, H);
    bgx.stroke();
    // center dot
    bgx.fillStyle = rgba(RADAR, 0.3);
    bgx.beginPath(); bgx.arc(cx, cy, 2, 0, TAU); bgx.fill();
    // runways
    for (i = 0; i < 2; i++) drawRunwayBG(zones[i]);
    // helipad
    var hz = zones[2];
    bgx.strokeStyle = rgba(hz.col, 0.75);
    bgx.lineWidth = 2;
    bgx.beginPath(); bgx.arc(hz.cx, hz.cy, hz.r, 0, TAU); bgx.stroke();
    bgx.strokeStyle = rgba(hz.col, 0.28);
    bgx.lineWidth = 1;
    bgx.beginPath(); bgx.arc(hz.cx, hz.cy, hz.r + 6, 0, TAU); bgx.stroke();
    bgx.fillStyle = rgba(hz.col, 0.9);
    bgx.font = 'bold ' + (hz.r | 0) + 'px sans-serif';
    bgx.textAlign = 'center'; bgx.textBaseline = 'middle';
    bgx.fillText('H', hz.cx, hz.cy + 1);
    bgx.font = 'bold 10px sans-serif';
    bgx.fillText(S_HELI, hz.cx, hz.cy + hz.r + 15);
  }

  function drawRunwayBG(z) {
    bgx.save();
    bgx.translate(z.cx, z.cy);
    bgx.rotate(z.ang);
    var hl = z.len / 2, hw = z.w / 2;
    bgx.fillStyle = rgba(mix(BG, z.col, 0.16), 0.9);
    bgx.fillRect(-hl, -hw, z.len, z.w);
    bgx.strokeStyle = rgba(z.col, 0.65);
    bgx.lineWidth = 1.5;
    bgx.strokeRect(-hl, -hw, z.len, z.w);
    // centerline dashes
    bgx.strokeStyle = rgba(z.col, 0.5);
    bgx.lineWidth = 2;
    bgx.beginPath();
    for (var x = -hl + 8; x < hl - 8; x += 16) { bgx.moveTo(x, 0); bgx.lineTo(x + 8, 0); }
    bgx.stroke();
    // threshold bars at both ends
    bgx.lineWidth = 3;
    bgx.strokeStyle = rgba(z.col, 0.8);
    bgx.beginPath();
    bgx.moveTo(-hl + 3, -hw + 2); bgx.lineTo(-hl + 3, hw - 2);
    bgx.moveTo(hl - 3, -hw + 2); bgx.lineTo(hl - 3, hw - 2);
    bgx.stroke();
    // approach cones
    bgx.strokeStyle = rgba(z.col, 0.16);
    bgx.lineWidth = 1;
    bgx.setLineDash(DASH2);
    bgx.beginPath();
    bgx.moveTo(-hl - 34, 0); bgx.lineTo(-hl, 0);
    bgx.moveTo(hl, 0); bgx.lineTo(hl + 34, 0);
    bgx.stroke();
    bgx.setLineDash(DASH0);
    bgx.restore();
    // label
    bgx.fillStyle = rgba(z.col, 0.9);
    bgx.font = 'bold 13px sans-serif';
    bgx.textAlign = 'center'; bgx.textBaseline = 'middle';
    bgx.fillText(z.label + ' · ' + (z.type === 0 ? S_JET : S_PROP),
      z.cx, z.cy - Math.abs(Math.sin(z.ang)) * z.len * 0.5 - (z.type === 0 ? 18 : 14) - z.w);
  }

  var DASH0 = [], DASH2 = [4, 5], DASH1 = [7, 6];

  /* ---------- geometry ---------- */
  function angDiff(a, b) {
    var d = (a - b) % TAU;
    if (d > PI) d -= TAU;
    if (d < -PI) d += TAU;
    return d < 0 ? -d : d;
  }

  /* ---------- spawning ---------- */
  function airborne() {
    var n = 0;
    for (var i = 0; i < MAXP; i++) if (planes[i].active && planes[i].state !== 2) n++;
    return n;
  }
  function spawnPlane() {
    var p = null, i;
    for (i = 0; i < MAXP; i++) if (!planes[i].active) { p = planes[i]; break; }
    if (!p) return;
    var W = cv.W, H = cv.H;
    var r = Math.random();
    var type = r < 0.38 ? 0 : r < 0.74 ? 1 : 2;
    // find an entry point not too close to existing traffic
    var bx = 0, by = 0, ok = false, tries = 0;
    while (!ok && tries < 9) {
      tries++;
      var side = (Math.random() * 4) | 0, t = 0.12 + Math.random() * 0.76;
      if (side === 0) { bx = W * t; by = -18; }
      else if (side === 1) { bx = W * t; by = H + 18; }
      else if (side === 2) { bx = -18; by = H * t; }
      else { bx = W + 18; by = H * t; }
      ok = true;
      for (i = 0; i < MAXP; i++) {
        var q = planes[i];
        if (q.active && q.state !== 2) {
          var dx = q.x - bx, dy = q.y - by;
          if (dx * dx + dy * dy < 130 * 130) { ok = false; break; }
        }
      }
    }
    var tx = W * (0.3 + Math.random() * 0.4), ty = H * (0.3 + Math.random() * 0.4);
    p.active = true; p.type = type;
    p.x = bx; p.y = by;
    p.hdg = Math.atan2(ty - by, tx - bx);
    p.spd = SPD[type] * (0.92 + Math.random() * 0.16);
    p.sepR = SEP[type];
    p.pT = 0; p.pH = 0; p.pN = 0;
    p.trH = 0; p.trN = 0; p.trT = 0;
    p.state = 0; p.landT = 0; p.gaT = 0; p.grace = 1.6; p.warn = 0;
  }

  /* ---------- landing ---------- */
  function tryCapture(p) {
    if (p.pN > 0 || p.state === 2) return; // path must be finished
    for (var zi = 0; zi < 3; zi++) {
      var z = zones[zi], dx, dy;
      if (z.kind === 1) { // helipad
        dx = p.x - z.cx; dy = p.y - z.cy;
        if (dx * dx + dy * dy < (z.r + 12) * (z.r + 12)) {
          if (p.type === 2) { startLanding(p, z.cx, z.cy, p.hdg, 0, 1.4, z); return; }
          if (p.gaT <= 0 && p.type !== 2) goAround(p);
        }
        continue;
      }
      var ca = Math.cos(z.ang), sa = Math.sin(z.ang), hl = z.len / 2;
      // end 1 (landing toward +ang), end 2 (toward ang+PI)
      for (var e = 0; e < 2; e++) {
        var sgn = e === 0 ? -1 : 1;
        var ex = z.cx + ca * hl * sgn, ey = z.cy + sa * hl * sgn;
        dx = p.x - ex; dy = p.y - ey;
        if (dx * dx + dy * dy > CAP * CAP) continue;
        var la = e === 0 ? z.ang : z.ang + PI;
        if (angDiff(p.hdg, la) > CAPA) continue;
        if (p.type === z.type) { startLanding(p, ex, ey, la, z.len * 0.72, 1.7, z); return; }
        if (p.gaT <= 0) goAround(p);
      }
    }
  }
  function startLanding(p, sx, sy, ang, roll, dur, z) {
    p.state = 2; p.landT = 0;
    p.sx = sx; p.sy = sy; p.lang = ang; p.roll = roll; p.ldur = dur;
    p.hdg = ang; p.pN = 0;
    if (sel === p) { sel = null; drawing = false; }
    api.haptic('light');
    if (z) { /* keep zone col for puff via type */ }
  }
  function goAround(p) {
    p.gaT = 3.5;
    warnT = 1.6; warnX = p.x; warnY = p.y;
    api.haptic('medium');
  }
  function finishLanding(p) {
    p.active = false;
    var pts = p.type === 0 ? 15 : 10;
    score += pts;
    api.score(score);
    api.haptic('success');
    var n = lowEnd ? 5 : 10;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = 12 + Math.random() * 26;
      spawnP(2, p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.3, 2);
    }
    spawnP(0, p.x, p.y, 0, 0, 0.6, 12); // touchdown puff
    var mile = (score / 100) | 0;
    if (mile > lastMile) {
      lastMile = mile;
      bannerTxt = (mile * 100) + '!';
      bannerT = 1.8;
      api.haptic('success');
    }
  }

  /* ---------- crash ---------- */
  function crash(x, y) {
    if (crashT >= 0) return;
    crashT = 0; crashX = x; crashY = y; shake = 1;
    api.haptic('error');
    spawnP(1, x, y, 0, 0, 0.9, 8);
    spawnP(1, x, y, 0, 0, 1.2, 4);
    var n = lowEnd ? 8 : 18;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = 40 + Math.random() * 110;
      spawnP(2, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.6, 2.5);
    }
  }

  /* ---------- update ---------- */
  function update(dt) {
    elapsed += dt;
    sweepA += dt * 0.85;
    dashOff -= dt * 26;
    if (bannerT > 0) bannerT -= dt;
    if (warnT > 0) warnT -= dt;
    if (warnHapT > 0) warnHapT -= dt;
    var i, j, p, q;

    if (crashT >= 0) { // crash sequence: freeze traffic, play out fx
      crashT += dt;
      shake = Math.max(0, shake - dt * 1.8);
      updateParticles(dt);
      if (crashT > 1.1 && !over) {
        over = true;
        api.gameOver(score);
      }
      return;
    }

    // wind
    if (windAge < 0) {
      windNext -= dt;
      if (windNext <= 0) {
        windAge = 0; windDur = 8 + Math.random() * 5;
        windAng = Math.random() * TAU;
        windPow = 7 + Math.random() * 8;
      }
    } else {
      windAge += dt;
      if (windAge >= windDur) { windAge = -1; windNext = 22 + Math.random() * 18; }
    }
    var env = windAge >= 0 ? Math.sin(PI * windAge / windDur) : 0;
    wdx = Math.cos(windAng) * windPow * env;
    wdy = Math.sin(windAng) * windPow * env;

    // spawning
    spawnT -= dt;
    if (spawnT <= 0) {
      var capN = Math.min(8, 3 + ((elapsed / 28) | 0));
      if (airborne() < capN) {
        spawnPlane();
        spawnT = Math.max(2.2, 5.6 - elapsed * 0.033);
      } else spawnT = 1.0;
    }

    // planes
    for (i = 0; i < MAXP; i++) {
      p = planes[i];
      if (!p.active) continue;
      p.warn = 0;
      if (p.grace > 0) p.grace -= dt;
      if (p.gaT > 0) p.gaT -= dt;

      if (p.state === 2) { // landing anim
        p.landT += dt / p.ldur;
        var t = Math.min(1, p.landT);
        var ease = 1 - (1 - t) * (1 - t);
        p.x = p.sx + Math.cos(p.lang) * p.roll * ease;
        p.y = p.sy + Math.sin(p.lang) * p.roll * ease;
        if (p.landT >= 1) finishLanding(p);
        continue;
      }

      // follow path
      if (p.pN > 0) {
        var tx2 = p.path[p.pT * 2], ty2 = p.path[p.pT * 2 + 1];
        var ddx = tx2 - p.x, ddy = ty2 - p.y;
        var dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd < Math.max(7, p.spd * dt * 1.6)) {
          p.pT = (p.pT + 1) % PMAX; p.pN--;
          if (p.pN === 0) p.state = 0; else p.state = 1;
        } else {
          p.hdg = Math.atan2(ddy, ddx);
        }
      } else if (p.state === 0) {
        // steer back toward field if drifting away
        var mg = 26;
        if (p.grace <= 0 && (p.x < mg || p.x > cv.W - mg || p.y < mg || p.y > cv.H - mg)) {
          var want = Math.atan2(cy - p.y, cx - p.x);
          var d0 = want - p.hdg;
          while (d0 > PI) d0 -= TAU;
          while (d0 < -PI) d0 += TAU;
          var mt = 1.7 * dt;
          p.hdg += d0 > mt ? mt : d0 < -mt ? -mt : d0;
        }
      }

      p.x += Math.cos(p.hdg) * p.spd * dt + wdx * dt;
      p.y += Math.sin(p.hdg) * p.spd * dt + wdy * dt;

      // trail
      if (!lowEnd) {
        p.trT -= dt;
        if (p.trT <= 0) {
          p.trT = 0.11;
          p.trail[p.trH * 2] = p.x; p.trail[p.trH * 2 + 1] = p.y;
          p.trH = (p.trH + 1) % TMAX;
          if (p.trN < TMAX) p.trN++;
        }
      }

      tryCapture(p);
    }

    // separation / collision
    for (i = 0; i < MAXP; i++) {
      p = planes[i];
      if (!p.active || p.state === 2 || p.grace > 0) continue;
      for (j = i + 1; j < MAXP; j++) {
        q = planes[j];
        if (!q.active || q.state === 2 || q.grace > 0) continue;
        var dx = q.x - p.x, dy = q.y - p.y;
        var d2 = dx * dx + dy * dy;
        var rr = p.sepR + q.sepR;
        if (d2 < rr * 0.72 * rr * 0.72) {
          crash((p.x + q.x) / 2, (p.y + q.y) / 2);
          return;
        }
        if (d2 < (rr + 16) * (rr + 16)) {
          p.warn = 1; q.warn = 1;
          if (warnHapT <= 0) { warnHapT = 0.8; api.haptic('medium'); }
        }
      }
    }

    updateParticles(dt);
  }

  function updateParticles(dt) {
    for (var i = 0; i < PN; i++) {
      if (pl[i] <= 0) continue;
      pl[i] -= dt;
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      pvx[i] *= 0.94; pvy[i] *= 0.94;
    }
  }

  /* ---------- drawing ---------- */
  function drawSweep() {
    var maxR = Math.sqrt(cx * cx + cy * cy) + 8;
    g.save();
    g.translate(cx, cy);
    g.rotate(sweepA);
    // trailing wedges
    g.fillStyle = rgba(RADAR, 0.028);
    g.beginPath();
    g.moveTo(0, 0); g.arc(0, 0, maxR, -0.62, 0); g.closePath();
    g.fill();
    g.fillStyle = rgba(RADAR, 0.05);
    g.beginPath();
    g.moveTo(0, 0); g.arc(0, 0, maxR, -0.22, 0); g.closePath();
    g.fill();
    // leading edge
    g.strokeStyle = rgba(RADAR, 0.32);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(maxR, 0);
    g.stroke();
    g.restore();
  }

  function drawWind() {
    if (windAge < 0) return;
    var env = Math.sin(PI * windAge / windDur);
    if (env <= 0.02) return;
    var X = cx, Y = 30;
    g.save();
    g.globalAlpha = 0.35 + env * 0.55;
    g.fillStyle = rgba(TXT, 0.85);
    g.font = 'bold 10px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(S_WIND, X, Y - 16);
    g.translate(X, Y);
    g.rotate(windAng);
    g.strokeStyle = rgba(TXT, 0.9);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-11, 0); g.lineTo(9, 0);
    g.moveTo(9, 0); g.lineTo(3, -4);
    g.moveTo(9, 0); g.lineTo(3, 4);
    g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }

  function drawPath(p) {
    if (p.pN < 1) return;
    var col = TYPECOL[p.type];
    g.strokeStyle = rgba(col, sel === p ? 0.8 : 0.5);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (!lowEnd) { g.setLineDash(DASH1); g.lineDashOffset = dashOff; }
    g.beginPath();
    g.moveTo(p.x, p.y);
    var idx = p.pT;
    for (var k = 0; k < p.pN; k++) {
      g.lineTo(p.path[idx * 2], p.path[idx * 2 + 1]);
      idx = (idx + 1) % PMAX;
    }
    g.stroke();
    if (!lowEnd) g.setLineDash(DASH0);
    // endpoint marker
    var li = (p.pH + PMAX - 1) % PMAX;
    g.fillStyle = rgba(col, 0.7);
    g.beginPath();
    g.arc(p.path[li * 2], p.path[li * 2 + 1], 3, 0, TAU);
    g.fill();
  }

  function drawTrail(p) {
    if (lowEnd || p.trN < 2) return;
    var col = TYPECOL[p.type];
    var idx = (p.trH + TMAX - p.trN) % TMAX;
    for (var k = 1; k < p.trN; k++) {
      var i0 = (idx + k - 1) % TMAX, i1 = (idx + k) % TMAX;
      g.strokeStyle = rgba(col, 0.16 * k / p.trN);
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(p.trail[i0 * 2], p.trail[i0 * 2 + 1]);
      g.lineTo(p.trail[i1 * 2], p.trail[i1 * 2 + 1]);
      g.stroke();
    }
  }

  function drawPlane(p) {
    var col = TYPECOL[p.type];
    var scale = 1, alpha = 1;
    if (p.state === 2) {
      var t = Math.min(1, p.landT);
      scale = 1 - 0.6 * t;
      alpha = 1 - 0.85 * t;
    }
    g.save();
    g.translate(p.x, p.y);
    g.globalAlpha = alpha;
    // soft glow dot
    g.fillStyle = rgba(col, 0.13);
    g.beginPath(); g.arc(0, 0, 15 * scale, 0, TAU); g.fill();
    g.fillStyle = rgba(col, 0.22);
    g.beginPath(); g.arc(0, 0, 9 * scale, 0, TAU); g.fill();
    g.rotate(p.hdg);
    g.scale(scale, scale);
    g.fillStyle = rgba(col, 0.95);
    g.strokeStyle = rgba(col, 0.95);
    if (p.type === 0) { // jet: sleek triangle
      g.beginPath();
      g.moveTo(10, 0); g.lineTo(-7, 6.5); g.lineTo(-3.5, 0); g.lineTo(-7, -6.5);
      g.closePath(); g.fill();
    } else if (p.type === 1) { // prop: rounded body + straight wing
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 7); g.stroke();
      g.beginPath(); g.moveTo(-5.5, -3); g.lineTo(-5.5, 3); g.stroke();
      g.beginPath();
      g.moveTo(6, 0); g.quadraticCurveTo(6, 4, -6, 2);
      g.lineTo(-6, -2); g.quadraticCurveTo(6, -4, 6, 0);
      g.closePath(); g.fill();
      g.beginPath(); g.arc(7, 0, 1.8, 0, TAU); g.fill();
    } else { // heli: body + tail + spinning rotor
      g.beginPath(); g.arc(0, 0, 4.5, 0, TAU); g.fill();
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-3, 0); g.lineTo(-10, 0); g.stroke();
      g.beginPath(); g.moveTo(-10, -3); g.lineTo(-10, 3); g.stroke();
      var ra = now * 0.02 + p.blink;
      g.lineWidth = 1.6;
      g.strokeStyle = rgba(col, 0.8);
      g.beginPath();
      g.moveTo(Math.cos(ra) * 9, Math.sin(ra) * 9);
      g.lineTo(-Math.cos(ra) * 9, -Math.sin(ra) * 9);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    // separation warning ring
    if (p.warn) {
      var pr = p.sepR + 3 * Math.sin(now * 0.012);
      g.strokeStyle = rgba(BAD, 0.55 + 0.3 * Math.sin(now * 0.012));
      g.lineWidth = 2;
      g.beginPath(); g.arc(p.x, p.y, pr, 0, TAU); g.stroke();
    }
    // selection halo
    if (sel === p && p.state !== 2) {
      g.strokeStyle = rgba(TXT, 0.55);
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(p.x, p.y, p.sepR + 6, 0, TAU); g.stroke();
    }
  }

  function drawParticles() {
    for (var i = 0; i < PN; i++) {
      if (pl[i] <= 0) continue;
      var t = pl[i] / pm[i], k = pk[i];
      if (k === 1) { // shockwave ring
        var R = ps[i] + (1 - t) * 90;
        g.strokeStyle = rgba(TXT, t * 0.7);
        g.lineWidth = 2.5 * t + 0.5;
        g.beginPath(); g.arc(px[i], py[i], R, 0, TAU); g.stroke();
      } else if (k === 0) { // puff
        g.fillStyle = rgba(TXT, t * 0.25);
        g.beginPath(); g.arc(px[i], py[i], ps[i] + (1 - t) * 14, 0, TAU); g.fill();
      } else { // spark
        g.fillStyle = rgba(k === 2 && crashT >= 0 ? BAD : TXT, t * 0.8);
        g.beginPath(); g.arc(px[i], py[i], ps[i] * t + 0.5, 0, TAU); g.fill();
      }
    }
  }

  function draw() {
    var W = cv.W, H = cv.H, i;
    g.save();
    if (shake > 0.01) {
      var mag = shake * 7;
      g.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }
    g.drawImage(bg, 0, 0, W, H);
    if (!lowEnd) drawSweep();
    drawWind();
    for (i = 0; i < MAXP; i++) if (planes[i].active) drawPath(planes[i]);
    for (i = 0; i < MAXP; i++) if (planes[i].active) drawTrail(planes[i]);
    for (i = 0; i < MAXP; i++) if (planes[i].active) drawPlane(planes[i]);
    drawParticles();

    // go-around warning
    if (warnT > 0) {
      g.globalAlpha = Math.min(1, warnT * 1.8);
      g.fillStyle = rgba(BAD, 0.9);
      g.font = 'bold 11px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(S_GO, warnX, warnY - 26);
      g.globalAlpha = 1;
    }
    // milestone banner
    if (bannerT > 0) {
      var bt = 1.8 - bannerT;
      var a2 = bt < 0.25 ? bt / 0.25 : bannerT < 0.5 ? bannerT / 0.5 : 1;
      g.globalAlpha = a2;
      g.fillStyle = rgba(RADAR, 0.95);
      g.font = 'bold ' + ((30 + 6 * Math.min(1, bt * 3)) | 0) + 'px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(bannerTxt, cx, H * 0.3);
      g.globalAlpha = 1;
    }
    // crash flash
    if (crashT >= 0 && crashT < 0.25) {
      g.fillStyle = rgba(TXT, (0.25 - crashT) * 2.2);
      g.fillRect(-10, -10, W + 20, H + 20);
    }
    g.restore();

    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = C.text;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 20px sans-serif';
      g.fillText(api.t('tap_to_start'), cx, cy - 14);
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.fillText(S_HINT, cx, cy + 16);
      // legend
      g.font = '12px sans-serif';
      g.fillStyle = rgba(TYPECOL[0], 1);
      g.fillText('▲ ' + S_JET + ' → A', cx, cy + 48);
      g.fillStyle = rgba(TYPECOL[1], 1);
      g.fillText('● ' + S_PROP + ' → B', cx, cy + 68);
      g.fillStyle = rgba(TYPECOL[2], 1);
      g.fillText('✚ ' + S_HELI + ' → H', cx, cy + 88);
    }
  }

  /* ---------- input ---------- */
  function evtXY(e) {
    var r = container.getBoundingClientRect();
    lastPX = e.clientX - r.left;
    lastPY = e.clientY - r.top;
  }
  function onDown(e) {
    if (e.preventDefault) e.preventDefault();
    if (!started) { started = true; return; }
    if (over || crashT >= 0 || paused) return;
    evtXY(e);
    // nearest plane within generous radius
    var best = null, bd = 46 * 46;
    for (var i = 0; i < MAXP; i++) {
      var p = planes[i];
      if (!p.active || p.state === 2) continue;
      var dx = p.x - lastPX, dy = p.y - lastPY;
      var d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = p; }
    }
    if (best) {
      sel = best; drawing = true;
      best.pT = 0; best.pH = 0; best.pN = 0; // redraw: clear old path
    }
  }
  function onMove(e) {
    if (!drawing || !sel || !sel.active || sel.state === 2) return;
    if (e.preventDefault) e.preventDefault();
    evtXY(e);
    var p = sel;
    var refX, refY;
    if (p.pN > 0) {
      var li = (p.pH + PMAX - 1) % PMAX;
      refX = p.path[li * 2]; refY = p.path[li * 2 + 1];
    } else { refX = p.x; refY = p.y; }
    var dx = lastPX - refX, dy = lastPY - refY;
    if (dx * dx + dy * dy >= 12 * 12 && p.pN < PMAX - 1) {
      var X = lastPX < 4 ? 4 : lastPX > cv.W - 4 ? cv.W - 4 : lastPX;
      var Y = lastPY < 4 ? 4 : lastPY > cv.H - 4 ? cv.H - 4 : lastPY;
      p.path[p.pH * 2] = X; p.path[p.pH * 2 + 1] = Y;
      p.pH = (p.pH + 1) % PMAX; p.pN++;
      p.state = 1;
    }
  }
  function onUp() {
    drawing = false;
    if (sel && sel.pN === 0) sel = null;
  }
  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', onDown);
  container.addEventListener('pointermove', onMove);
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') { started = true; e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  /* ---------- main loop ---------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    now = ts;
    if (paused) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (started && !over) update(dt);
    draw();
  }

  layout();
  api.score(0);
  // pre-seed a couple of planes so the radar isn't empty at start
  spawnPlane();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      container.removeEventListener('pointerdown', onDown);
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerup', onUp);
      container.removeEventListener('pointercancel', onUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
