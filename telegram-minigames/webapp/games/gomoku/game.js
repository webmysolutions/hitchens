/* Gomoku — five in a row on 15x15. Black (you) moves first vs white AI. MG game module. */
(function () {
'use strict';

var N = 15, SZ = 225;
var DX = [1, 0, 1, 1], DY = [0, 1, 1, -1];

/* 1 = own stone, 0 = empty, 2 = opponent or wall */
function cellAt(bd, x, y, who) {
  if (x < 0 || x >= N || y < 0 || y >= N) return 2;
  var v = bd[y * N + x];
  return v === 0 ? 0 : (v === who ? 1 : 2);
}

/* Pattern value of placing `who` at (x,y) along one direction:
   five / open four / four / broken four / open three / broken three / ... */
function dirScore(bd, x, y, dx, dy, who) {
  var L = [], R = [], k;
  for (k = 1; k <= 4; k++) {
    L.push(cellAt(bd, x - dx * k, y - dy * k, who));
    R.push(cellAt(bd, x + dx * k, y + dy * k, who));
  }
  var c1 = 0; while (c1 < 4 && L[c1] === 1) c1++;
  var c2 = 0; while (c2 < 4 && R[c2] === 1) c2++;
  var o1 = c1 < 4 && L[c1] === 0, o2 = c2 < 4 && R[c2] === 0;
  var j1 = 0, j2 = 0;
  if (o1) { k = c1 + 1; while (k < 4 && L[k] === 1) { j1++; k++; } }
  if (o2) { k = c2 + 1; while (k < 4 && R[k] === 1) { j2++; k++; } }
  var n = c1 + c2 + 1;
  if (n >= 5) return 1e7;
  if (n === 4) return o1 && o2 ? 5e5 : (o1 || o2 ? 3e4 : 0);
  var m = n + (j1 > j2 ? j1 : j2); /* jump runs only counted through an open gap */
  if (m >= 4) return 28000;
  if (n === 3) return o1 && o2 ? 9000 : (o1 || o2 ? 1400 : 0);
  if (m === 3) return 3200;
  if (n === 2) return o1 && o2 ? 420 : (o1 || o2 ? 90 : 0);
  if (m === 2) return 200;
  return o1 && o2 ? 50 : (o1 || o2 ? 15 : 0);
}

function scoreCell(bd, i, who) {
  var x = i % N, y = (i / N) | 0, s = 0, d, v, fours = 0, threes = 0;
  for (d = 0; d < 4; d++) {
    v = dirScore(bd, x, y, DX[d], DY[d], who);
    s += v;
    if (v >= 28000 && v < 5e5) fours++;
    else if (v >= 9000 && v < 28000) threes++;
  }
  if (fours >= 2 || (fours && threes)) s += 3e5; /* double threat */
  else if (threes >= 2) s += 9e4;
  return s;
}

/* the winning line (5+ stones) through i, or null */
function winLine(bd, i) {
  var who = bd[i];
  if (!who) return null;
  var x = i % N, y = (i / N) | 0, d, k, cells, xx, yy;
  for (d = 0; d < 4; d++) {
    cells = [i];
    for (k = 1; k <= 4; k++) {
      xx = x + DX[d] * k; yy = y + DY[d] * k;
      if (cellAt(bd, xx, yy, who) !== 1) break;
      cells.push(yy * N + xx);
    }
    for (k = 1; k <= 4; k++) {
      xx = x - DX[d] * k; yy = y - DY[d] * k;
      if (cellAt(bd, xx, yy, who) !== 1) break;
      cells.unshift(yy * N + xx);
    }
    if (cells.length >= 5) return cells;
  }
  return null;
}

/* empty cells within distance 2 of any stone */
function candList(bd) {
  var out = [], seen = [], i, x, y, dx, dy, xx, yy, j, any = false;
  for (i = 0; i < SZ; i++) seen.push(0);
  for (i = 0; i < SZ; i++) {
    if (!bd[i]) continue;
    any = true;
    x = i % N; y = (i / N) | 0;
    for (dy = -2; dy <= 2; dy++) for (dx = -2; dx <= 2; dx++) {
      xx = x + dx; yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
      j = yy * N + xx;
      if (!bd[j] && !seen[j]) { seen[j] = 1; out.push(j); }
    }
  }
  if (!any) out.push(112);
  return out;
}

MG.register('gomoku', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var cv = api.createCanvas(), g = cv.g;
  var destroyed = false, paused = false, timers = {}, tseq = 0, raf = 0;

  function later(fn, ms) {
    var k = ++tseq;
    function tk() {
      if (destroyed) return;
      if (paused) { timers[k] = setTimeout(tk, 250); return; }
      delete timers[k];
      fn();
    }
    timers[k] = setTimeout(tk, ms);
  }
  function clearTimers() { for (var k in timers) clearTimeout(timers[k]); timers = {}; }
  function nowMs() { return Date.now(); }

  function pxc(s) {
    s = String(s || '').trim();
    var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function blend(a, b, t) {
    var A = pxc(a), B = pxc(b);
    if (!A || !B) return a;
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  var wood = blend(C.panel, '#96703c', 0.55);
  var woodEdge = blend(wood, '#000000', 0.4);
  var woodLine = blend(wood, '#000000', 0.45);
  var blackC = blend('#000000', C.panel, 0.18);
  var blackHi = blend('#ffffff', blackC, 0.68);
  var whiteC = blend('#ffffff', C.panel2, 0.12);
  var STARS = [3 + 3 * N, 11 + 3 * N, 7 + 7 * N, 3 + 11 * N, 11 + 11 * N];

  /* geometry */
  var TOP = 32, cell, x0, y0;
  function layout() {
    cell = Math.floor(Math.min(cv.W - 8, cv.H - TOP - 8) / N);
    x0 = Math.floor((cv.W - cell * N) / 2);
    y0 = TOP + Math.floor((cv.H - TOP - cell * N) / 2);
  }
  cv.onResize = function () { layout(); };
  function px(cx) { return x0 + cell / 2 + cx * cell; }
  function py(cy) { return y0 + cell / 2 + cy * cell; }

  /* state */
  var B, turn, over, busy, last, pmoves, winCells, pop;

  function saveNow() {
    if (over) return;
    api.save({ b: B.slice(), t: turn, l: last, m: pmoves });
  }
  function validSave(s) {
    if (!s || !s.b || s.b.length !== SZ || (s.t !== 1 && s.t !== -1)) return false;
    var nb = 0, nw = 0, i, v;
    for (i = 0; i < SZ; i++) {
      v = s.b[i];
      if (v !== 0 && v !== 1 && v !== -1) return false;
      if (v === 1) nb++; else if (v === -1) nw++;
    }
    if (!((nb === nw && s.t === 1) || (nb === nw + 1 && s.t === -1))) return false;
    if (typeof s.m !== 'number' || s.m !== (s.m | 0) || s.m < 0) return false;
    for (i = 0; i < SZ; i++) if (s.b[i] && winLine(s.b, i)) return false;
    return true;
  }

  function isFull() {
    for (var i = 0; i < SZ; i++) if (!B[i]) return false;
    return true;
  }

  function endGame(w) {
    over = true; busy = false;
    clearTimers();
    api.save(null);
    if (w === 1) {
      var sc = 100 + Math.max(0, 60 - pmoves);
      api.score(sc);
      api.haptic('success');
      api.gameOver(sc, { win: true });
    } else if (w === -1) {
      api.haptic('error');
      api.gameOver(10, { win: false });
    } else api.gameOver(50, { draw: true });
  }

  function playerPlace(i) {
    if (B[i]) return;
    api.haptic('light');
    B[i] = 1; last = i; pmoves++;
    pop = { i: i, t0: nowMs() };
    api.score(pmoves);
    var wl = winLine(B, i);
    if (wl) { winCells = wl; endGame(1); return; }
    if (isFull()) { endGame(0); return; }
    turn = -1;
    saveNow();
    aiGo();
  }

  function aiPlace(i) {
    busy = false;
    B[i] = -1; last = i;
    pop = { i: i, t0: nowMs() };
    var wl = winLine(B, i);
    if (wl) { winCells = wl; endGame(-1); return; }
    if (isFull()) { endGame(0); return; }
    turn = 1;
    saveNow();
  }

  /* opponent's best static answer after a hypothetical AI stone */
  function bestReply() {
    var cands = candList(B), b = 0, i, v;
    for (i = 0; i < cands.length; i++) {
      v = scoreCell(B, cands[i], 1) + 0.4 * scoreCell(B, cands[i], -1);
      if (v > b) b = v;
    }
    return b;
  }

  function aiGo() {
    if (over) return;
    busy = true;
    later(function () {
      if (over || destroyed) return;
      var cands = candList(B), arr = [], i, c, off, def;
      var winMove = -1, blockMove = -1, blockBest = -1;
      for (i = 0; i < cands.length; i++) {
        c = cands[i];
        off = scoreCell(B, c, -1);
        if (off >= 1e7) { winMove = c; break; }
        def = scoreCell(B, c, 1);
        if (def >= 1e7 && def > blockBest) { blockBest = def; blockMove = c; }
        arr.push({ i: c, v: off + def * 0.9 });
      }
      if (winMove >= 0) { aiPlace(winMove); return; }
      if (blockMove >= 0) { aiPlace(blockMove); return; }
      arr.sort(function (a, b) { return b.v - a.v; });
      var top = arr.slice(0, 8), k = 0, best = top[0].i, bestV = -Infinity;
      function chunk() {
        if (destroyed || over) return;
        var t0 = Date.now(), cd, val;
        while (k < top.length && Date.now() - t0 < 30) {
          cd = top[k++];
          B[cd.i] = -1;
          val = cd.v - bestReply() * 0.65;
          B[cd.i] = 0;
          if (val > bestV) { bestV = val; best = cd.i; }
        }
        if (k < top.length) { later(chunk, 16); return; }
        aiPlace(best);
      }
      later(chunk, 16);
    }, api.lowEnd ? 80 : 260);
  }

  function newGame(useSaved) {
    clearTimers();
    B = []; for (var i = 0; i < SZ; i++) B.push(0);
    turn = 1; over = false; busy = false; last = -1; pmoves = 0;
    winCells = null; pop = null;
    api.score(0);
    var s = useSaved ? api.load() : null;
    if (s && validSave(s)) {
      B = s.b.slice();
      turn = s.t;
      last = typeof s.l === 'number' && s.l >= -1 && s.l < SZ ? s.l : -1;
      pmoves = s.m;
      api.score(pmoves);
      if (turn === -1) aiGo();
    }
  }

  /* drawing */
  function drawStone(x, y, v, r) {
    var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    if (v === 1) { gr.addColorStop(0, blackHi); gr.addColorStop(1, blackC); }
    else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, whiteC); }
    g.beginPath();
    g.arc(x, y, r, 0, 6.2832);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.stroke();
  }
  function draw() {
    var t = nowMs(), i, x, y, v, r;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.font = 'bold 13px sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = C.text;
    g.fillText(over ? '' : (busy || turn === -1 ? api.t('thinking') : '⚫ ' + api.t('your_turn')), 10, TOP / 2);
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    g.fillText(api.t('moves') + ': ' + pmoves, cv.W - 46, TOP / 2);

    var side = cell * N;
    g.fillStyle = woodEdge;
    g.fillRect(x0 - 3, y0 - 3, side + 6, side + 6);
    g.fillStyle = wood;
    g.fillRect(x0, y0, side, side);
    g.strokeStyle = woodLine;
    g.lineWidth = 1;
    g.beginPath();
    for (i = 0; i < N; i++) {
      g.moveTo(px(0), py(i) + 0.5);
      g.lineTo(px(N - 1), py(i) + 0.5);
      g.moveTo(px(i) + 0.5, py(0));
      g.lineTo(px(i) + 0.5, py(N - 1));
    }
    g.stroke();
    g.fillStyle = woodLine;
    for (i = 0; i < STARS.length; i++) {
      g.beginPath();
      g.arc(px(STARS[i] % N), py((STARS[i] / N) | 0), 2.5, 0, 6.2832);
      g.fill();
    }
    for (i = 0; i < SZ; i++) {
      v = B[i];
      if (!v) continue;
      x = px(i % N); y = py((i / N) | 0);
      r = cell * 0.44;
      if (pop && pop.i === i && !api.lowEnd) {
        var p = Math.min(1, (t - pop.t0) / 130);
        r *= 0.55 + 0.45 * p;
        if (p >= 1) pop = null;
      }
      drawStone(x, y, v, r);
    }
    if (winCells) {
      g.lineWidth = 2.5;
      g.strokeStyle = C.good;
      for (i = 0; i < winCells.length; i++) {
        g.beginPath();
        g.arc(px(winCells[i] % N), py((winCells[i] / N) | 0), cell * 0.44 + 1.5, 0, 6.2832);
        g.stroke();
      }
    } else if (last >= 0) {
      g.fillStyle = C.accent;
      g.beginPath();
      g.arc(px(last % N), py((last / N) | 0), Math.max(2.5, cell * 0.1), 0, 6.2832);
      g.fill();
    }
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    draw();
  }

  /* input */
  function onPoint(x, y) {
    if (over || busy || paused || turn !== 1) return;
    var cx = Math.round((x - x0 - cell / 2) / cell);
    var cy = Math.round((y - y0 - cell / 2) / cell);
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return;
    if (Math.abs(x - px(cx)) > cell * 0.48 || Math.abs(y - py(cy)) > cell * 0.48) return;
    playerPlace(cy * N + cx);
  }
  function onDown(e) {
    var rect = cv.canvas.getBoundingClientRect();
    var cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
    var cy = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
    onPoint(cx - rect.left, cy - rect.top);
    if (e.cancelable && e.type === 'touchstart') e.preventDefault();
  }
  var evts = window.PointerEvent ? ['pointerdown'] : ['touchstart', 'mousedown'];
  for (var ei = 0; ei < evts.length; ei++) cv.canvas.addEventListener(evts[ei], onDown);

  /* restart button */
  var btn = document.createElement('button');
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  btn.style.cssText = 'position:absolute;top:4px;right:6px;z-index:5;border:0;border-radius:8px;' +
    'padding:3px 10px;font-size:18px;line-height:1.4;cursor:pointer;background:' + C.panel2 + ';color:' + C.text;
  container.appendChild(btn);
  btn.onclick = function () {
    api.haptic('light');
    api.save(null);
    newGame(false);
  };

  layout();
  newGame(true);
  raf = requestAnimationFrame(tick);

  return {
    destroy: function () {
      destroyed = true;
      cancelAnimationFrame(raf);
      clearTimers();
      for (var i = 0; i < evts.length; i++) cv.canvas.removeEventListener(evts[i], onDown);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
