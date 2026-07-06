/* Road Cross (frogger) — hop across roads and the river. MG contract game. */
(function () {
'use strict';
MG.register('frogger', function (container, api) {
  var cv = api.createCanvas(), g = cv.g, C = api.colors;
  var RU = api.lang === 'ru';
  var COLS = 11, ROWS = 13; // 0 homes, 1-5 river, 6 median, 7-11 roads, 12 start
  var HCOLS = [1, 3, 5, 7, 9];
  var cell = 10, ox = 0, oy = 0;
  var raf = 0, lastT = 0, paused = false, over = false, started = false;
  var score = 0, lives = 3, level = 1, tms = 0;
  var frog = { cx: 5, row: 12, bestRow: 12 };
  var deadT = 0, deadEmo = '💥', frogTime = 30000, bannerT = 0;
  var homes = [false, false, false, false, false];
  var lanes = [];

  function layout() {
    cell = Math.floor(Math.min(cv.W / COLS, cv.H / ROWS));
    ox = Math.floor((cv.W - cell * COLS) / 2);
    oy = Math.floor((cv.H - cell * ROWS) / 2);
  }
  cv.onResize = function () { layout(); };

  function buildLanes() {
    lanes.length = 0;
    var spd = 0.0016 * Math.pow(1.16, level - 1);
    var defs = [
      { row: 11, dir: 1, sp: 1.0, len: 1, n: 3 },
      { row: 10, dir: -1, sp: 1.4, len: 1, n: 2 },
      { row: 9, dir: 1, sp: 0.8, len: 2, n: 2 },
      { row: 8, dir: -1, sp: 1.9, len: 1, n: 1 },
      { row: 7, dir: 1, sp: 1.2, len: 1, n: 3 },
      { row: 5, dir: -1, sp: 0.9, len: 3, n: 2, t: 0 },
      { row: 4, dir: 1, sp: 1.1, len: 3, n: 2, t: 1 },
      { row: 3, dir: -1, sp: 1.5, len: 2, n: 3, t: 0 },
      { row: 2, dir: 1, sp: 0.7, len: 4, n: 2, t: 0 },
      { row: 1, dir: -1, sp: 1.2, len: 2, n: 3, t: 1 }
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var L = { row: d.row, dir: d.dir, sp: d.sp * spd, len: d.len,
        river: d.row <= 5, tur: !!d.t, span: COLS + d.len + 2,
        ph: Math.random() * 4200, col: i % 3, items: [] };
      var per = L.span / d.n;
      for (var j = 0; j < d.n; j++) L.items.push({ x: j * per + Math.random() * 1.2 });
      lanes.push(L);
    }
  }
  function itemPos(L, it) {
    var w = ((it.x % L.span) + L.span) % L.span;
    return L.dir > 0 ? w - L.len - 1 : COLS + 1 - w;
  }
  function subDown(L) { // diving turtles are not platforms
    if (!L.tur) return false;
    return ((tms + L.ph) % 4200) > 3300;
  }
  function subWarn(L) {
    if (!L.tur) return false;
    var p = (tms + L.ph) % 4200;
    return p > 2600 && p <= 3300 && ((p / 130) | 0) % 2 === 0;
  }
  function laneAt(row) {
    for (var i = 0; i < lanes.length; i++) if (lanes[i].row === row) return lanes[i];
    return null;
  }
  function platformAt(L, cxf) {
    if (subDown(L)) return 0;
    var c = cxf + 0.5;
    for (var j = 0; j < L.items.length; j++) {
      var p = itemPos(L, L.items[j]);
      if (c > p - 0.2 && c < p + L.len + 0.2) return 1;
    }
    return 0;
  }

  function resetFrog() {
    frog.cx = 5; frog.row = 12; frog.bestRow = 12;
    frogTime = 30000;
  }
  function die(emo) {
    if (deadT > 0 || over) return;
    deadEmo = emo;
    deadT = 750;
    api.haptic('error');
  }
  function afterDeath() {
    lives--;
    if (lives <= 0) { over = true; api.gameOver(score); return; }
    resetFrog();
  }
  function levelUp() {
    score += 200; api.score(score);
    api.haptic('success');
    level++;
    for (var i = 0; i < 5; i++) homes[i] = false;
    buildLanes();
    resetFrog();
    bannerT = 1300;
  }
  function hop(d) {
    if (over || deadT > 0 || paused) return;
    if (!started) { started = true; if (d === 'tap') return; }
    if (d === 'tap') d = 'up';
    var dc = d === 'left' ? -1 : d === 'right' ? 1 : 0;
    var dr = d === 'up' ? -1 : d === 'down' ? 1 : 0;
    if (!dc && !dr) return;
    if (dc) {
      var nx = frog.cx + dc;
      if (nx < 0 || nx > COLS - 1) return;
      frog.cx = nx;
      return;
    }
    var nr = frog.row + dr;
    if (nr < 0 || nr > 12) return;
    var col = Math.round(frog.cx);
    if (nr === 0) {
      for (var h = 0; h < 5; h++) {
        if (HCOLS[h] === col && !homes[h]) {
          homes[h] = true;
          score += 50; api.score(score);
          api.haptic('success');
          var full = true;
          for (var k = 0; k < 5; k++) if (!homes[k]) full = false;
          if (full) levelUp(); else resetFrog();
          return;
        }
      }
      die('💥');
      return;
    }
    frog.row = nr;
    var L = laneAt(nr);
    if (!L || !L.river) frog.cx = col;
    if (nr < frog.bestRow) { frog.bestRow = nr; score += 10; api.score(score); }
  }

  function update(dt) {
    tms += dt;
    if (over) return;
    if (bannerT > 0) bannerT -= dt;
    for (var i = 0; i < lanes.length; i++) {
      var L = lanes[i];
      for (var j = 0; j < L.items.length; j++) L.items[j].x += L.sp * dt;
    }
    if (!started) return;
    if (deadT > 0) {
      deadT -= dt;
      if (deadT <= 0) afterDeath();
      return;
    }
    frogTime -= dt;
    if (frogTime <= 0) { die('⏳'); return; }
    var FL = laneAt(frog.row);
    if (FL && FL.river) {
      if (!platformAt(FL, frog.cx)) { die('💦'); return; }
      frog.cx += (FL.dir > 0 ? FL.sp : -FL.sp) * dt;
      if (frog.cx < -0.4 || frog.cx > COLS - 0.6) { die('💦'); return; }
    } else if (FL) { // road: car collision
      var a = frog.cx + 0.18, b = frog.cx + 0.82;
      for (var k = 0; k < FL.items.length; k++) {
        var p = itemPos(FL, FL.items[k]);
        if (b > p + 0.08 && a < p + FL.len - 0.08) { die('💥'); return; }
      }
    }
  }

  function rowY(r) { return oy + r * cell; }
  function draw() {
    var W = cv.W, H = cv.H, i, j;
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    // river
    g.fillStyle = C.panel2;
    g.fillRect(ox, rowY(1), cell * COLS, cell * 5);
    g.globalAlpha = 0.25; g.fillStyle = C.accent;
    g.fillRect(ox, rowY(1), cell * COLS, cell * 5);
    g.globalAlpha = 1;
    // roads
    g.fillStyle = C.panel;
    g.fillRect(ox, rowY(7), cell * COLS, cell * 5);
    g.globalAlpha = 0.3; g.strokeStyle = C.muted;
    for (i = 8; i <= 11; i++) {
      g.beginPath();
      for (j = 0; j < COLS; j++) { g.moveTo(ox + j * cell + 3, rowY(i)); g.lineTo(ox + j * cell + cell - 5, rowY(i)); }
      g.stroke();
    }
    g.globalAlpha = 1;
    // safe rows
    g.globalAlpha = 0.18; g.fillStyle = C.good;
    g.fillRect(ox, rowY(6), cell * COLS, cell);
    g.fillRect(ox, rowY(12), cell * COLS, cell);
    g.globalAlpha = 1;
    // homes
    g.fillStyle = C.panel2;
    g.fillRect(ox, rowY(0), cell * COLS, cell);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = 0; i < 5; i++) {
      var hx = ox + HCOLS[i] * cell;
      g.fillStyle = C.bg;
      g.fillRect(hx + 2, rowY(0) + 2, cell - 4, cell - 4);
      if (homes[i]) {
        g.font = (cell - 6) + 'px sans-serif';
        g.fillText('🐸', hx + cell / 2, rowY(0) + cell / 2 + 1);
      }
    }
    // lane items
    for (i = 0; i < lanes.length; i++) {
      var L = lanes[i], y = rowY(L.row);
      for (j = 0; j < L.items.length; j++) {
        var p = itemPos(L, L.items[j]), x = ox + p * cell;
        if (L.river) {
          if (L.tur) {
            if (subDown(L)) continue;
            g.fillStyle = subWarn(L) ? C.muted : C.good;
            for (var t = 0; t < L.len; t++) {
              g.beginPath();
              g.arc(x + t * cell + cell / 2, y + cell / 2, cell * 0.38, 0, 6.29);
              g.fill();
            }
          } else {
            g.fillStyle = C.panel;
            g.fillRect(x + 1, y + cell * 0.16, L.len * cell - 2, cell * 0.68);
            g.strokeStyle = C.muted; g.globalAlpha = 0.5;
            g.strokeRect(x + 1, y + cell * 0.16, L.len * cell - 2, cell * 0.68);
            g.globalAlpha = 1;
          }
        } else {
          g.fillStyle = L.col === 0 ? C.accent : L.col === 1 ? C.bad : C.muted;
          var cy2 = y + cell * 0.18, ch = cell * 0.64;
          g.fillRect(x + 2, cy2, L.len * cell - 4, ch);
          g.fillStyle = C.panel2; // windshield
          if (L.dir > 0) g.fillRect(x + L.len * cell - 4 - cell * 0.3, cy2 + 2, cell * 0.26, ch - 4);
          else g.fillRect(x + 4, cy2 + 2, cell * 0.26, ch - 4);
        }
      }
    }
    // frog
    if (deadT > 0) {
      g.font = (cell - 2) + 'px sans-serif';
      g.fillText(deadEmo, ox + frog.cx * cell + cell / 2, rowY(frog.row) + cell / 2);
    } else {
      g.font = (cell - 4) + 'px sans-serif';
      g.fillText('🐸', ox + frog.cx * cell + cell / 2, rowY(frog.row) + cell / 2 + 1);
    }
    // HUD: lives, level, frog timer
    g.font = (cell * 0.55) + 'px sans-serif';
    g.textAlign = 'left'; g.fillStyle = C.text;
    var lv = '';
    for (i = 0; i < lives; i++) lv += '🐸';
    g.fillText(lv, ox + 2, oy - cell * 0.4 < 8 ? 10 : oy - cell * 0.35);
    g.textAlign = 'right';
    g.fillText(api.t('level') + ' ' + level, ox + cell * COLS - 2, oy - cell * 0.4 < 8 ? 10 : oy - cell * 0.35);
    g.textAlign = 'center';
    var ty = Math.min(rowY(13) + 3, cv.H - 6);
    g.fillStyle = C.panel2; g.fillRect(ox, ty, cell * COLS, 5);
    g.fillStyle = frogTime < 8000 ? C.bad : C.good;
    g.fillRect(ox, ty, cell * COLS * Math.max(0, frogTime) / 30000, 5);
    if (bannerT > 0) {
      g.fillStyle = C.text; g.font = 'bold 22px sans-serif';
      g.fillText(api.t('level') + ' ' + level, W / 2, H / 2);
    }
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H);
      g.fillStyle = C.text; g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2);
      g.font = '13px sans-serif'; g.fillStyle = C.muted;
      g.fillText(RU ? 'Свайпы — прыжки, тап — вперёд' : 'Swipe to hop, tap = forward', W / 2, H / 2 + 24);
    }
  }

  var offSwipe = api.swipe(container, function (d) { hop(d); });
  function onKey(e) {
    var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      a: 'left', d: 'right', w: 'up', s: 'down', ' ': 'up' };
    if (map[e.key]) { hop(map[e.key]); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { lastT = ts; return; }
    var dt = Math.min(50, ts - lastT);
    lastT = ts;
    update(dt);
    draw();
  }
  layout();
  buildLanes();
  resetFrog();
  api.score(0);
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
