/* Tower Defense — grid TD with procedural path, 4 tower types, 20 waves. */
(function () {
'use strict';

/*__PURE_START__*/
/* Deterministic rng (mulberry32). */
function mulberry(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* Winding top->bottom path. Rows only ever increase and each row holds one
   contiguous horizontal run -> connected, in bounds, never self-crossing.
   Total path cells capped at 40% of the grid (>=60% buildable). */
function genPath(cols, rows, rng) {
  var maxCells = Math.floor(cols * rows * 0.4);
  var cells = [];
  var c = 1 + Math.floor(rng() * (cols - 2));
  var r = 0;
  cells.push({ x: c, y: r });
  var dir = c < cols / 2 ? 1 : -1;
  while (r < rows - 1) {
    var down = 1 + (rng() < 0.3 ? 1 : 0);
    for (var i = 0; i < down && r < rows - 1; i++) { r++; cells.push({ x: c, y: r }); }
    if (r >= rows - 1) break;
    var maxRun = dir > 0 ? cols - 2 - c : c - 1;
    if (maxRun <= 0) { dir = -dir; maxRun = dir > 0 ? cols - 2 - c : c - 1; }
    var run = Math.min(maxRun, 2 + Math.floor(rng() * 3));
    var budget = maxCells - cells.length - (rows - 1 - r);
    if (run > budget) run = budget;
    for (i = 0; i < run; i++) { c += dir; cells.push({ x: c, y: r }); }
    dir = -dir;
  }
  return cells;
}
/* Enemy hp multiplier per wave — strictly increasing. */
function hpMul(w) { return (1 + 0.16 * (w - 1)) * Math.pow(1.115, w - 1); }
/* Wave composition: r runner, s soldier, t tank, h healer, b boss. */
function waveComp(w) {
  return {
    r: 5 + Math.floor(w * 1.4),
    s: w >= 2 ? 2 + w : 0,
    t: w >= 4 ? Math.floor((w - 2) / 2) : 0,
    h: w >= 6 ? 1 + Math.floor((w - 6) / 3) : 0,
    b: (w % 5 === 0) ? 1 : 0
  };
}
/*__PURE_END__*/

MG.register('defense', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';
  var LOW = api.lowEnd;

  /* ================= colors ================= */
  function hx(s) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((s || '').trim());
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    var d = (s || '').match(/\d+/g);
    if (d && d.length >= 3) return [+d[0], +d[1], +d[2]];
    return [128, 128, 128];
  }
  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function css(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
  function rgba(a, al) { return 'rgba(' + a[0] + ',' + a[1] + ',' + a[2] + ',' + al + ')'; }
  function r2h(c) {
    var r = c[0] / 255, gg = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    var h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }
  function h2r(h) {
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var H = h[0], S = Math.max(0, Math.min(1, h[1])), L = Math.max(0, Math.min(1, h[2]));
    if (S === 0) { var v = Math.round(L * 255); return [v, v, v]; }
    var q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
    return [Math.round(f(p, q, H + 1 / 3) * 255), Math.round(f(p, q, H) * 255), Math.round(f(p, q, H - 1 / 3) * 255)];
  }
  function hueTo(c, deg, sMul, lMul) {
    var h = r2h(c);
    h[0] = ((deg / 360) % 1 + 1) % 1;
    if (sMul) h[1] *= sMul;
    if (lMul) h[2] *= lMul;
    return h2r(h);
  }

  var BG = hx(C.bg), TEXTC = hx(C.text), MUT = hx(C.muted), ACC = hx(C.accent), GOOD = hx(C.good), BAD = hx(C.bad), PAN2 = hx(C.panel2);
  var GRASS_A = mix(GOOD, BG, 0.68), GRASS_B = mix(GOOD, BG, 0.74);
  var brown = mix(hueTo(GOOD, 34, 0.9, 0.85), BG, 0.22);
  var ROAD = css(brown), ROAD_D = css(mix(brown, [0, 0, 0], 0.4)), ROAD_L = rgba(mix(brown, [255, 255, 255], 0.35), 0.35);
  var GOLDA = hueTo(GOOD, 46, 1.6, 1.25), GOLD = css(GOLDA);
  /* tower colors: archer / cannon / frost / tesla */
  var TCOLA = [GOOD, hueTo(BAD, 28, 1.1, 1.05), mix(ACC, TEXTC, 0.45), hueTo(ACC, 185, 1.1, 1.1)];
  var TCOL = [css(TCOLA[0]), css(TCOLA[1]), css(TCOLA[2]), css(TCOLA[3])];
  /* enemy colors: runner / soldier / tank / healer / boss */
  var ECOLA = [hueTo(BAD, 40, 1.1, 1.1), BAD, mix(MUT, BG, 0.25), mix(GOOD, TEXTC, 0.3), hueTo(BAD, 322, 1.1, 0.95)];
  var ECOL = [css(ECOLA[0]), css(ECOLA[1]), css(ECOLA[2]), css(ECOLA[3]), css(ECOLA[4])];
  var FROSTS = css(mix(ACC, TEXTC, 0.55));
  var RANGE_F = rgba(ACC, 0.1), RANGE_S = rgba(ACC, 0.4);
  var DIM = 'rgba(0,0,0,0.45)';

  /* ================= constants ================= */
  var COLS = 9, ROWS = 13, WAVES = 20, STEP = 1000 / 60;
  var TDEF = [
    { icon: '🏹', nm: RU ? 'Лучник' : 'Archer', cost: 50, up: [45, 70], dmg: [8, 15, 26], rate: [2.4, 2.9, 3.5], rng: [2.2, 2.5, 2.9] },
    { icon: '💣', nm: RU ? 'Пушка' : 'Cannon', cost: 90, up: [75, 115], dmg: [24, 44, 76], rate: [0.65, 0.75, 0.9], rng: [2.2, 2.5, 2.9], splash: 1.15 },
    { icon: '❄️', nm: RU ? 'Мороз' : 'Frost', cost: 60, up: [50, 80], dmg: [0, 0, 0], slow: [0.42, 0.52, 0.62], rate: [0.6, 0.7, 0.8], rng: [1.8, 2.1, 2.4] },
    { icon: '⚡', nm: RU ? 'Тесла' : 'Tesla', cost: 120, up: [100, 150], dmg: [18, 32, 55], rate: [1.0, 1.15, 1.35], rng: [2.4, 2.7, 3.0], chain: 3 }
  ];
  var EDEF = [
    { hp: 26, spd: 2.3, bty: 8, r: 0.24 },
    { hp: 62, spd: 1.4, bty: 12, r: 0.29 },
    { hp: 185, spd: 0.85, bty: 22, r: 0.36, sres: 0.5 },
    { hp: 78, spd: 1.15, bty: 16, r: 0.29, heal: 2 },
    { hp: 560, spd: 0.55, bty: 90, r: 0.46, boss: true }
  ];

  /* ================= state ================= */
  var raf = 0, last = 0, acc = 0, paused = false, started = false;
  var phase = 'build';           /* build | wave | over */
  var wave = 1;                  /* wave being played / upcoming */
  var done = 0;                  /* completed waves */
  var gold = 220, lives = 20, kills = 0;
  var cd = 6, speed = 1, seed = (Math.random() * 0x7fffffff) | 0;
  var shakeT = 0, shakeM = 0, redF = 0, simT = 0;
  var sel = null;                /* {kind:'cell'|'tower', cx, cy, tw} */
  var lastLifeHap = 0;

  /* layout */
  var TH = 46, PS = 26, BB = 62;
  var cell = 30, ox = 0, oy = 0, gw = 0, gh = 0;
  var grass = null;

  /* path */
  var pathCells = [], isPath = [], towerAt = {};
  var wpx = [], wpy = [], cum = [], nWp = 0, totalLen = 0;

  var towers = [];

  /* ================= pools ================= */
  var enemies = [], eN = 0, uidC = 1;
  var projs = [], pN = 0;
  var parts = [], paN = 0, PART_CAP = LOW ? 110 : 240;
  var flts = [], flN = 0;
  var fxs = [], fxN = 0;
  var qT = new Int8Array(220), qG = new Float32Array(220), qN = 0, qI = 0, spawnT = 0, waveTotal = 0;

  function eGet() {
    var e;
    if (eN < enemies.length) e = enemies[eN];
    else { e = { type: 0, uid: 0, hp: 0, mhp: 0, x: 0, y: 0, px: 0, py: 0, dist: 0, wpI: 0, slow: 0, slowT: 0, hurt: 0, ph: 0, ht: 0, leak: false }; enemies.push(e); }
    eN++;
    return e;
  }
  function eDel(i) { eN--; var t = enemies[i]; enemies[i] = enemies[eN]; enemies[eN] = t; }
  function pGet() {
    var p;
    if (pN < projs.length) p = projs[pN];
    else { p = { k: 0, x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, tx: 0, ty: 0, t: 0, T: 1, dmg: 0, spd: 0, ttl: 0, tgt: null, tuid: 0, spl: 0, hm: 0 }; projs.push(p); }
    pN++;
    return p;
  }
  function pDel(i) { pN--; var t = projs[i]; projs[i] = projs[pN]; projs[pN] = t; projs[pN].tgt = null; }
  function paGet() {
    if (paN >= PART_CAP) return null;
    var p;
    if (paN < parts.length) p = parts[paN];
    else { p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, T: 1, col: '', sz: 1, gr: 0 }; parts.push(p); }
    paN++;
    return p;
  }
  function paDel(i) { paN--; var t = parts[i]; parts[i] = parts[paN]; parts[paN] = t; }
  function flGet() {
    var f;
    if (flN < flts.length) f = flts[flN];
    else { f = { x: 0, y: 0, txt: '', life: 0, T: 1, col: '', big: false }; flts.push(f); }
    flN++;
    return f;
  }
  function flDel(i) { flN--; var t = flts[i]; flts[i] = flts[flN]; flts[flN] = t; }
  function fxGet() {
    var f;
    if (fxN < fxs.length) f = fxs[fxN];
    else { f = { k: 0, x: 0, y: 0, r0: 0, r1: 0, life: 0, T: 1, col: '', p: new Float32Array(32), n: 0 }; fxs.push(f); }
    fxN++;
    return f;
  }
  function fxDel(i) { fxN--; var t = fxs[i]; fxs[i] = fxs[fxN]; fxs[fxN] = t; }

  function burst(x, y, col, n, sp) {
    if (LOW) n = (n / 2) | 0;
    for (var i = 0; i < n; i++) {
      var p = paGet();
      if (!p) return;
      var a = Math.random() * 6.283, v = sp * (0.4 + Math.random() * 0.8);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - sp * 0.3;
      p.T = p.life = 0.35 + Math.random() * 0.3;
      p.col = col; p.sz = 1.5 + Math.random() * 2; p.gr = 6;
    }
  }
  function floater(x, y, txt, col, big) {
    var f = flGet();
    f.x = x; f.y = y; f.txt = txt; f.col = col; f.big = !!big;
    f.T = f.life = big ? 1.4 : 0.9;
  }
  function fxRing(x, y, r1, col, k) {
    var f = fxGet();
    f.k = k || 0; f.x = x; f.y = y; f.r0 = 0.15; f.r1 = r1; f.col = col;
    f.T = f.life = f.k === 1 ? 0.45 : 0.3;
  }
  var arcPts = new Float32Array(8);
  function fxArc(nA) {
    var f = fxGet();
    f.k = 2; f.T = f.life = 0.15; f.col = TCOL[3];
    var m = 0;
    for (var s = 0; s < nA - 1; s++) {
      var x0 = arcPts[s * 2], y0 = arcPts[s * 2 + 1], x1 = arcPts[s * 2 + 2], y1 = arcPts[s * 2 + 3];
      for (var j = 0; j < 4; j++) {
        var tt = j / 4;
        var xx = x0 + (x1 - x0) * tt, yy = y0 + (y1 - y0) * tt;
        if (j > 0) { xx += (Math.random() - 0.5) * 0.3; yy += (Math.random() - 0.5) * 0.3; }
        f.p[m++] = xx; f.p[m++] = yy;
      }
    }
    f.p[m++] = arcPts[(nA - 1) * 2]; f.p[m++] = arcPts[(nA - 1) * 2 + 1];
    f.n = m >> 1;
  }
  function shake(m) { if (LOW) return; shakeM = Math.max(shakeM, m); shakeT = 0.35; }

  /* ================= path / layout ================= */
  function setupPath() {
    pathCells = genPath(COLS, ROWS, mulberry(seed));
    isPath = [];
    var i;
    for (i = 0; i < COLS * ROWS; i++) isPath[i] = false;
    for (i = 0; i < pathCells.length; i++) isPath[pathCells[i].y * COLS + pathCells[i].x] = true;
    wpx = [pathCells[0].x + 0.5]; wpy = [-0.9];
    for (i = 0; i < pathCells.length; i++) { wpx.push(pathCells[i].x + 0.5); wpy.push(pathCells[i].y + 0.5); }
    wpx.push(pathCells[pathCells.length - 1].x + 0.5); wpy.push(ROWS + 0.9);
    nWp = wpx.length;
    cum = [0];
    for (i = 1; i < nWp; i++) cum.push(cum[i - 1] + Math.abs(wpx[i] - wpx[i - 1]) + Math.abs(wpy[i] - wpy[i - 1]));
    totalLen = cum[nWp - 1];
  }
  var smp = { x: 0, y: 0 };
  function sample(d) {
    if (d <= 0) { smp.x = wpx[0]; smp.y = wpy[0]; return; }
    var i = 0;
    while (i < nWp - 2 && d > cum[i + 1]) i++;
    var seg = cum[i + 1] - cum[i];
    var t = seg > 0 ? (d - cum[i]) / seg : 0;
    if (t > 1) t = 1;
    smp.x = wpx[i] + (wpx[i + 1] - wpx[i]) * t;
    smp.y = wpy[i] + (wpy[i + 1] - wpy[i]) * t;
  }

  function layout() {
    cell = Math.floor(Math.min((cv.W - 8) / COLS, (cv.H - TH - PS - BB - 10) / ROWS));
    if (cell < 10) cell = 10;
    gw = cell * COLS; gh = cell * ROWS;
    ox = Math.floor((cv.W - gw) / 2);
    oy = TH + PS + Math.floor((cv.H - TH - PS - BB - gh) / 2);
    makeGrass();
  }
  cv.onResize = function () { layout(); };

  function rr(o, x, y, w, h, r) {
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    o.beginPath();
    o.moveTo(x + r, y);
    o.arcTo(x + w, y, x + w, y + h, r);
    o.arcTo(x + w, y + h, x, y + h, r);
    o.arcTo(x, y + h, x, y, r);
    o.arcTo(x, y, x + w, y, r);
    o.closePath();
  }

  function makeGrass() {
    grass = document.createElement('canvas');
    grass.width = Math.max(1, gw * cv.dpr);
    grass.height = Math.max(1, gh * cv.dpr);
    var o = grass.getContext('2d');
    o.scale(cv.dpr, cv.dpr);
    o.fillStyle = css(GRASS_A);
    o.fillRect(0, 0, gw, gh);
    o.fillStyle = css(GRASS_B);
    var r, c, i;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) if ((r + c) & 1) o.fillRect(c * cell, r * cell, cell, cell);
    /* speckles + tufts */
    var rng = mulberry(seed ^ 0x9e3779);
    var n = LOW ? 140 : 420;
    var dk = rgba(mix(GRASS_A, [0, 0, 0], 0.5), 0.3), lt = rgba(mix(GOOD, TEXTC, 0.2), 0.22);
    for (i = 0; i < n; i++) {
      o.fillStyle = (i & 1) ? dk : lt;
      o.fillRect(rng() * gw, rng() * gh, 1 + rng() * 2, 1 + rng());
    }
    o.strokeStyle = rgba(mix(GOOD, TEXTC, 0.15), 0.25);
    o.lineWidth = 1;
    for (i = 0; i < (LOW ? 25 : 70); i++) {
      var tx = rng() * gw, ty = rng() * gh, th = 2 + rng() * 3;
      o.beginPath(); o.moveTo(tx, ty); o.lineTo(tx + (rng() - 0.5) * 3, ty - th); o.stroke();
    }
    /* worn road with rounded corners */
    o.lineJoin = 'round'; o.lineCap = 'round';
    function road() {
      o.beginPath();
      o.moveTo(wpx[0] * cell, wpy[0] * cell);
      for (var j = 1; j < nWp; j++) o.lineTo(wpx[j] * cell, wpy[j] * cell);
    }
    road(); o.strokeStyle = rgba(mix(GOOD, TEXTC, 0.35), 0.16); o.lineWidth = cell * 0.98; o.stroke(); /* edge highlight */
    road(); o.strokeStyle = ROAD_D; o.lineWidth = cell * 0.86; o.stroke();
    road(); o.strokeStyle = ROAD; o.lineWidth = cell * 0.7; o.stroke();
    road(); o.strokeStyle = ROAD_L; o.lineWidth = cell * 0.1; o.setLineDash([cell * 0.35, cell * 0.55]); o.stroke();
    o.setLineDash([]);
    /* pebbles + wear */
    for (i = 0; i < pathCells.length; i++) {
      var px = (pathCells[i].x + 0.5) * cell, py = (pathCells[i].y + 0.5) * cell;
      for (var k = 0; k < (LOW ? 1 : 3); k++) {
        o.fillStyle = k & 1 ? rgba(mix(brown, [0, 0, 0], 0.3), 0.5) : rgba(mix(brown, [255, 255, 255], 0.3), 0.4);
        o.beginPath();
        o.arc(px + (rng() - 0.5) * cell * 0.5, py + (rng() - 0.5) * cell * 0.5, 1 + rng() * 1.6, 0, 6.283);
        o.fill();
      }
    }
    /* portal glows at entry / exit */
    var g1 = o.createRadialGradient(wpx[0] * cell, 0, 0, wpx[0] * cell, 0, cell);
    g1.addColorStop(0, rgba(BAD, 0.4)); g1.addColorStop(1, rgba(BAD, 0));
    o.fillStyle = g1; o.fillRect(wpx[0] * cell - cell, 0, cell * 2, cell);
    var g2 = o.createRadialGradient(wpx[nWp - 1] * cell, gh, 0, wpx[nWp - 1] * cell, gh, cell);
    g2.addColorStop(0, rgba(ACC, 0.4)); g2.addColorStop(1, rgba(ACC, 0));
    o.fillStyle = g2; o.fillRect(wpx[nWp - 1] * cell - cell, gh - cell, cell * 2, cell);
  }

  /* ================= game setup ================= */
  function towerInvested(t) {
    var d = TDEF[t.t];
    return d.cost + (t.lvl >= 1 ? d.up[0] : 0) + (t.lvl >= 2 ? d.up[1] : 0);
  }
  function addTower(tt, cx, cy, lvl) {
    var t = { t: tt, lvl: lvl || 0, cx: cx, cy: cy, x: cx + 0.5, y: cy + 0.5, cdn: 0, ang: -1.57, pop: 1, flash: 0 };
    towers.push(t);
    towerAt[cy * COLS + cx] = t;
    return t;
  }
  function persist() {
    if (phase === 'over') return;
    var ts = [];
    for (var i = 0; i < towers.length; i++) ts.push([towers[i].t, towers[i].lvl, towers[i].cx, towers[i].cy]);
    api.save({ v: 1, seed: seed, wave: done, gold: gold, lives: lives, kills: kills, towers: ts });
  }
  function reportScore() { api.score(Math.max(0, kills + done * 50)); }

  (function init() {
    var sv = null;
    try { sv = api.load(); } catch (e) { sv = null; }
    if (sv && sv.v === 1 && sv.wave >= 0 && sv.wave < WAVES && sv.lives > 0 && sv.towers) {
      seed = sv.seed | 0;
      done = sv.wave | 0;
      gold = Math.max(0, sv.gold | 0);
      lives = Math.max(1, sv.lives | 0);
      kills = Math.max(0, sv.kills | 0);
      wave = done + 1;
      setupPath();
      for (var i = 0; i < sv.towers.length; i++) {
        var a = sv.towers[i];
        if (a && a.length === 4 && a[0] >= 0 && a[0] < 4 && !isPath[a[3] * COLS + a[2]] && !towerAt[a[3] * COLS + a[2]] &&
            a[2] >= 0 && a[2] < COLS && a[3] >= 0 && a[3] < ROWS)
          addTower(a[0], a[2], a[3], Math.min(2, Math.max(0, a[1])));
      }
      for (i = 0; i < towers.length; i++) towers[i].pop = 0;
    } else setupPath();
    layout();
    reportScore();
  })();

  /* ================= waves ================= */
  function buildQueue(w) {
    qN = 0; qI = 0; spawnT = 0.4;
    function q(t, gap) { if (qN < qT.length) { qT[qN] = t; qG[qN] = gap; qN++; } }
    var cp = waveComp(w);
    var nr = cp.r, ns = cp.s, nt = cp.t, nh = cp.h, i;
    var front = nr >> 1;
    for (i = 0; i < front; i++) q(0, 0.55);
    nr -= front;
    var k = 0;
    while (ns > 0 || nr > 0 || nt > 0 || nh > 0) {
      if (ns > 0) { q(1, 0.85); ns--; }
      if (nr > 0) { q(0, 0.5); nr--; }
      if ((k & 1) === 1) {
        if (nt > 0) { q(2, 1.35); nt--; }
        if (nh > 0) { q(3, 0.9); nh--; }
      }
      k++;
    }
    if (cp.b) q(4, 2.2);
    waveTotal = qN;
  }
  function startWave() {
    if (phase !== 'build') return;
    wave = done + 1;
    buildQueue(wave);
    phase = 'wave';
    floater(ox + gw / 2, oy + gh * 0.3, (RU ? 'Волна ' : 'Wave ') + wave, C.text, true);
    api.haptic('light');
  }
  function spawnEnemy(tt) {
    var d = EDEF[tt], e = eGet();
    e.type = tt; e.uid = uidC++;
    var m = hpMul(wave);
    e.mhp = e.hp = Math.round(d.hp * m);
    e.dist = 0; e.wpI = 0; e.slow = 0; e.slowT = 0; e.hurt = 0;
    e.ph = Math.random() * 6.28; e.ht = 0; e.leak = false;
    sample(0); e.x = e.px = smp.x; e.y = e.py = smp.y;
  }
  function waveCleared() {
    done = wave;
    gold += 25;
    floater(ox + gw / 2, oy + gh * 0.4, '+25', GOLD, true);
    api.haptic('success');
    reportScore();
    if (done >= WAVES) { endGame(true); return; }
    phase = 'build';
    cd = 6;
    persist();
  }
  function endGame(win) {
    if (phase === 'over') return;
    phase = 'over';
    sel = null;
    api.save(null);
    var sc = Math.max(0, Math.round(kills + done * 50 + Math.max(0, lives) * 10));
    api.haptic(win ? 'success' : 'error');
    api.gameOver(sc, { win: win });
  }

  /* ================= combat ================= */
  function bestTarget(x, y, rngSq) {
    var best = null, bd = -1;
    for (var i = 0; i < eN; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      var dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > rngSq) continue;
      if (e.dist > bd) { bd = e.dist; best = e; }
    }
    return best;
  }
  function hurt(e, amt, splash) {
    if (splash && EDEF[e.type].sres) amt *= EDEF[e.type].sres;
    e.hp -= amt;
    e.hurt = 0.12;
  }
  function tickTowers(dt) {
    for (var i = 0; i < towers.length; i++) {
      var t = towers[i];
      if (t.pop > 0) t.pop -= dt * 2.4;
      if (t.flash > 0) t.flash -= dt;
      t.cdn -= dt;
      if (t.cdn > 0 || phase === 'over') continue;
      var d = TDEF[t.t], L = t.lvl, R = d.rng[L], R2 = R * R;
      if (t.t === 2) { /* frost pulse */
        var any = false;
        for (var j = 0; j < eN; j++) {
          var e = enemies[j];
          if (e.hp <= 0) continue;
          var dx = e.x - t.x, dy = e.y - t.y;
          if (dx * dx + dy * dy > R2) continue;
          var sl = d.slow[L];
          if (EDEF[e.type].boss) sl *= 0.5;
          if (sl > e.slow) e.slow = sl;
          e.slowT = 1.6;
          any = true;
        }
        if (any) { t.cdn = 1 / d.rate[L]; t.flash = 0.12; fxRing(t.x, t.y, R, FROSTS, 1); }
        else t.cdn = 0.12;
      } else if (t.t === 3) { /* tesla chain */
        var e0 = bestTarget(t.x, t.y, R2);
        if (!e0) { t.cdn = 0.1; continue; }
        arcPts[0] = t.x; arcPts[1] = t.y - 0.28;
        arcPts[2] = e0.x; arcPts[3] = e0.y;
        var nA = 2, prev = e0, c1 = null, c2 = null;
        hurt(e0, d.dmg[L], false);
        for (var c = 1; c < d.chain; c++) {
          var bn = null, bnd = 4.4; /* 2.1^2 */
          for (j = 0; j < eN; j++) {
            var ee = enemies[j];
            if (ee.hp <= 0 || ee === e0 || ee === c1 || ee === c2) continue;
            var ddx = ee.x - prev.x, ddy = ee.y - prev.y, dd = ddx * ddx + ddy * ddy;
            if (dd < bnd) { bnd = dd; bn = ee; }
          }
          if (!bn) break;
          if (c === 1) c1 = bn; else c2 = bn;
          arcPts[nA * 2] = bn.x; arcPts[nA * 2 + 1] = bn.y; nA++;
          hurt(bn, d.dmg[L] * Math.pow(0.72, c), false);
          prev = bn;
        }
        fxArc(nA);
        t.ang = Math.atan2(e0.y - t.y, e0.x - t.x);
        t.flash = 0.1;
        t.cdn = 1 / d.rate[L];
      } else { /* archer / cannon */
        var tg = bestTarget(t.x, t.y, R2);
        if (!tg) { t.cdn = 0.08; continue; }
        t.ang = Math.atan2(tg.y - t.y, tg.x - t.x);
        t.flash = 0.09;
        t.cdn = 1 / d.rate[L];
        var p = pGet();
        if (t.t === 0) {
          p.k = 0; p.x = p.px = t.x; p.y = p.py = t.y;
          p.spd = 11; p.dmg = d.dmg[L]; p.tgt = tg; p.tuid = tg.uid; p.ttl = 1.2;
          var dl = Math.max(0.001, Math.sqrt((tg.x - t.x) * (tg.x - t.x) + (tg.y - t.y) * (tg.y - t.y)));
          p.tx = (tg.x - t.x) / dl * p.spd; p.ty = (tg.y - t.y) / dl * p.spd;
        } else {
          /* predict along path */
          var fl = Math.sqrt((tg.x - t.x) * (tg.x - t.x) + (tg.y - t.y) * (tg.y - t.y)) / 6.5;
          var v = EDEF[tg.type].spd * (tg.slowT > 0 ? 1 - tg.slow : 1);
          var pd = Math.min(totalLen - 0.05, tg.dist + v * fl);
          sample(pd);
          p.k = 1; p.sx = t.x; p.sy = t.y; p.x = p.px = t.x; p.y = p.py = t.y;
          p.tx = smp.x; p.ty = smp.y; p.t = 0;
          p.T = Math.max(0.18, Math.sqrt((smp.x - t.x) * (smp.x - t.x) + (smp.y - t.y) * (smp.y - t.y)) / 6.5);
          p.dmg = d.dmg[L]; p.spl = d.splash; p.hm = 0.5;
        }
      }
    }
  }
  function explode(p) {
    fxRing(p.tx, p.ty, p.spl, TCOL[1], 0);
    burst(p.tx, p.ty, TCOL[1], 10, 3.2);
    var R2 = p.spl * p.spl;
    for (var i = 0; i < eN; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      var dx = e.x - p.tx, dy = e.y - p.ty, dd = dx * dx + dy * dy;
      if (dd > R2) continue;
      hurt(e, p.dmg * (1 - 0.45 * Math.sqrt(dd) / p.spl), true);
    }
  }
  function tickProjs(dt) {
    for (var i = pN - 1; i >= 0; i--) {
      var p = projs[i];
      p.px = p.x; p.py = p.y;
      if (p.k === 0) {
        var e = p.tgt;
        var ok = e && e.uid === p.tuid && e.hp > 0;
        if (ok) {
          var dx = e.x - p.x, dy = e.y - p.y;
          var dl = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
          p.tx = dx / dl * p.spd; p.ty = dy / dl * p.spd;
          if (dl < EDEF[e.type].r + 0.15) {
            hurt(e, p.dmg, false);
            burst(e.x, e.y, ECOL[e.type], 3, 2);
            pDel(i);
            continue;
          }
        }
        p.x += p.tx * dt; p.y += p.ty * dt;
        p.ttl -= dt;
        if (p.ttl <= 0) pDel(i);
      } else {
        p.t += dt / p.T;
        if (p.t >= 1) { p.x = p.tx; p.y = p.ty; explode(p); pDel(i); continue; }
        p.x = p.sx + (p.tx - p.sx) * p.t;
        p.y = p.sy + (p.ty - p.sy) * p.t;
      }
    }
  }
  function tickEnemies(dt) {
    var i, e;
    for (i = 0; i < eN; i++) {
      e = enemies[i];
      e.px = e.x; e.py = e.y;
      if (e.hurt > 0) e.hurt -= dt;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
      e.ph += dt;
      var d = EDEF[e.type];
      var v = d.spd;
      if (d.boss) v *= 1 + 0.3 * Math.sin(e.ph * 2.6);
      if (e.slowT > 0) v *= 1 - e.slow;
      e.dist += v * dt;
      if (e.dist >= totalLen - 0.05) { e.leak = true; continue; }
      while (e.wpI < nWp - 2 && e.dist > cum[e.wpI + 1]) e.wpI++;
      var sg = cum[e.wpI + 1] - cum[e.wpI];
      var tt = sg > 0 ? (e.dist - cum[e.wpI]) / sg : 0;
      e.x = wpx[e.wpI] + (wpx[e.wpI + 1] - wpx[e.wpI]) * tt;
      e.y = wpy[e.wpI] + (wpy[e.wpI + 1] - wpy[e.wpI]) * tt;
      if (d.heal) { /* healer aura */
        e.ht -= dt;
        var did = false;
        for (var j = 0; j < eN; j++) {
          var o = enemies[j];
          if (o === e || o.hp <= 0 || o.hp >= o.mhp) continue;
          var dx = o.x - e.x, dy = o.y - e.y;
          if (dx * dx + dy * dy > 2.56) continue;
          o.hp = Math.min(o.mhp, o.hp + d.heal * dt);
          did = true;
        }
        if (did && e.ht <= 0) { e.ht = 0.9; fxRing(e.x, e.y, 1.0, ECOL[3], 3); }
      }
    }
    /* sweep deaths / leaks */
    for (i = eN - 1; i >= 0; i--) {
      e = enemies[i];
      if (e.hp <= 0) {
        var b = Math.round(EDEF[e.type].bty * (1 + 0.05 * (wave - 1)));
        gold += b; kills++;
        burst(e.x === 0 ? 0 : ox + e.x * cell, oy + e.y * cell, ECOL[e.type], EDEF[e.type].boss ? 26 : 9, EDEF[e.type].boss ? 120 : 70);
        floater(ox + e.x * cell, oy + e.y * cell - cell * 0.5, '+' + b, GOLD, false);
        if (EDEF[e.type].boss) { shake(12); api.haptic('medium'); }
        reportScore();
        eDel(i);
      } else if (e.leak) {
        lives -= EDEF[e.type].boss ? 3 : 1;
        redF = 0.5;
        shake(6);
        if (simT - lastLifeHap > 0.4) { api.haptic('error'); lastLifeHap = simT; }
        eDel(i);
        if (lives <= 0) { lives = 0; endGame(false); return; }
      }
    }
  }
  function tickFx(dt) {
    var i;
    for (i = paN - 1; i >= 0; i--) {
      var p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { paDel(i); continue; }
      p.vy += p.gr * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (i = flN - 1; i >= 0; i--) {
      var f = flts[i];
      f.life -= dt;
      if (f.life <= 0) flDel(i);
    }
    for (i = fxN - 1; i >= 0; i--) {
      fxs[i].life -= dt;
      if (fxs[i].life <= 0) fxDel(i);
    }
  }

  function tick(dt) {
    simT += dt;
    if (phase === 'build') {
      cd -= dt;
      if (cd <= 0) startWave();
    } else if (phase === 'wave') {
      if (qI < qN) {
        spawnT -= dt;
        while (spawnT <= 0 && qI < qN) {
          spawnEnemy(qT[qI]);
          spawnT += qG[qI];
          qI++;
        }
      }
    }
    tickEnemies(dt);
    tickTowers(dt);
    tickProjs(dt);
    tickFx(dt);
    if (phase === 'wave' && qI >= qN && eN === 0) waveCleared();
  }

  /* ================= input ================= */
  var MENU_ANG = [-2.356, -0.785, 2.356, 0.785]; /* diagonals */
  var mPos = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], mC = { x: 0, y: 0 };
  function menuLayout() {
    var R = cell * 1.5, ir = cell * 0.56;
    var x = ox + (sel.cx + 0.5) * cell, y = oy + (sel.cy + 0.5) * cell;
    var m = R * 0.707 + ir + 4;
    mC.x = Math.max(ox + m, Math.min(ox + gw - m, x));
    mC.y = Math.max(oy + m, Math.min(oy + gh - m, y));
    for (var i = 0; i < 4; i++) {
      mPos[i].x = mC.x + Math.cos(MENU_ANG[i]) * R;
      mPos[i].y = mC.y + Math.sin(MENU_ANG[i]) * R;
    }
    return ir;
  }
  var pbU = { x: 0, y: 0, w: 0, h: 0 }, pbS = { x: 0, y: 0, w: 0, h: 0 }, pbY = 0;
  function panelLayout() {
    pbY = cv.H - BB - 54;
    var w = Math.min(150, cv.W * 0.36);
    pbU.x = cv.W - w * 2 - 20; pbU.y = pbY + 7; pbU.w = w; pbU.h = 40;
    pbS.x = cv.W - w - 12; pbS.y = pbY + 7; pbS.w = w; pbS.h = 40;
  }
  var sbB = { x: 0, y: 0, w: 0, h: 0 }, spB = { x: 0, y: 0, w: 0, h: 0 };
  function barLayout() {
    sbB.x = 10; sbB.y = cv.H - BB + 9; sbB.w = cv.W - 88; sbB.h = BB - 18;
    spB.x = cv.W - 68; spB.y = sbB.y; spB.w = 58; spB.h = sbB.h;
  }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  function tryBuild(tt) {
    var d = TDEF[tt];
    if (gold < d.cost) { floater(mC.x, mC.y - cell, RU ? 'Мало золота' : 'Need gold', C.bad, false); return; }
    gold -= d.cost;
    var t = addTower(tt, sel.cx, sel.cy, 0);
    burst(ox + t.x * cell, oy + t.y * cell, TCOL[tt], 10, 70);
    api.haptic('light');
    sel = null;
    if (phase !== 'wave') persist();
  }
  function tryUpgrade(t) {
    if (t.lvl >= 2) return;
    var c = TDEF[t.t].up[t.lvl];
    if (gold < c) { floater(ox + t.x * cell, oy + t.y * cell - cell, RU ? 'Мало золота' : 'Need gold', C.bad, false); return; }
    gold -= c;
    t.lvl++;
    t.pop = 1;
    burst(ox + t.x * cell, oy + t.y * cell, TCOL[t.t], 12, 90);
    api.haptic('light');
    if (phase !== 'wave') persist();
  }
  function sellTower(t) {
    var back = Math.floor(towerInvested(t) * 0.7);
    gold += back;
    delete towerAt[t.cy * COLS + t.cx];
    towers.splice(towers.indexOf(t), 1);
    floater(ox + t.x * cell, oy + t.y * cell, '+' + back, GOLD, false);
    burst(ox + t.x * cell, oy + t.y * cell, C.muted, 8, 60);
    sel = null;
    if (phase !== 'wave') persist();
  }

  function onTap(x, y) {
    if (phase === 'over') return;
    if (!started) { started = true; return; }
    var i;
    if (sel && sel.kind === 'cell') {
      var ir = menuLayout();
      for (i = 0; i < 4; i++) {
        var dx = x - mPos[i].x, dy = y - mPos[i].y;
        if (dx * dx + dy * dy <= ir * ir) { tryBuild(i); return; }
      }
      sel = null;
      return;
    }
    if (sel && sel.kind === 'tower') {
      panelLayout();
      if (inRect(x, y, pbU)) { tryUpgrade(sel.tw); return; }
      if (inRect(x, y, pbS)) { sellTower(sel.tw); return; }
      sel = null;
      /* fall through so board taps re-select */
    }
    barLayout();
    if (inRect(x, y, sbB)) { if (phase === 'build') startWave(); return; }
    if (inRect(x, y, spB)) { speed = speed === 1 ? 2 : 1; api.haptic('light'); return; }
    var cx = Math.floor((x - ox) / cell), cy = Math.floor((y - oy) / cell);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    var id = cy * COLS + cx;
    if (towerAt[id]) { sel = { kind: 'tower', cx: cx, cy: cy, tw: towerAt[id] }; return; }
    if (!isPath[id]) sel = { kind: 'cell', cx: cx, cy: cy };
  }

  var offSwipe = api.swipe(container, function (d, p) {
    if (d !== 'tap' || !p) return;
    var r = cv.canvas.getBoundingClientRect();
    onTap(p.clientX - r.left, p.clientY - r.top);
  });
  function onKey(e) {
    if (e.key === ' ') {
      if (!started) started = true;
      else if (phase === 'build') startWave();
      e.preventDefault();
    } else if (e.key === 'x' || e.key === 'X') speed = speed === 1 ? 2 : 1;
    else if (e.key === 'Escape') sel = null;
    else if (sel && sel.kind === 'cell' && e.key >= '1' && e.key <= '4') tryBuild(+e.key - 1);
    else if (sel && sel.kind === 'tower' && e.key === 'u') tryUpgrade(sel.tw);
  }
  window.addEventListener('keydown', onKey);

  /* ================= drawing ================= */
  function drawTower(t, al) {
    var x = ox + t.x * cell, y = oy + t.y * cell;
    var pop = t.pop > 0 ? t.pop : 0;
    var sc = (1 + 0.35 * pop * Math.sin(pop * Math.PI)) * (1 + t.lvl * 0.11);
    g.save();
    g.translate(x, y);
    g.scale(sc, sc);
    /* base plate */
    g.fillStyle = rgba(PAN2, 0.9);
    rr(g, -cell * 0.4, -cell * 0.4, cell * 0.8, cell * 0.8, cell * 0.18);
    g.fill();
    g.strokeStyle = rgba(mix(PAN2, TEXTC, 0.25), 0.8);
    g.lineWidth = 1;
    g.stroke();
    var col = TCOL[t.t], cola = TCOLA[t.t];
    if (t.t === 2) { /* frost crystal */
      var pu = 0.85 + 0.15 * Math.sin(simT * 3 + t.x);
      g.rotate(0.785);
      g.fillStyle = col;
      g.globalAlpha = pu * al;
      var cr = cell * 0.24;
      g.fillRect(-cr, -cr, cr * 2, cr * 2);
      g.globalAlpha = al;
      g.strokeStyle = rgba(TEXTC, 0.7);
      g.strokeRect(-cr, -cr, cr * 2, cr * 2);
    } else {
      g.rotate(t.ang);
      if (t.t === 0) { /* archer: hub + arrow slit */
        g.fillStyle = col;
        g.beginPath(); g.arc(0, 0, cell * 0.2, 0, 6.283); g.fill();
        g.strokeStyle = rgba(TEXTC, 0.8); g.lineWidth = cell * 0.07;
        g.beginPath(); g.moveTo(cell * 0.05, 0); g.lineTo(cell * 0.42, 0); g.stroke();
        g.beginPath(); g.arc(cell * 0.16, 0, cell * 0.22, -1.1, 1.1); g.stroke();
      } else if (t.t === 1) { /* cannon: fat barrel */
        g.fillStyle = rgba(mix(cola, [0, 0, 0], 0.25), 1);
        rr(g, 0, -cell * 0.11, cell * 0.44, cell * 0.22, cell * 0.08);
        g.fill();
        g.fillStyle = col;
        g.beginPath(); g.arc(0, 0, cell * 0.24, 0, 6.283); g.fill();
        g.strokeStyle = rgba(TEXTC, 0.5); g.lineWidth = 1;
        g.beginPath(); g.arc(0, 0, cell * 0.24, 0, 6.283); g.stroke();
      } else { /* tesla: coil + orb */
        g.fillStyle = rgba(mix(cola, BG, 0.35), 1);
        g.beginPath(); g.arc(0, 0, cell * 0.22, 0, 6.283); g.fill();
        g.fillStyle = col;
        g.beginPath(); g.arc(cell * 0.2, 0, cell * 0.13, 0, 6.283); g.fill();
        if (!LOW) {
          g.globalAlpha = (0.4 + 0.3 * Math.sin(simT * 8)) * al;
          g.beginPath(); g.arc(cell * 0.2, 0, cell * 0.2, 0, 6.283); g.stroke();
          g.globalAlpha = al;
        }
      }
      if (t.flash > 0) { /* muzzle flash */
        g.fillStyle = rgba(mix(cola, TEXTC, 0.6), Math.min(1, t.flash * 9));
        g.beginPath(); g.arc(cell * 0.42, 0, cell * (0.12 + t.flash), 0, 6.283); g.fill();
      }
    }
    g.restore();
    /* level pips */
    g.fillStyle = GOLD;
    for (var p = 0; p <= t.lvl; p++) {
      g.beginPath();
      g.arc(x - (t.lvl) * 3 + p * 6, y + cell * 0.34, 1.8, 0, 6.283);
      g.fill();
    }
  }

  function drawEnemy(e, alpha) {
    var x = ox + (e.px + (e.x - e.px) * alpha) * cell;
    var y = oy + (e.py + (e.y - e.py) * alpha) * cell;
    if (y < oy - cell) return;
    var d = EDEF[e.type], r = d.r * cell;
    if (d.boss) r *= 1 + 0.06 * Math.sin(e.ph * 2.6);
    /* shadow */
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.ellipse(x, y + r * 0.7, r * 0.9, r * 0.35, 0, 0, 6.283); g.fill();
    /* slow tint */
    if (e.slowT > 0) {
      g.fillStyle = rgba(ACC, 0.3);
      g.beginPath(); g.arc(x, y, r + 3, 0, 6.283); g.fill();
    }
    g.fillStyle = ECOL[e.type];
    g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    g.strokeStyle = rgba(mix(ECOLA[e.type], [0, 0, 0], 0.45), 0.9);
    g.lineWidth = 1.5;
    g.stroke();
    if (e.type === 2) { /* tank armor ring */
      g.strokeStyle = rgba(TEXTC, 0.45);
      g.beginPath(); g.arc(x, y, r * 0.6, 0, 6.283); g.stroke();
    } else if (e.type === 3) { /* healer cross */
      g.fillStyle = rgba(TEXTC, 0.85);
      g.fillRect(x - r * 0.5, y - r * 0.14, r, r * 0.28);
      g.fillRect(x - r * 0.14, y - r * 0.5, r * 0.28, r);
    } else if (e.type === 0) { /* runner streak */
      g.fillStyle = rgba(ECOLA[0], 0.4);
      g.beginPath(); g.ellipse(x - (e.x - e.px) * cell * 3, y - (e.y - e.py) * cell * 3, r * 0.7, r * 0.4, 0, 0, 6.283); g.fill();
    } else if (d.boss) { /* boss spikes + core */
      g.strokeStyle = rgba(ECOLA[4], 0.9);
      g.lineWidth = 2;
      for (var s = 0; s < 8; s++) {
        var a = e.ph * 0.7 + s * 0.785;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        g.lineTo(x + Math.cos(a) * (r + 5), y + Math.sin(a) * (r + 5));
        g.stroke();
      }
      g.fillStyle = rgba(TEXTC, 0.7);
      g.beginPath(); g.arc(x, y, r * 0.35, 0, 6.283); g.fill();
    }
    if (e.hurt > 0) {
      g.fillStyle = rgba(TEXTC, Math.min(0.7, e.hurt * 6));
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    /* hp bar */
    var pct = e.hp / e.mhp;
    if (pct < 1) {
      var bw = r * 2.3;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(x - bw / 2, y - r - 7, bw, 3.5);
      g.fillStyle = pct > 0.5 ? C.good : pct > 0.25 ? GOLD : C.bad;
      g.fillRect(x - bw / 2, y - r - 7, bw * Math.max(0, pct), 3.5);
    }
  }

  function drawProjs(alpha) {
    for (var i = 0; i < pN; i++) {
      var p = projs[i];
      var x = ox + (p.px + (p.x - p.px) * alpha) * cell;
      var y = oy + (p.py + (p.y - p.py) * alpha) * cell;
      if (p.k === 0) { /* arrow: dot + trail streak */
        if (!LOW) {
          g.strokeStyle = rgba(GOOD, 0.5);
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x - p.tx * cell * 0.045, y - p.ty * cell * 0.045);
          g.lineTo(x, y);
          g.stroke();
        }
        g.fillStyle = C.text;
        g.beginPath(); g.arc(x, y, 2.4, 0, 6.283); g.fill();
      } else { /* cannonball: arc + ground shadow */
        var tt = Math.min(1, p.t + alpha * 0.0001);
        var h = 4 * p.hm * tt * (1 - tt) * cell * 2.2;
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath(); g.ellipse(x, y, 4, 2, 0, 0, 6.283); g.fill();
        g.fillStyle = css(mix(TCOLA[1], [0, 0, 0], 0.35));
        g.beginPath(); g.arc(x, y - h, cell * 0.13, 0, 6.283); g.fill();
        g.fillStyle = rgba(TEXTC, 0.35);
        g.beginPath(); g.arc(x - 1.5, y - h - 1.5, cell * 0.05, 0, 6.283); g.fill();
      }
    }
  }

  function drawFx() {
    for (var i = 0; i < fxN; i++) {
      var f = fxs[i];
      var k = f.life / f.T;
      if (f.k === 2) { /* tesla arc: jagged flickering polyline */
        var fl = LOW ? 0.85 : 0.55 + 0.45 * Math.random();
        g.strokeStyle = f.col;
        g.globalAlpha = k * fl * 0.35;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(ox + f.p[0] * cell, oy + f.p[1] * cell);
        for (var j = 1; j < f.n; j++) g.lineTo(ox + f.p[j * 2] * cell, oy + f.p[j * 2 + 1] * cell);
        g.stroke();
        g.globalAlpha = k * fl;
        g.lineWidth = 1.8;
        g.stroke();
        g.globalAlpha = 1;
      } else { /* rings: splash / frost / heal */
        var r = (f.r0 + (f.r1 - f.r0) * (1 - k)) * cell;
        g.strokeStyle = f.col;
        g.globalAlpha = k * 0.8;
        g.lineWidth = f.k === 0 ? 3 : 2;
        g.beginPath(); g.arc(ox + f.x * cell, oy + f.y * cell, r, 0, 6.283); g.stroke();
        if (f.k === 1) {
          g.globalAlpha = k * 0.12;
          g.fillStyle = f.col;
          g.fill();
        }
        g.globalAlpha = 1;
      }
    }
  }

  function drawHud() {
    g.fillStyle = C.panel;
    g.fillRect(0, 0, cv.W, TH);
    g.textBaseline = 'middle';
    /* gold */
    g.fillStyle = GOLD;
    g.beginPath(); g.arc(18, TH / 2, 7, 0, 6.283); g.fill();
    g.strokeStyle = rgba(mix(GOLDA, [0, 0, 0], 0.4), 1);
    g.stroke();
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'left';
    g.fillStyle = C.text;
    g.fillText('' + gold, 30, TH / 2 + 1);
    /* lives */
    var lx = cv.W * 0.42;
    g.fillText('❤️', lx - 20, TH / 2 + 1);
    g.fillStyle = lives <= 5 ? C.bad : C.text;
    g.fillText('' + lives, lx + 2, TH / 2 + 1);
    /* wave */
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    var wn = phase === 'wave' ? wave : Math.min(WAVES, done + 1);
    g.fillText((RU ? 'Волна ' : 'Wave ') + wn + '/' + WAVES, cv.W - 12, TH / 2 + 1);
    /* preview strip */
    g.fillStyle = rgba(hx(C.panel), 0.75);
    g.fillRect(0, TH, cv.W, PS);
    var nx = (phase === 'wave' ? wave + 1 : done + 1);
    g.textAlign = 'left';
    g.font = '11px sans-serif';
    g.fillStyle = C.muted;
    if (nx > WAVES) {
      g.fillText(RU ? 'Последняя волна!' : 'Final wave!', 12, TH + PS / 2 + 1);
    } else {
      var lbl = (phase === 'wave' ? (RU ? 'Далее: ' : 'Next: ') : (RU ? 'Волна ' + nx + ': ' : 'Wave ' + nx + ': '));
      g.fillText(lbl, 12, TH + PS / 2 + 1);
      var cx2 = 12 + g.measureText(lbl).width + 8;
      var cp = waveComp(nx);
      var cnt = [cp.r, cp.s, cp.t, cp.h, cp.b];
      for (var t2 = 0; t2 < 5; t2++) {
        if (!cnt[t2]) continue;
        g.fillStyle = ECOL[t2];
        g.beginPath(); g.arc(cx2, TH + PS / 2, t2 === 4 ? 6 : 4, 0, 6.283); g.fill();
        if (t2 === 4) {
          g.strokeStyle = rgba(TEXTC, 0.8);
          g.stroke();
        }
        g.fillStyle = C.text;
        g.fillText('×' + cnt[t2], cx2 + 8, TH + PS / 2 + 1);
        cx2 += 8 + g.measureText('×' + cnt[t2]).width + 14;
      }
    }
  }

  function drawBar() {
    barLayout();
    g.fillStyle = C.panel;
    g.fillRect(0, cv.H - BB, cv.W, BB);
    /* start button */
    var canStart = phase === 'build' && started;
    g.fillStyle = canStart ? C.accent : C.panel2;
    rr(g, sbB.x, sbB.y, sbB.w, sbB.h, 10);
    g.fill();
    if (phase === 'wave' && waveTotal > 0) {
      var prog = 1 - ((qN - qI) + eN) / waveTotal;
      g.save();
      g.clip();
      g.fillStyle = rgba(ACC, 0.35);
      g.fillRect(sbB.x, sbB.y, sbB.w * Math.max(0, prog), sbB.h);
      g.restore();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 15px sans-serif';
    g.fillStyle = canStart ? css(BG) : C.muted;
    var txt;
    if (phase === 'wave') txt = (RU ? 'Волна ' : 'Wave ') + wave + '…';
    else txt = '▶ ' + (RU ? 'Волна ' : 'Wave ') + (done + 1) + (started ? ' · ' + Math.ceil(cd) : '');
    g.fillText(txt, sbB.x + sbB.w / 2, sbB.y + sbB.h / 2 + 1);
    /* speed */
    g.fillStyle = speed === 2 ? C.accent : C.panel2;
    rr(g, spB.x, spB.y, spB.w, spB.h, 10);
    g.fill();
    g.fillStyle = speed === 2 ? css(BG) : C.text;
    g.fillText('×' + speed, spB.x + spB.w / 2, spB.y + spB.h / 2 + 1);
  }

  function drawMenus() {
    if (!sel) return;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    if (sel.kind === 'cell') {
      var ir = menuLayout();
      /* highlight cell */
      g.strokeStyle = RANGE_S;
      g.lineWidth = 2;
      g.strokeRect(ox + sel.cx * cell + 2, oy + sel.cy * cell + 2, cell - 4, cell - 4);
      g.fillStyle = DIM;
      g.beginPath(); g.arc(mC.x, mC.y, cell * 2.35, 0, 6.283); g.fill();
      for (var i = 0; i < 4; i++) {
        var d = TDEF[i], can = gold >= d.cost;
        g.globalAlpha = can ? 1 : 0.45;
        g.fillStyle = C.panel2;
        g.beginPath(); g.arc(mPos[i].x, mPos[i].y, ir, 0, 6.283); g.fill();
        g.strokeStyle = TCOL[i];
        g.lineWidth = 2;
        g.stroke();
        g.font = Math.round(ir * 0.7) + 'px sans-serif';
        g.fillText(d.icon, mPos[i].x, mPos[i].y - ir * 0.22);
        g.font = 'bold ' + Math.round(ir * 0.38) + 'px sans-serif';
        g.fillStyle = can ? GOLD : C.bad;
        g.fillText('' + d.cost, mPos[i].x, mPos[i].y + ir * 0.5);
        g.globalAlpha = 1;
      }
    } else {
      var t = sel.tw, dd = TDEF[t.t];
      /* range circle */
      var x = ox + t.x * cell, y = oy + t.y * cell, R = dd.rng[t.lvl] * cell;
      g.fillStyle = RANGE_F;
      g.beginPath(); g.arc(x, y, R, 0, 6.283); g.fill();
      g.strokeStyle = RANGE_S;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, R, 0, 6.283); g.stroke();
      /* panel */
      panelLayout();
      g.fillStyle = rgba(hx(C.panel), 0.95);
      rr(g, 6, pbY, cv.W - 12, 54, 12);
      g.fill();
      g.strokeStyle = rgba(PAN2, 1);
      g.stroke();
      g.textAlign = 'left';
      g.font = '18px sans-serif';
      g.fillText(dd.icon, 16, pbY + 20);
      g.font = 'bold 13px sans-serif';
      g.fillStyle = C.text;
      g.fillText(dd.nm, 42, pbY + 16);
      g.font = '11px sans-serif';
      g.fillStyle = C.muted;
      g.fillText((api.t('level') || 'Lv') + ' ' + (t.lvl + 1) + '/3', 42, pbY + 34);
      g.textAlign = 'center';
      /* upgrade btn */
      var maxed = t.lvl >= 2;
      var uc = maxed ? 0 : dd.up[t.lvl];
      g.fillStyle = maxed ? C.panel2 : (gold >= uc ? C.good : C.panel2);
      rr(g, pbU.x, pbU.y, pbU.w, pbU.h, 9);
      g.fill();
      g.font = 'bold 13px sans-serif';
      g.fillStyle = maxed ? C.muted : (gold >= uc ? css(BG) : C.muted);
      g.fillText(maxed ? (RU ? 'МАКС' : 'MAX') : '⬆ ' + uc, pbU.x + pbU.w / 2, pbU.y + pbU.h / 2 + 1);
      /* sell btn */
      g.fillStyle = rgba(BAD, 0.85);
      rr(g, pbS.x, pbS.y, pbS.w, pbS.h, 9);
      g.fill();
      g.fillStyle = C.text;
      g.fillText(api.t('sell') + ' +' + Math.floor(towerInvested(t) * 0.7), pbS.x + pbS.w / 2, pbS.y + pbS.h / 2 + 1);
    }
  }

  function draw(alpha) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    var shx = 0, shy = 0;
    if (shakeT > 0 && !LOW) {
      var sm = shakeM * (shakeT / 0.35);
      shx = (Math.random() - 0.5) * 2 * sm;
      shy = (Math.random() - 0.5) * 2 * sm;
    }
    g.save();
    g.translate(shx, shy);
    /* board */
    if (grass) g.drawImage(grass, 0, 0, grass.width, grass.height, ox, oy, gw, gh);
    g.strokeStyle = rgba(TEXTC, 0.05);
    g.lineWidth = 1;
    var i;
    for (i = 1; i < COLS; i++) { g.beginPath(); g.moveTo(ox + i * cell, oy); g.lineTo(ox + i * cell, oy + gh); g.stroke(); }
    for (i = 1; i < ROWS; i++) { g.beginPath(); g.moveTo(ox, oy + i * cell); g.lineTo(ox + gw, oy + i * cell); g.stroke(); }
    for (i = 0; i < towers.length; i++) drawTower(towers[i], 1);
    for (i = 0; i < eN; i++) drawEnemy(enemies[i], alpha);
    drawProjs(alpha);
    drawFx();
    /* particles */
    for (i = 0; i < paN; i++) {
      var p = parts[i];
      g.globalAlpha = Math.max(0, p.life / p.T);
      g.fillStyle = p.col;
      g.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    g.globalAlpha = 1;
    g.restore();
    /* floaters */
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (i = 0; i < flN; i++) {
      var f = flts[i];
      var k = f.life / f.T;
      g.globalAlpha = Math.min(1, k * 2);
      g.font = f.big ? 'bold 26px sans-serif' : 'bold 12px sans-serif';
      g.fillStyle = f.col;
      g.fillText(f.txt, f.x, f.y - (1 - k) * (f.big ? 26 : 22));
    }
    g.globalAlpha = 1;
    if (redF > 0) {
      g.fillStyle = rgba(BAD, redF * 0.4);
      g.fillRect(0, 0, cv.W, cv.H);
    }
    drawHud();
    drawBar();
    drawMenus();
    if (!started && phase !== 'over') {
      g.fillStyle = DIM;
      g.fillRect(0, 0, cv.W, cv.H);
      g.textAlign = 'center';
      g.font = '44px sans-serif';
      g.fillText('🛡️', cv.W / 2, cv.H / 2 - 54);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.fillText(RU ? 'Ставь башни · держи оборону · 20 волн' : 'Build towers · hold the line · 20 waves', cv.W / 2, cv.H / 2 + 28);
      if (done > 0) g.fillText((RU ? 'Продолжить с волны ' : 'Resume from wave ') + (done + 1), cv.W / 2, cv.H / 2 + 50);
    }
  }

  /* ================= main loop ================= */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(100, ts - last || 16);
    last = ts;
    if (started && phase !== 'over') {
      acc += dt * speed;
      var guard = 0;
      while (acc >= STEP && guard++ < 8 && phase !== 'over') {
        acc -= STEP;
        tick(STEP / 1000);
      }
      if (acc >= STEP) acc = 0;
      if (shakeT > 0) { shakeT -= dt / 1000; if (shakeT <= 0) shakeM = 0; }
      if (redF > 0) redF -= dt / 1000;
    }
    draw(Math.max(0, Math.min(1, acc / STEP)));
  }
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
