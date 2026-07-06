/* 2048 — DOM tiles, swipe/arrow controls, save/resume. */
(function () {
'use strict';
MG.register('g2048', function (container, api) {
  var C = api.colors;
  var N = 4;
  var ANIM = api.lowEnd ? 0 : 90;
  var timers = [];
  var paused = false, over = false, won = false;
  var score = 0;
  var grid = [];                 // grid[r][c] = tile | null
  var boardPx = 0, gapPx = 0, cellPx = 0;

  function later(fn, ms) {
    if (!ms) { fn(); return; }
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
  }

  /* ---- color ramp panel2 -> accent by tile value ---- */
  function rgbOf(css) {
    var c = document.createElement('canvas');
    c.width = c.height = 1;
    var x = c.getContext('2d');
    x.fillStyle = css;
    x.fillRect(0, 0, 1, 1);
    var d = x.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  var RP = rgbOf(C.panel2), RA = rgbOf(C.accent), RT = rgbOf(C.text), RB = rgbOf(C.bg);
  function lum(a) { return 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]; }
  var LT = lum(RT), LB = lum(RB);
  function ramp(v) {
    var i = Math.round(Math.log(v) / Math.LN2) - 1;   // 2 -> 0, 2048 -> 10
    var t = Math.min(1, i / 10);
    return [Math.round(RP[0] + (RA[0] - RP[0]) * t),
            Math.round(RP[1] + (RA[1] - RP[1]) * t),
            Math.round(RP[2] + (RA[2] - RP[2]) * t)];
  }
  function tileBg(v) { var m = ramp(v); return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')'; }
  function tileFg(v) {
    var l = lum(ramp(v));
    return Math.abs(LT - l) >= Math.abs(LB - l) ? C.text : C.bg;
  }

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;';
  var board = document.createElement('div');
  board.style.cssText = 'position:relative;border-radius:12px;background:' + C.panel + ';';
  wrap.appendChild(board);
  container.appendChild(wrap);

  var bgCells = [];
  for (var bi = 0; bi < N * N; bi++) {
    var bd = document.createElement('div');
    bd.style.cssText = 'position:absolute;border-radius:8px;background:' + C.bg + ';opacity:.35;';
    board.appendChild(bd);
    bgCells.push(bd);
  }

  var toastEl = document.createElement('div');
  toastEl.style.cssText = 'position:absolute;left:50%;top:10%;transform:translateX(-50%);padding:8px 18px;' +
    'border-radius:10px;font-weight:700;font-size:16px;z-index:5;display:none;background:' + C.accent + ';color:' + C.bg + ';';
  wrap.appendChild(toastEl);
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    later(function () { toastEl.style.display = 'none'; }, 1600);
  }

  function pos(i) { return gapPx + i * (cellPx + gapPx); }
  function fontFor(v) {
    var len = ('' + v).length;
    var k = len <= 2 ? 0.5 : len === 3 ? 0.42 : len === 4 ? 0.34 : 0.28;
    return Math.max(10, Math.floor(cellPx * k)) + 'px';
  }
  function eachTile(fn) {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (grid[r][c]) fn(grid[r][c]);
  }
  function layout() {
    var w = container.clientWidth || 320, h = container.clientHeight || 480;
    boardPx = Math.min(440, Math.max(160, Math.floor(Math.min(w, h) * 0.92)));
    gapPx = Math.max(3, Math.round(boardPx * 0.025));
    cellPx = Math.floor((boardPx - gapPx * (N + 1)) / N);
    boardPx = cellPx * N + gapPx * (N + 1);
    board.style.width = board.style.height = boardPx + 'px';
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var d = bgCells[r * N + c];
      d.style.width = d.style.height = cellPx + 'px';
      d.style.left = pos(c) + 'px';
      d.style.top = pos(r) + 'px';
    }
    eachTile(function (t) { place(t, true); });
  }

  function place(t, instant) {
    var el = t.el;
    el.style.width = el.style.height = cellPx + 'px';
    el.style.fontSize = fontFor(t.v);
    if (instant && ANIM) el.style.transition = 'none';
    el.style.transform = 'translate(' + pos(t.c) + 'px,' + pos(t.r) + 'px)';
    if (instant && ANIM) { void el.offsetWidth; el.style.transition = 'transform ' + ANIM + 'ms ease'; }
  }
  function skin(t) {
    t.el.style.background = tileBg(t.v);
    t.el.style.color = tileFg(t.v);
    t.el.style.fontSize = fontFor(t.v);
    t.el.textContent = t.v;
  }
  function mkTile(r, c, v, popIn) {
    var el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;' +
      'border-radius:8px;font-weight:700;will-change:transform;' +
      (ANIM ? 'transition:transform ' + ANIM + 'ms ease;' : '');
    var t = { v: v, r: r, c: c, el: el, m: false };
    skin(t);
    el.style.width = el.style.height = cellPx + 'px';
    el.style.transform = 'translate(' + pos(c) + 'px,' + pos(r) + 'px)' + (popIn && ANIM ? ' scale(.3)' : '');
    board.appendChild(el);
    grid[r][c] = t;
    if (popIn && ANIM) later(function () { place(t); }, 20);
    return t;
  }

  function spawn() {
    var free = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (!grid[r][c]) free.push([r, c]);
    if (!free.length) return;
    var p = free[(Math.random() * free.length) | 0];
    mkTile(p[0], p[1], Math.random() < 0.9 ? 2 : 4, true);
  }

  function canMove() {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var t = grid[r][c];
      if (!t) return true;
      if (r + 1 < N && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
      if (c + 1 < N && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
    }
    return false;
  }

  function persist() {
    var b = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) b.push(grid[r][c] ? grid[r][c].v : 0);
    api.save({ b: b, s: score, w: won });
  }

  function move(dir) {
    if (over || paused) return;
    var vr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    var vc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    if (!vr && !vc) return;
    var rs = [0, 1, 2, 3], cs = [0, 1, 2, 3];
    if (vr === 1) rs.reverse();
    if (vc === 1) cs.reverse();
    var moved = false, gained = 0;
    eachTile(function (t) { t.m = false; });

    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var r = rs[i], c = cs[j];
      var t = grid[r][c];
      if (!t) continue;
      var nr = r, nc = c, target = null;
      for (;;) {
        var tr = nr + vr, tc = nc + vc;
        if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
        var o = grid[tr][tc];
        if (!o) { nr = tr; nc = tc; continue; }
        if (o.v === t.v && !o.m) target = o;
        break;
      }
      if (target) {
        grid[r][c] = null;
        t.r = target.r; t.c = target.c;
        target.m = true;
        target.v *= 2;
        gained += target.v;
        moved = true;
        t.el.style.zIndex = 2;
        place(t);
        (function (loser, winner) {
          later(function () {
            if (loser.el.parentNode) loser.el.parentNode.removeChild(loser.el);
            skin(winner);
            if (ANIM) {
              winner.el.style.transform = 'translate(' + pos(winner.c) + 'px,' + pos(winner.r) + 'px) scale(1.1)';
              later(function () { place(winner); }, 80);
            }
          }, ANIM);
        })(t, target);
        if (target.v >= 2048 && !won) {
          won = true;
          api.haptic('success');
          toast(api.t('you_win'));
        } else if (target.v >= 128) {
          api.haptic('light');
        }
      } else if (nr !== r || nc !== c) {
        grid[r][c] = null;
        grid[nr][nc] = t;
        t.r = nr; t.c = nc;
        place(t);
        moved = true;
      }
    }

    if (!moved) return;
    if (gained) { score += gained; api.score(score); }
    spawn();
    if (canMove()) {
      persist();
    } else {
      over = true;
      api.save(null);
      api.haptic('error');
      later(function () { api.gameOver(score); }, ANIM + 80);
    }
  }

  /* ---- input ---- */
  var offSwipe = api.swipe(container, function (d) { if (d !== 'tap') move(d); });
  function onKey(e) {
    var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);
  function onResize() { layout(); }
  window.addEventListener('resize', onResize);

  /* ---- start (resume from save if present) ---- */
  grid = [];
  for (var gr = 0; gr < N; gr++) grid.push([null, null, null, null]);
  layout();
  var st = api.load();
  if (st && st.b && st.b.length === N * N && st.b.some(function (v) { return v > 0; })) {
    score = Math.max(0, st.s | 0);
    won = !!st.w;
    for (var li = 0; li < N * N; li++) {
      if (st.b[li] > 0) mkTile((li / N) | 0, li % N, st.b[li], false);
    }
  } else {
    spawn();
    spawn();
    persist();
  }
  api.score(score);
  if (!canMove()) {
    over = true;
    api.save(null);
    later(function () { api.gameOver(score); }, 100);
  }

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      offSwipe();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
