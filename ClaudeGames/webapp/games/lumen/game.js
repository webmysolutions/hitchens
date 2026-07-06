/* Lumen — bend light through rotating mirrors to ignite every crystal.
   Flagship visual puzzle for the MG platform. Canvas only, no assets. */
(function () {
'use strict';

/* ==================== pure puzzle core (node-testable) ==================== */

var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   /* 0 right, 1 down, 2 left, 3 up */
var MREF = [[3, 2, 1, 0], [1, 0, 3, 2]];      /* [mirror orient '/'|'\'][dirIn] -> dirOut */

/* Trace all beams. Returns {segs:[[x0,y0,x1,y1,color]...], lit, total}.
   Mutates crystal .lit flags. Coordinates are cell units (centers). */
function traceGrid(grid, n) {
  var segs = [], queue = [], seen = {}, steps = 0, lit = 0, total = 0, i, c;
  for (i = 0; i < n * n; i++) {
    c = grid[i];
    if (!c) continue;
    if (c.t === 'E') queue.push({ x: i % n, y: (i / n) | 0, d: c.d, c: -1 });
    else if (c.t === 'C') { c.lit = false; total++; }
  }
  while (queue.length) {
    var b = queue.pop(), x = b.x, y = b.y, d = b.d, col = b.c, sx = x, sy = y;
    for (;;) {
      if (++steps > 9000) return { segs: segs, lit: lit, total: total };
      var nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) {           /* off grid */
        segs.push([sx, sy, x + DX[d] * 0.5, y + DY[d] * 0.5, col]);
        break;
      }
      c = grid[ny * n + nx];
      if (!c) { x = nx; y = ny; continue; }
      if (c.t === 'C') {                                      /* crystal: pass through */
        if (!c.lit && (c.c === -1 || c.c === col)) { c.lit = true; lit++; }
        x = nx; y = ny; continue;
      }
      if (c.t === 'F') {                                      /* filter: recolor */
        segs.push([sx, sy, nx, ny, col]);
        col = c.c; sx = nx; sy = ny; x = nx; y = ny; continue;
      }
      if (c.t === 'M') {                                      /* mirror: reflect */
        var k = nx + '.' + ny + '.' + d + '.' + col;
        segs.push([sx, sy, nx, ny, col]);
        if (seen[k]) break;
        seen[k] = 1;
        d = MREF[c.o][d]; sx = nx; sy = ny; x = nx; y = ny; continue;
      }
      if (c.t === 'P') {                                      /* prism: split */
        var k2 = nx + '.' + ny + '.' + d + '.' + col;
        segs.push([sx, sy, nx, ny, col]);
        if (!seen[k2]) {
          seen[k2] = 1;
          queue.push({ x: nx, y: ny, d: (d + 1) & 3, c: col });
          queue.push({ x: nx, y: ny, d: (d + 3) & 3, c: col });
        }
        break;
      }
      /* wall or emitter: stop at its face */
      segs.push([sx, sy, nx - DX[d] * 0.5, ny - DY[d] * 0.5, col]);
      break;
    }
  }
  return { segs: segs, lit: lit, total: total };
}

/* Build one candidate level. Constructs a SOLVED configuration by walking
   beams forward (dropping correctly oriented mirrors at each turn, crystals
   along segments, prisms/filters on later levels), verifies it by tracing,
   then scrambles mirrors. Returns {n, grid, par, solution} or null. */
function tryGen(level, n, rnd) {
  var N = n * n, z;
  var grid = new Array(N), occ = new Array(N);   /* occ: 0 empty, 1 beam, 2 solid, 3 crystal */
  for (z = 0; z < N; z++) { grid[z] = null; occ[z] = 0; }
  var mirrors = [];
  var crysLeft = Math.min(6, 2 + ((level / 3) | 0));
  var placedCr = 0;
  var nem = level < 3 ? 1 : level < 8 ? 2 : (rnd() < 0.5 ? 3 : 2);
  var wantPrism = level >= 6;
  var wantFilter = level >= 9 && nem >= 2;

  function scan(x, y, d) {                        /* passable cells ahead, in order */
    var out = [];
    for (;;) {
      x += DX[d]; y += DY[d];
      if (x < 0 || y < 0 || x >= n || y >= n) break;
      var i = y * n + x;
      if (occ[i] === 2) break;
      out.push(i);
    }
    return out;
  }

  /* Mark a straight run as traversed; sprinkle a filter / crystals on it. */
  function dropStuff(passed, col, cs) {
    var i, fIdx = -1;
    if (cs.want && !cs.on) {
      var fc = [];
      for (i = 0; i < passed.length; i++) if (!grid[passed[i]] && occ[passed[i]] === 0) fc.push(i);
      if (fc.length) {
        fIdx = fc[(rnd() * fc.length) | 0];
        grid[passed[fIdx]] = { t: 'F', c: col };
        occ[passed[fIdx]] = 2;
        cs.on = true;
      }
    }
    for (i = 0; i < passed.length; i++) {
      var ci = passed[i];
      if (grid[ci]) continue;
      if (crysLeft > 0 && rnd() < 0.42) {
        var colored = cs.on && (cs.prevRuns || (fIdx >= 0 && i > fIdx));
        grid[ci] = { t: 'C', c: colored ? col : -1, lit: false };
        occ[ci] = 3;
        crysLeft--; placedCr++;
      } else if (occ[ci] === 0) occ[ci] = 1;
    }
    cs.prevRuns = cs.on;
  }

  function buildPath(x, y, d, turns, col, cs, prismOk, depth) {
    for (var guard = 0; guard < 14; guard++) {
      var run = scan(x, y, d);
      if (!run.length) return;
      var turnPos = -1, nd = -1, both = false;
      if (turns > 0) {
        var cands = [];
        for (var i = 0; i < run.length; i++) {
          var ci = run[i];
          if (grid[ci] || occ[ci] !== 0) continue;
          var cx = ci % n, cy = (ci / n) | 0;
          var dA = (d + 1) & 3, dB = (d + 3) & 3;
          var rA = scan(cx, cy, dA).length, rB = scan(cx, cy, dB).length;
          if (rA > 0) cands.push([i, dA, rA > 1 && rB > 1]);
          if (rB > 0) cands.push([i, dB, rA > 1 && rB > 1]);
        }
        if (cands.length) {
          var pk = cands[(rnd() * cands.length) | 0];
          turnPos = pk[0]; nd = pk[1]; both = pk[2];
        }
      }
      dropStuff(turnPos >= 0 ? run.slice(0, turnPos) : run, col, cs);
      if (turnPos < 0) return;
      var ti = run[turnPos], tx = ti % n, ty = (ti / n) | 0;
      if (prismOk && depth < 2 && both && rnd() < 0.55) {
        grid[ti] = { t: 'P' };
        occ[ti] = 2;
        buildPath(tx, ty, (d + 1) & 3, turns - 1, col, cs, false, depth + 1);
        buildPath(tx, ty, (d + 3) & 3, turns - 1, col, cs, false, depth + 1);
        return;
      }
      grid[ti] = { t: 'M', o: MREF[0][d] === nd ? 0 : 1 };
      occ[ti] = 2;
      mirrors.push(ti);
      x = tx; y = ty; d = nd; turns--;
    }
  }

  /* emitters on edges, beams walked inward */
  var prismGiven = false, e = 0, tries = 0;
  while (e < nem && tries++ < 50) {
    var side = (rnd() * 4) | 0, off = 1 + ((rnd() * (n - 2)) | 0);
    var ex, ey, ed;
    if (side === 0) { ex = 0; ey = off; ed = 0; }
    else if (side === 1) { ex = n - 1; ey = off; ed = 2; }
    else if (side === 2) { ex = off; ey = 0; ed = 1; }
    else { ex = off; ey = n - 1; ed = 3; }
    var ei = ey * n + ex;
    if (grid[ei] || occ[ei] !== 0) continue;
    if (scan(ex, ey, ed).length < 3) continue;
    grid[ei] = { t: 'E', d: ed };
    occ[ei] = 2;
    var col = -1, cs = { want: false, on: false, prevRuns: false };
    if (wantFilter && e === nem - 1) { col = (rnd() * 3) | 0; cs.want = true; }
    var pr = wantPrism && !prismGiven && col < 0;
    if (pr) prismGiven = true;
    var turns = 2 + Math.min(3, (level / 3) | 0) + ((rnd() * 2) | 0);
    buildPath(ex, ey, ed, turns, col, cs, pr, 0);
    e++;
  }
  if (e < nem || placedCr < 2 || mirrors.length < 2) return null;

  /* decorative walls on never-traversed cells (cannot break the solution) */
  var wallN = 2 + ((rnd() * n) | 0), w = 0, wt = 0;
  while (w < wallN && wt++ < 70) {
    var wi = (rnd() * N) | 0;
    if (!grid[wi] && occ[wi] === 0) { grid[wi] = { t: 'W' }; occ[wi] = 2; w++; }
  }

  /* verify the solved configuration actually lights everything */
  var r = traceGrid(grid, n);
  if (!r.total || r.lit !== r.total) return null;

  /* scramble mirrors; par = flips needed to restore */
  var p = Math.min(0.85, 0.55 + level * 0.03);
  for (var s = 0; s < 6; s++) {
    var sol = [], mi;
    for (mi = 0; mi < mirrors.length; mi++) if (rnd() < p) sol.push(mirrors[mi]);
    if (!sol.length) sol.push(mirrors[(rnd() * mirrors.length) | 0]);
    for (mi = 0; mi < sol.length; mi++) grid[sol[mi]].o ^= 1;
    var r2 = traceGrid(grid, n);
    if (r2.lit < r2.total) return { n: n, grid: grid, par: sol.length, solution: sol };
    for (mi = 0; mi < sol.length; mi++) grid[sol[mi]].o ^= 1;   /* accidentally solved: undo, retry */
  }
  return null;
}

function trivialLevel(n) {                        /* unreachable in practice; absolute fallback */
  var grid = new Array(n * n), m = n >> 1, i;
  for (i = 0; i < n * n; i++) grid[i] = null;
  grid[m * n] = { t: 'E', d: 0 };
  grid[m * n + m] = { t: 'M', o: 0 };             /* solved orientation is '\' */
  grid[(m + 2) * n + m] = { t: 'C', c: -1, lit: false };
  return { n: n, grid: grid, par: 1, solution: [m * n + m] };
}

function genLevel(level, rnd) {
  rnd = rnd || Math.random;
  var n = 6 + Math.min(3, (level / 4) | 0);       /* 6x6 -> 9x9 */
  for (var a = 0; a < 120; a++) {
    var g = tryGen(level, n, rnd);
    if (g) return g;
  }
  return trivialLevel(n);
}

/* node test hook (no effect in browser) */
if (typeof module === 'object' && module.exports) {
  module.exports = { genLevel: genLevel, traceGrid: traceGrid, DX: DX, DY: DY, MREF: MREF };
}
if (typeof MG === 'undefined') return;

/* ============================== the game ============================== */

MG.register('lumen', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var low = api.lowEnd;
  var PI = Math.PI, QP = PI / 4, HP = PI / 2;

  var JEWEL = ['#ff5c7a', '#3fe8a6', '#62aaff'];  /* ruby, emerald, sapphire */
  var WHITE = '#ffedc2';                          /* warm white beam */
  var PLAIN = '#dcecff';                          /* uncolored crystal */
  var LEVELS = 15;

  var levelIdx, lv, res, taps, score, state, over;
  var gt = 0, last = 0, raf = 0, paused = false;
  var wonAt = 0, levelStart = 0, gained = 0;
  var mAnim = {};                                  /* mirror idx -> {a0,a1,t0} */
  var parts = [];                                  /* particle pool */
  var kb = { x: 0, y: 0, on: false };

  /* layout */
  var cell = 10, ox = 0, oy = 0, hudTop = 46, hudBot = 76;
  var velvet = null, glowUp = null, mirGrad = null, dashArr = [8, 12];
  var skip = { x: 0, y: 0, w: 0, h: 0 };

  function layout() {
    var n = lv ? lv.n : 7;
    var bs = Math.min(cv.W - 14, cv.H - hudTop - hudBot - 6);
    cell = Math.max(8, bs / n);
    ox = (cv.W - cell * n) / 2;
    oy = hudTop + (cv.H - hudTop - hudBot - cell * n) / 2;
    var cx = cv.W / 2, cy = cv.H * 0.42, rr0 = Math.max(cv.W, cv.H);
    velvet = g.createRadialGradient(cx, cy, rr0 * 0.1, cx, cy, rr0 * 0.75);
    velvet.addColorStop(0, 'rgba(46,42,72,0.35)');
    velvet.addColorStop(0.55, 'rgba(20,18,38,0.15)');
    velvet.addColorStop(1, 'rgba(0,0,0,0.55)');
    glowUp = g.createRadialGradient(cx, oy + cell * n / 2, 10, cx, oy + cell * n / 2, rr0 * 0.6);
    glowUp.addColorStop(0, 'rgba(255,240,200,0.05)');
    glowUp.addColorStop(1, 'rgba(255,240,200,0)');
    var L = cell * 0.86;
    mirGrad = g.createLinearGradient(-L / 2, 0, L / 2, 0);
    mirGrad.addColorStop(0, 'rgba(190,215,255,0.16)');
    mirGrad.addColorStop(0.5, 'rgba(235,245,255,0.55)');
    mirGrad.addColorStop(1, 'rgba(190,215,255,0.16)');
    dashArr = [cell * 0.55, cell * 0.85];
    skip.w = Math.min(230, cv.W * 0.62);
    skip.h = 44;
    skip.x = (cv.W - skip.w) / 2;
    skip.y = cv.H - hudBot + (hudBot - skip.h) / 2;
  }
  cv.onResize = function () { layout(); };

  function beamCol(c) { return c === -1 ? WHITE : JEWEL[c]; }
  function crysCol(c) { return c === -1 ? PLAIN : JEWEL[c]; }
  function X(v) { return ox + (v + 0.5) * cell; }
  function Y(v) { return oy + (v + 0.5) * cell; }

  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------- level flow ---------- */

  function loadLevel() {
    lv = genLevel(levelIdx);
    res = traceGrid(lv.grid, lv.n);
    taps = 0;
    mAnim = {};
    parts.length = 0;
    state = 'play';
    levelStart = gt;
    kb.x = kb.y = 0;
    layout();
  }

  function bonusNow() {
    return Math.max(0, 50 - 5 * Math.max(0, taps - lv.par));
  }

  function win() {
    state = 'won';
    wonAt = gt;
    gained = 100 + bonusNow();
    score += gained;
    api.score(score);
    api.haptic('success');
    if (!low) {
      for (var i = 0; i < lv.n * lv.n; i++) {
        var c = lv.grid[i];
        if (c && c.t === 'C' && c.lit) burst(X(i % lv.n), Y((i / lv.n) | 0), crysCol(c.c), 12);
      }
    }
  }

  function advance() {
    if (levelIdx >= LEVELS - 1) {
      if (!over) { over = true; state = 'done'; api.gameOver(score, { win: true }); }
      return;
    }
    levelIdx++;
    loadLevel();
  }

  function doSkip() {
    score = Math.max(0, score - 50);
    api.score(score);
    api.haptic('light');
    advance();
  }

  /* ---------- input ---------- */

  function rotateAt(i) {
    var c = lv.grid[i];
    if (!c || c.t !== 'M') return;
    taps++;
    var cur = mirrorAngle(i);
    var an = mAnim[i];
    var tgt = an ? an.a1 : (c.o ? QP : -QP);
    c.o ^= 1;
    if (!low) mAnim[i] = { a0: cur, a1: tgt + HP, t0: gt };
    var before = res.lit;
    res = traceGrid(lv.grid, lv.n);
    if (res.lit > before) api.haptic('light');
    if (res.total && res.lit === res.total) win();
  }

  function onTap(px, py) {
    if (over) return;
    if (state === 'play' && taps >= 20 &&
        px >= skip.x && px <= skip.x + skip.w && py >= skip.y && py <= skip.y + skip.h) {
      doSkip();
      return;
    }
    if (state !== 'play') return;
    var x = Math.floor((px - ox) / cell), y = Math.floor((py - oy) / cell);
    if (x < 0 || y < 0 || x >= lv.n || y >= lv.n) return;
    kb.on = false;
    rotateAt(y * lv.n + x);
  }

  var offSwipe = api.swipe(container, function (d, p) {
    if (d !== 'tap' || !p) return;
    var r = cv.canvas.getBoundingClientRect();
    onTap(p.clientX - r.left, p.clientY - r.top);
  });

  function onKey(e) {
    if (state !== 'play') return;
    var mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) {
      kb.on = true;
      kb.x = Math.max(0, Math.min(lv.n - 1, kb.x + mv[0]));
      kb.y = Math.max(0, Math.min(lv.n - 1, kb.y + mv[1]));
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (kb.on) rotateAt(kb.y * lv.n + kb.x);
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);

  /* ---------- particles ---------- */

  function burst(x, y, col, num) {
    for (var i = 0; i < num && parts.length < 140; i++) {
      var a = Math.random() * PI * 2, sp = 0.02 + Math.random() * 0.09;
      parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                   life: 0, max: 500 + Math.random() * 600, c: col, r: 1 + Math.random() * 2.2 });
    }
  }

  function updateParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 0.00006 * dt;   /* gentle float upward */
      p.vx *= 0.995;
      p.vy *= 0.995;
    }
  }

  /* ---------- drawing ---------- */

  function mirrorAngle(i) {
    var an = mAnim[i];
    if (!an) return lv.grid[i].o ? QP : -QP;
    var p = Math.min(1, (gt - an.t0) / 240);
    var e = 1 - Math.pow(1 - p, 3);
    return an.a0 + (an.a1 - an.a0) * e;
  }

  function drawBeams(flare) {
    var i, s, colr;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    var passes = low
      ? [[cell * 0.14, 0.85, false]]
      : [[cell * 0.5, 0.10, false], [cell * 0.2, 0.24, false], [Math.max(2, cell * 0.08), 0.95, true]];
    for (var pI = 0; pI < passes.length; pI++) {
      var ps = passes[pI];
      g.lineWidth = ps[0] * (1 + flare * 1.4);
      g.globalAlpha = Math.min(1, ps[1] + flare * 0.3);
      if (ps[2]) { g.setLineDash(dashArr); g.lineDashOffset = -gt * 0.12; }
      for (i = 0; i < res.segs.length; i++) {
        s = res.segs[i];
        g.strokeStyle = beamCol(s[4]);
        g.beginPath();
        g.moveTo(X(s[0]), Y(s[1]));
        g.lineTo(X(s[2]), Y(s[3]));
        g.stroke();
      }
      if (ps[2]) g.setLineDash([]);
    }
    /* impact glows at segment ends */
    if (!low) {
      g.globalAlpha = 0.5 + flare * 0.4;
      for (i = 0; i < res.segs.length; i++) {
        s = res.segs[i];
        g.fillStyle = beamCol(s[4]);
        g.beginPath();
        g.arc(X(s[2]), Y(s[3]), cell * 0.09, 0, PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function drawCrystal(px, py, c, i, flare) {
    var r = cell * 0.34 * (1 + flare * 0.25);
    var col = crysCol(c.c);
    var pulse = 0.5 + 0.5 * Math.sin(gt * 0.0022 + i * 1.7);
    g.save();
    g.translate(px, py);
    if (c.lit && !low) {
      var bl = g.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.6);
      bl.addColorStop(0, col);
      bl.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.35 + 0.15 * pulse + flare * 0.4;
      g.fillStyle = bl;
      g.beginPath();
      g.arc(0, 0, r * 2.6, 0, PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
    g.beginPath();                                 /* faceted diamond */
    g.moveTo(0, -r);
    g.lineTo(r * 0.72, 0);
    g.lineTo(0, r);
    g.lineTo(-r * 0.72, 0);
    g.closePath();
    if (c.lit) {
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
    } else {
      g.globalAlpha = 0.16 + 0.1 * pulse;
      g.fillStyle = col;
      g.fill();
      g.globalAlpha = 0.45 + 0.2 * pulse;
      g.strokeStyle = col;
    }
    g.lineWidth = 1.4;
    g.stroke();
    /* facets */
    g.globalAlpha = c.lit ? 0.8 : 0.3;
    g.strokeStyle = c.lit ? 'rgba(255,255,255,0.9)' : col;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-r * 0.42, -r * 0.4); g.lineTo(r * 0.42, -r * 0.4);
    g.moveTo(0, -r); g.lineTo(0, r);
    g.stroke();
    if (c.lit) {                                   /* bright core */
      g.globalAlpha = 0.9;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(0, -r * 0.15, r * 0.16, 0, PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawItems(flare) {
    var n = lv.n, i, c, px, py;
    for (i = 0; i < n * n; i++) {
      c = lv.grid[i];
      if (!c) continue;
      px = X(i % n); py = Y((i / n) | 0);
      if (c.t === 'W') {
        var wr = cell * 0.41;
        rr(px - wr, py - wr, wr * 2, wr * 2, cell * 0.14);
        g.fillStyle = C.panel2;
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.08)';
        g.lineWidth = 1;
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.13)';
        g.beginPath();
        g.moveTo(px - wr * 0.6, py - wr * 0.55);
        g.lineTo(px + wr * 0.6, py - wr * 0.55);
        g.stroke();
      } else if (c.t === 'E') {
        var er = cell * 0.4;
        rr(px - er, py - er, er * 2, er * 2, cell * 0.16);
        g.fillStyle = C.panel2;
        g.fill();
        g.strokeStyle = 'rgba(255,237,194,0.35)';
        g.lineWidth = 1.3;
        g.stroke();
        g.save();
        g.globalCompositeOperation = low ? 'source-over' : 'lighter';
        g.fillStyle = WHITE;
        g.globalAlpha = 0.9;
        g.beginPath();                              /* aperture toward beam dir */
        g.arc(px + DX[c.d] * er * 0.55, py + DY[c.d] * er * 0.55, cell * 0.13, 0, PI * 2);
        g.fill();
        g.globalAlpha = 0.5;
        g.beginPath();
        g.arc(px, py, cell * 0.1, 0, PI * 2);
        g.fill();
        g.restore();
      } else if (c.t === 'M') {
        var ang = mirrorAngle(i);
        var L = cell * 0.86, Wd = cell * 0.15;
        g.save();
        g.translate(px, py);
        g.rotate(ang);
        rr(-L / 2, -Wd / 2, L, Wd, Wd / 2);
        g.fillStyle = mirGrad;
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 1;
        g.stroke();
        g.globalAlpha = 0.6;                        /* specular streak */
        g.beginPath();
        g.moveTo(-L * 0.32, -Wd * 0.18);
        g.lineTo(L * 0.1, -Wd * 0.18);
        g.stroke();
        g.restore();
      } else if (c.t === 'P') {
        var pr = cell * 0.34;
        g.save();
        g.translate(px, py);
        g.beginPath();
        g.moveTo(0, -pr);
        g.lineTo(pr * 0.87, pr * 0.5);
        g.lineTo(-pr * 0.87, pr * 0.5);
        g.closePath();
        g.fillStyle = 'rgba(235,245,255,0.13)';
        g.fill();
        g.strokeStyle = 'rgba(235,245,255,0.5)';
        g.lineWidth = 1.3;
        g.stroke();
        for (var j = 0; j < 3; j++) {               /* rainbow hint on edges */
          g.strokeStyle = JEWEL[j];
          g.globalAlpha = 0.55;
          g.beginPath();
          g.moveTo(-pr * 0.4 + j * 4, pr * 0.5 - 2);
          g.lineTo(-pr * 0.2 + j * 4, pr * 0.5 - 2);
          g.stroke();
        }
        g.restore();
      } else if (c.t === 'F') {
        g.save();
        g.strokeStyle = JEWEL[c.c];
        g.globalAlpha = 0.9;
        g.lineWidth = cell * 0.12;
        g.beginPath();
        g.arc(px, py, cell * 0.26, 0, PI * 2);
        g.stroke();
        if (!low) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.25;
          g.lineWidth = cell * 0.22;
          g.stroke();
        }
        g.restore();
      } else if (c.t === 'C') {
        drawCrystal(px, py, c, i, flare);
      }
    }
  }

  function drawHud() {
    var ru = api.lang === 'ru';
    g.textBaseline = 'middle';
    g.font = '600 13px -apple-system, sans-serif';
    g.fillStyle = C.muted;
    g.textAlign = 'left';
    g.fillText(api.t('level') + ' ' + (levelIdx + 1) + '/' + LEVELS, 14, hudTop / 2);
    g.textAlign = 'center';
    g.fillStyle = res.lit === res.total ? C.good : C.text;
    g.fillText('✦ ' + res.lit + '/' + res.total, cv.W / 2, hudTop / 2);
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    g.fillText(api.t('moves') + ' ' + taps + ' · ' + (ru ? 'цель' : 'par') + ' ' + lv.par,
      cv.W - 14, hudTop / 2);
    if (state === 'play' && taps >= 20) {
      rr(skip.x, skip.y, skip.w, skip.h, skip.h / 2);
      g.fillStyle = C.panel;
      g.fill();
      g.strokeStyle = C.accent;
      g.globalAlpha = 0.6;
      g.lineWidth = 1.2;
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.font = '600 14px -apple-system, sans-serif';
      g.fillText((ru ? 'Пропустить' : 'Skip') + ' −50',
        skip.x + skip.w / 2, skip.y + skip.h / 2);
    }
  }

  function draw() {
    var W = cv.W, H = cv.H, n = lv.n, i;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = velvet;                           /* velvet + vignette */
    g.fillRect(0, 0, W, H);
    if (!low) { g.fillStyle = glowUp; g.fillRect(0, 0, W, H); }

    /* subtle grid dots */
    g.fillStyle = C.muted;
    g.globalAlpha = 0.22;
    for (var gx = 1; gx < n; gx++) for (var gy = 1; gy < n; gy++) {
      g.fillRect(ox + gx * cell - 0.75, oy + gy * cell - 0.75, 1.5, 1.5);
    }
    g.globalAlpha = 1;

    var flare = 0;
    if (state === 'won' || state === 'done') {
      var wp = Math.min(1, (gt - wonAt) / 1400);
      flare = wp < 0.25 ? wp / 0.25 : 1 - (wp - 0.25) / 0.75;
    }

    drawBeams(flare);
    drawItems(flare);

    /* keyboard cursor */
    if (kb.on && state === 'play') {
      g.strokeStyle = C.accent;
      g.globalAlpha = 0.85;
      g.lineWidth = 2;
      rr(ox + kb.x * cell + 2, oy + kb.y * cell + 2, cell - 4, cell - 4, 6);
      g.stroke();
      g.globalAlpha = 1;
    }

    /* particles */
    if (parts.length) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        g.globalAlpha = Math.max(0, 1 - p.life / p.max) * 0.9;
        g.fillStyle = p.c;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, PI * 2);
        g.fill();
      }
      g.restore();
    }

    /* win: soft screen glow + score gain */
    if (flare > 0) {
      g.fillStyle = '#fff8e0';
      g.globalAlpha = 0.14 * flare;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = Math.min(1, flare * 1.6);
      g.fillStyle = C.good;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 26px -apple-system, sans-serif';
      g.fillText('+' + gained, W / 2, oy - 4 - flare * 8);
      g.globalAlpha = 1;
    }

    drawHud();

    /* level intro: fade-in + title */
    var ip = (gt - levelStart) / 800;
    if (ip < 1) {
      g.fillStyle = C.bg;
      g.globalAlpha = Math.max(0, 1 - ip * 2.5);
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1 - ip;
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = 'bold 30px -apple-system, sans-serif';
      g.fillText(api.t('level') + ' ' + (levelIdx + 1), W / 2, H * 0.42);
      g.globalAlpha = 1;
    }
  }

  /* ---------- main loop ---------- */

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(50, ts - last);
    last = ts;
    if (paused) return;
    gt += dt;
    updateParts(dt);
    if (!low && state === 'play') {                 /* idle sparkles on lit crystals */
      for (var i = 0; i < lv.n * lv.n; i++) {
        var c = lv.grid[i];
        if (c && c.t === 'C' && c.lit && parts.length < 90 && Math.random() < dt * 0.0011) {
          burst(X(i % lv.n), Y((i / lv.n) | 0), crysCol(c.c), 1);
        }
      }
    }
    if (state === 'won' && gt - wonAt > 1400) advance();
    draw();
  }

  /* boot */
  levelIdx = 0;
  score = 0;
  over = false;
  api.score(0);
  loadLevel();
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
