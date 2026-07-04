/* Neon Flow — connect matching dots with glowing pipes, fill the whole grid. */
(function () {
'use strict';

/* ---------- level generator (pure, no DOM) ---------- */
/*GEN*/
function flowNbs(c, n, owner, unvisitedOnly) {
  var x = c % n, y = (c / n) | 0, r = [];
  if (x > 0 && (!unvisitedOnly || owner[c - 1] < 0)) r.push(c - 1);
  if (x < n - 1 && (!unvisitedOnly || owner[c + 1] < 0)) r.push(c + 1);
  if (y > 0 && (!unvisitedOnly || owner[c - n] < 0)) r.push(c - n);
  if (y < n - 1 && (!unvisitedOnly || owner[c + n] < 0)) r.push(c + n);
  return r;
}

/* One attempt: random-walk snake partition of the n*n grid, then merge
   too-short paths into adjacent path endpoints. Returns array of paths
   (each an array of cell indices) or null on failure. */
function flowTry(n) {
  var total = n * n, i, a;
  var owner = new Array(total);
  for (i = 0; i < total; i++) owner[i] = -1;
  var paths = [];
  var left = total;

  while (left > 0) {
    var start = -1, t, c;
    for (t = 0; t < 24; t++) {
      c = (Math.random() * total) | 0;
      if (owner[c] < 0) { start = c; break; }
    }
    if (start < 0) for (c = 0; c < total; c++) if (owner[c] < 0) { start = c; break; }
    var idx = paths.length, path = [start];
    owner[start] = idx; left--;
    while (true) {
      var un = flowNbs(path[path.length - 1], n, owner, true);
      if (!un.length) break;
      var nx = un[(Math.random() * un.length) | 0];
      path.push(nx); owner[nx] = idx; left--;
    }
    paths.push(path);
  }

  /* merge paths shorter than 3 into a neighboring path's endpoint */
  var guard = 0;
  while (guard++ < 300) {
    var si = -1;
    for (i = 0; i < paths.length; i++) if (paths[i].length < 3) { si = i; break; }
    if (si < 0) break;
    var sp = paths[si];
    var ends = sp.length === 1 ? [0] : [0, sp.length - 1];
    var merged = false;
    outer:
    for (var e = 0; e < ends.length; e++) {
      var ec = sp[ends[e]];
      var around = flowNbs(ec, n, owner, false);
      for (a = 0; a < around.length; a++) {
        var m = around[a], j = owner[m];
        if (j === si) continue;
        var pj = paths[j];
        if (m !== pj[0] && m !== pj[pj.length - 1]) continue;
        var A = sp.slice();
        if (ends[e] === 0 && A.length > 1) A.reverse(); /* ec last */
        var B = pj.slice();
        if (m === B[B.length - 1]) B.reverse();         /* m first */
        paths[j] = A.concat(B);
        paths.splice(si, 1);
        for (i = 0; i < paths.length; i++)
          for (a = 0; a < paths[i].length; a++) owner[paths[i][a]] = i;
        merged = true;
        break outer;
      }
    }
    if (!merged) return null;
  }

  var K = paths.length;
  if (K < 4 || K > 9) return null;
  for (i = 0; i < K; i++) if (paths[i].length < 3) return null;
  return paths;
}

/* Deterministic serpentine split — always a valid full partition. */
function flowFallback(n) {
  var cells = [], x, y;
  for (y = 0; y < n; y++)
    for (x = 0; x < n; x++)
      cells.push(y * n + (y % 2 ? n - 1 - x : x));
  var total = n * n;
  var K = Math.max(4, Math.min(9, (total / 5) | 0));
  var paths = [], p = 0, k;
  for (k = 0; k < K; k++) {
    var len = ((total / K) | 0) + (k < total % K ? 1 : 0);
    paths.push(cells.slice(p, p + len));
    p += len;
  }
  return paths;
}

function flowGen(n) {
  for (var t = 0; t < 600; t++) {
    var p = flowTry(n);
    if (p) return p;
  }
  return flowFallback(n);
}
/*ENDGEN*/

/* ---------- game ---------- */
MG.register('flow', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g, C = api.colors, LOW = api.lowEnd;
  var canvas = cv.canvas;
  canvas.style.touchAction = 'none';

  var LEVELS = 12;
  var RU = api.lang === 'ru';
  var PIPES_L = RU ? 'ТРУБЫ' : 'PIPES';

  /* 8 distinct accessible HSL hues + 1 pearl for K=9 */
  function mkCol(h) {
    return {
      main: 'hsl(' + h + ',90%,60%)',
      core: 'hsl(' + h + ',100%,79%)',
      glow: 'hsla(' + h + ',95%,62%,',
      dim: 'hsl(' + h + ',55%,34%)'
    };
  }
  var HUES = [187, 332, 128, 47, 268, 12, 214, 86];
  var PAL = [];
  for (var hi = 0; hi < 8; hi++) PAL.push(mkCol(HUES[hi]));
  PAL.push({ main: 'hsl(210,22%,80%)', core: 'hsl(210,35%,96%)', glow: 'hsla(210,35%,86%,', dim: 'hsl(210,14%,42%)' });

  var level = 1, totalScore = 0, ended = false;
  var size = 5, sol = null, K = 0;
  var dotCol = null;   /* cell -> pair index or -1 */
  var dots = null;     /* pair -> [cellA, cellB] */
  var CP = null;       /* pair -> palette index */
  var paths = null, done = null, moves = 0, perfect = true;
  var mode = 'play', flowT = 0, perfectWin = false;
  var cell = 10, ox = 0, oy = 0, HUD = 44;
  var hover = -1, active = -1, rect = null, ptrId = -1;
  var time = 0, raf = 0, last = 0, paused = false;
  var sparks = [], confetti = [], flares = [];
  var bg = null;

  /* ----- helpers ----- */
  function cx(c) { return ox + (c % size + 0.5) * cell; }
  function cy(c) { return oy + (((c / size) | 0) + 0.5) * cell; }

  function shufIdx(n) {
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function findPath(c) {
    for (var k = 0; k < K; k++) {
      var i = paths[k].indexOf(c);
      if (i >= 0) return { k: k, i: i };
    }
    return null;
  }

  function covered() {
    var s = 0;
    for (var k = 0; k < K; k++) s += paths[k].length;
    return s;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ----- layout & background ----- */
  function layout() {
    cell = Math.floor(Math.min((cv.W - 18) / size, (cv.H - HUD - 22) / size));
    ox = ((cv.W - cell * size) / 2) | 0;
    oy = HUD + (((cv.H - HUD - cell * size) / 2) | 0);
    buildBg();
  }
  cv.onResize = function () { rect = null; layout(); };

  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = Math.max(2, Math.round(cv.W * cv.dpr));
    bg.height = Math.max(2, Math.round(cv.H * cv.dpr));
    var b = bg.getContext('2d');
    b.scale(cv.dpr, cv.dpr);
    var gr = b.createLinearGradient(0, 0, 0, cv.H);
    gr.addColorStop(0, C.bg);
    gr.addColorStop(1, C.panel);
    b.fillStyle = gr;
    b.fillRect(0, 0, cv.W, cv.H);
    /* faint staggered hex-dot texture */
    if (!LOW) {
      b.fillStyle = 'rgba(150,190,255,0.045)';
      var s = 26, row = 0, y, x;
      for (y = 6; y < cv.H + s; y += s * 0.866, row++) {
        for (x = (row % 2 ? s / 2 : 0) + 6; x < cv.W + s; x += s) {
          b.beginPath(); b.arc(x, y, 1.3, 0, 7); b.fill();
        }
      }
    }
    /* board panel */
    roundRect(b, ox - 9, oy - 9, cell * size + 18, cell * size + 18, 14);
    b.fillStyle = 'rgba(255,255,255,0.03)';
    b.fill();
    b.strokeStyle = 'rgba(140,190,255,0.10)';
    b.lineWidth = 1;
    b.stroke();
    /* cell grid */
    b.strokeStyle = 'rgba(255,255,255,0.055)';
    for (var cy2 = 0; cy2 < size; cy2++) {
      for (var cx2 = 0; cx2 < size; cx2++) {
        roundRect(b, ox + cx2 * cell + 2, oy + cy2 * cell + 2, cell - 4, cell - 4, Math.min(8, cell * 0.2));
        b.stroke();
      }
    }
  }

  /* ----- level flow ----- */
  function newLevel() {
    size = Math.min(9, 5 + (((level - 1) / 3) | 0));
    sol = flowGen(size);
    K = sol.length;
    CP = shufIdx(PAL.length).slice(0, K);
    dotCol = new Array(size * size);
    for (var i = 0; i < dotCol.length; i++) dotCol[i] = -1;
    dots = []; paths = []; done = [];
    for (var k = 0; k < K; k++) {
      var p = sol[k];
      dots.push([p[0], p[p.length - 1]]);
      dotCol[p[0]] = k;
      dotCol[p[p.length - 1]] = k;
      paths.push([]);
      done.push(false);
    }
    moves = 0; perfect = true;
    mode = 'play'; flowT = 0;
    active = -1; hover = -1;
    sparks.length = 0; confetti.length = 0; flares.length = 0;
    layout();
  }

  function addFlare(c, pal) {
    flares.push({ x: cx(c), y: cy(c), t: 0, pal: pal });
  }

  function burstConfetti() {
    var n = LOW ? 18 : 70;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = 0.08 + Math.random() * 0.25;
      confetti.push({
        x: cv.W / 2, y: oy + cell * size * 0.4,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.22,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.02,
        life: 1400 + Math.random() * 600,
        pal: CP[(Math.random() * K) | 0],
        s: 3 + Math.random() * 4
      });
    }
  }

  function checkWin() {
    for (var k = 0; k < K; k++) if (!done[k]) return;
    if (covered() !== size * size) return;
    perfectWin = perfect;
    totalScore += 100 + (perfectWin ? 50 : 0);
    api.score(totalScore);
    api.haptic('success');
    mode = 'flow'; flowT = 0;
    active = -1;
    burstConfetti();
  }

  function advance() {
    if (level >= LEVELS) {
      if (!ended) { ended = true; mode = 'over'; api.gameOver(totalScore, { win: true }); }
      return;
    }
    level++;
    newLevel();
  }

  /* ----- input ----- */
  function evCell(e) {
    if (!rect) rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left - ox, y = e.clientY - rect.top - oy;
    var col = Math.floor(x / cell), row = Math.floor(y / cell);
    if (col < 0 || row < 0 || col >= size || row >= size) return -1;
    return row * size + col;
  }

  function pairDone(k) {
    done[k] = true;
    api.haptic('medium');
    addFlare(dots[k][0], CP[k]);
    addFlare(dots[k][1], CP[k]);
    active = -1;
    checkWin();
  }

  function emitSparks(c, pal) {
    if (LOW) return;
    for (var i = 0; i < 3; i++) {
      var a = Math.random() * Math.PI * 2, v = 0.02 + Math.random() * 0.08;
      sparks.push({
        x: cx(c), y: cy(c),
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 260 + Math.random() * 220, pal: pal
      });
    }
  }

  function tryStep(nc) {
    var p = paths[active];
    var idx = p.indexOf(nc);
    if (idx >= 0) { /* back over own pipe: truncate */
      if (idx < p.length - 1) { p.length = idx + 1; perfect = false; }
      return true;
    }
    var dc = dotCol[nc];
    if (dc >= 0) {
      if (dc !== active) return false;      /* foreign dot blocks */
      p.push(nc);
      emitSparks(nc, CP[active]);
      pairDone(active);                     /* reached own second dot */
      return true;
    }
    var f = findPath(nc);
    if (f) { /* cut the other pipe at this cell */
      paths[f.k].length = f.i;
      done[f.k] = false;
      perfect = false;
    }
    p.push(nc);
    emitSparks(nc, CP[active]);
    return true;
  }

  function walkTo(target) {
    var safety = 0;
    while (safety++ < 48) {
      if (active < 0 || done[active]) return;
      var p = paths[active];
      var h = p[p.length - 1];
      if (h === target) return;
      var hx = h % size, hy = (h / size) | 0;
      var tx = target % size, ty = (target / size) | 0;
      var dx = tx - hx, dy = ty - hy;
      var opts = [];
      var sx = h + (dx > 0 ? 1 : -1), sy = h + (dy > 0 ? size : -size);
      if (Math.abs(dx) >= Math.abs(dy)) { if (dx) opts.push(sx); if (dy) opts.push(sy); }
      else { if (dy) opts.push(sy); if (dx) opts.push(sx); }
      var moved = false;
      for (var o = 0; o < opts.length; o++) if (tryStep(opts[o])) { moved = true; break; }
      if (!moved) return;
    }
  }

  function onDown(e) {
    if (paused || mode !== 'play') return;
    e.preventDefault();
    var c = evCell(e);
    hover = c;
    if (c < 0) return;
    var dc = dotCol[c];
    if (dc >= 0) {
      if (paths[dc].length > 1) perfect = false;   /* redraw */
      paths[dc] = [c];
      done[dc] = false;
      active = dc;
      moves++;
    } else {
      var f = findPath(c);
      if (!f) return;
      active = f.k;
      var p = paths[f.k];
      if (f.i < p.length - 1) {
        p.length = f.i + 1;
        done[f.k] = false;
        perfect = false;
      }
      moves++;
    }
    ptrId = e.pointerId;
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(ptrId); } catch (x) {} }
  }

  function onMove(e) {
    if (paused || mode !== 'play') return;
    var c = evCell(e);
    hover = c;
    if (active < 0 || e.pointerId !== ptrId || c < 0) return;
    e.preventDefault();
    walkTo(c);
  }

  function onUp(e) {
    if (e.pointerId === ptrId) { active = -1; ptrId = -1; }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /* ----- particles ----- */
  function updateFx(dt) {
    var i;
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.98; s.vy *= 0.98;
    }
    for (i = confetti.length - 1; i >= 0; i--) {
      var f = confetti[i];
      f.life -= dt;
      if (f.life <= 0) { confetti.splice(i, 1); continue; }
      f.vy += 0.0006 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.rot += f.vr * dt;
    }
    for (i = flares.length - 1; i >= 0; i--) {
      flares[i].t += dt;
      if (flares[i].t > 520) flares.splice(i, 1);
    }
  }

  /* ----- drawing ----- */
  function strokePath(p, style, w) {
    if (p.length === 0) return;
    if (p.length === 1) {
      g.fillStyle = style;
      g.beginPath(); g.arc(cx(p[0]), cy(p[0]), w / 2, 0, 7); g.fill();
      return;
    }
    g.strokeStyle = style;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx(p[0]), cy(p[0]));
    for (var i = 1; i < p.length; i++) g.lineTo(cx(p[i]), cy(p[i]));
    g.stroke();
  }

  function drawPipes() {
    var surge = 0;
    if (mode === 'flow') surge = 0.5 + 0.5 * Math.sin(time * 0.012);
    for (var k = 0; k < K; k++) {
      var p = paths[k];
      if (!p.length) continue;
      var col = PAL[CP[k]];
      if (LOW) {
        strokePath(p, mode === 'flow' ? col.core : col.main, cell * 0.4);
        continue;
      }
      /* soft outer glow */
      strokePath(p, col.glow + (0.26 + surge * 0.3) + ')', cell * (0.62 + surge * 0.16));
      /* body + bright core */
      strokePath(p, col.main, cell * 0.36);
      strokePath(p, col.core, cell * 0.15);
      /* liquid pulse flowing along completed pipes */
      if ((done[k] || mode === 'flow') && p.length > 1) {
        g.save();
        g.setLineDash([cell * 0.7, cell * 1.5]);
        g.lineDashOffset = -time * (mode === 'flow' ? 0.34 : 0.12);
        strokePath(p, 'rgba(255,255,255,' + (0.28 + surge * 0.35) + ')', cell * 0.14);
        g.restore();
      }
    }
  }

  function drawDots() {
    for (var k = 0; k < K; k++) {
      var col = PAL[CP[k]];
      for (var e = 0; e < 2; e++) {
        var c = dots[k][e], x = cx(c), y = cy(c);
        var r = cell * 0.30;
        var pu = done[k] ? 1 + 0.08 * Math.sin(time * 0.007 + k) : 1;
        if (mode === 'flow') pu = 1.12 + 0.1 * Math.sin(time * 0.014 + k);
        if (!LOW) {
          g.fillStyle = col.glow + (done[k] ? '0.28)' : '0.13)');
          g.beginPath(); g.arc(x, y, r * 2.0 * pu, 0, 7); g.fill();
          g.fillStyle = col.glow + '0.32)';
          g.beginPath(); g.arc(x, y, r * 1.4 * pu, 0, 7); g.fill();
        }
        g.fillStyle = done[k] ? col.core : col.main;
        g.beginPath(); g.arc(x, y, r * pu, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,' + (done[k] ? 0.8 : 0.45) + ')';
        g.beginPath(); g.arc(x - r * 0.26, y - r * 0.3, r * 0.26, 0, 7); g.fill();
      }
    }
  }

  function drawFx() {
    var i;
    for (i = 0; i < flares.length; i++) {
      var fl = flares[i], q = fl.t / 520;
      g.strokeStyle = PAL[fl.pal].glow + (0.7 * (1 - q)) + ')';
      g.lineWidth = 3 * (1 - q) + 1;
      g.beginPath();
      g.arc(fl.x, fl.y, cell * (0.34 + q * 0.85), 0, 7);
      g.stroke();
    }
    for (i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      g.fillStyle = PAL[s.pal].core;
      g.globalAlpha = Math.max(0, Math.min(1, s.life / 300));
      g.beginPath(); g.arc(s.x, s.y, 1.8, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    for (i = 0; i < confetti.length; i++) {
      var f = confetti[i];
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.rot);
      g.globalAlpha = Math.max(0, Math.min(1, f.life / 500));
      g.fillStyle = PAL[f.pal].main;
      g.fillRect(-f.s / 2, -f.s / 4, f.s, f.s / 2);
      g.restore();
    }
    g.globalAlpha = 1;
  }

  function drawHud() {
    var y = HUD / 2 + 2;
    g.font = '600 13px system-ui,-apple-system,sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = C.muted;
    g.fillText(api.t('level').toUpperCase(), 14, y - 8);
    g.fillStyle = C.text;
    g.font = '700 15px system-ui,-apple-system,sans-serif';
    g.fillText(level + '/' + LEVELS, 14, y + 9);

    var pct = Math.round(covered() / (size * size) * 100);
    g.textAlign = 'center';
    g.fillStyle = C.muted;
    g.font = '600 13px system-ui,-apple-system,sans-serif';
    g.fillText(PIPES_L, cv.W / 2, y - 8);
    g.fillStyle = pct === 100 ? C.good : C.accent;
    g.font = '700 15px system-ui,-apple-system,sans-serif';
    g.fillText(pct + '%', cv.W / 2, y + 9);

    g.textAlign = 'right';
    g.fillStyle = C.muted;
    g.font = '600 13px system-ui,-apple-system,sans-serif';
    g.fillText(api.t('moves').toUpperCase(), cv.W - 14, y - 8);
    g.fillStyle = C.text;
    g.font = '700 15px system-ui,-apple-system,sans-serif';
    g.fillText('' + moves, cv.W - 14, y + 9);
  }

  function draw() {
    g.drawImage(bg, 0, 0, cv.W, cv.H);
    /* finger cell highlight */
    if (mode === 'play' && hover >= 0) {
      var hx = ox + (hover % size) * cell, hy = oy + ((hover / size) | 0) * cell;
      roundRect(g, hx + 2, hy + 2, cell - 4, cell - 4, Math.min(8, cell * 0.2));
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fill();
      if (active >= 0) {
        g.strokeStyle = PAL[CP[active]].glow + '0.7)';
        g.lineWidth = 2;
        g.stroke();
      }
    }
    drawPipes();
    drawDots();
    /* live pipe head marker */
    if (active >= 0 && paths[active].length) {
      var h = paths[active][paths[active].length - 1];
      g.fillStyle = PAL[CP[active]].core;
      g.globalAlpha = 0.75 + 0.25 * Math.sin(time * 0.02);
      g.beginPath(); g.arc(cx(h), cy(h), cell * 0.2, 0, 7); g.fill();
      g.globalAlpha = 1;
    }
    drawFx();
    drawHud();
    if (mode === 'flow' && perfectWin) {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 20px system-ui,-apple-system,sans-serif';
      g.fillStyle = C.good;
      g.globalAlpha = 0.6 + 0.4 * Math.sin(time * 0.01);
      g.fillText((RU ? 'ИДЕАЛЬНО +50' : 'PERFECT +50'), cv.W / 2, oy - 18);
      g.globalAlpha = 1;
    }
  }

  /* ----- main loop ----- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last || 16);
    last = ts;
    time += dt;
    updateFx(dt);
    if (mode === 'flow') {
      flowT += dt;
      if (flowT > 1650) advance();
    }
    draw();
  }

  api.score(0);
  newLevel();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
