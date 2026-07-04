/* ZigZag — ball on a diamond path over the abyss; tap to turn. MG contract. */
(function () {
'use strict';
MG.register('zigzag', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var LOW = api.lowEnd;

  // ---- derived shades ----
  function rgbOf(col) {
    if (col.charAt(0) === '#') {
      var h = col.slice(1);
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var v = parseInt(h.slice(0, 6), 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    var m = /(\d+)[^\d]+(\d+)[^\d]+(\d+)/.exec(col);
    return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128];
  }
  function mix(a, b, t) {
    var A = rgbOf(a), B = rgbOf(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' +
      Math.round(A[1] + (B[1] - A[1]) * t) + ',' +
      Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }
  var topA = mix(C.panel2, C.text, 0.1);
  var topB = mix(C.panel2, C.text, 0.04);
  var sideL = mix(C.panel2, C.bg, 0.55);
  var sideR = mix(C.panel2, C.bg, 0.35);
  var trailCol = mix(C.accent, C.bg, 0.35);
  var ballHi = mix(C.accent, C.text, 0.55);

  // ---- geometry: tile (i,j) center = ((i-j)*TW, -(i+j)*TH), diamond 2TW x 2TH ----
  var TW = 32, TH = 16, DEPTH = 10;
  var STEP = Math.sqrt(TW * TW + TH * TH); // lattice step length in px

  // ---- state ----
  var bx, by, dirU, spd;
  var camX, camY;
  var started = false, alive = true, dying = 0, paused = false;
  var raf = 0, last = 0, t = 0;
  var dist = 0, gems = 0, score = 0, lastScore = -1, nextMile = 100;
  var dieVy = 0, dieOff = 0;

  // ---- tiles: ordered array (ascending i+j) + map for lookup ----
  var tiles = [], tStart = 0, tmap = {};
  var genI = 0, genJ = 0, runLeft = 0, runDirU = true;

  function addTile(i, j, gem) {
    var tl = { i: i, j: j, x: (i - j) * TW, y: -(i + j) * TH, gem: !!gem, fall: -1 };
    tiles.push(tl);
    tmap[i + '_' + j] = tl;
    return tl;
  }

  function reset() {
    tiles.length = 0; tStart = 0; tmap = {};
    // start platform 3x3 (pushed in ascending i+j for painter order)
    for (var s = 0; s <= 4; s++)
      for (var i = 0; i <= 2; i++) {
        var j = s - i;
        if (j >= 0 && j <= 2) addTile(i, j, false);
      }
    genI = 2; genJ = 2; runLeft = 0; runDirU = true;
    bx = 0; by = -2 * TH; // tile (1,1)
    dirU = true; spd = 140;
    camX = bx; camY = by;
    started = false; alive = true; dying = 0; t = 0;
    dist = 0; gems = 0; score = 0; lastScore = -1; nextMile = 100;
    dieVy = 0; dieOff = 0;
    trCnt = 0; trI = 0; trAcc = 0;
    api.score(0);
  }

  function genAhead() {
    // generate while path head is within ~1.5 screens above the camera
    while (-(genI + genJ) * TH > camY - cv.H * 1.6) {
      if (runLeft <= 0) {
        runDirU = Math.random() < 0.5;
        runLeft = 1 + ((Math.random() * 3) | 0);
      }
      if (runDirU) genI++; else genJ++;
      runLeft--;
      var gem = (genI + genJ) > 7 && Math.random() < 0.12;
      addTile(genI, genJ, gem);
    }
  }

  // ---- trail ring ----
  var TRN = LOW ? 6 : 14;
  var trX = new Float32Array(TRN), trY = new Float32Array(TRN);
  var trI = 0, trCnt = 0, trAcc = 0;

  // ---- input: tap to turn ----
  function turn() {
    if (!alive) return;
    if (!started) { started = true; return; }
    dirU = !dirU;
  }
  function onDown(e) {
    if (e.cancelable) e.preventDefault();
    turn();
  }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      turn();
      e.preventDefault();
    }
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);

  function update(dt) {
    if (dying > 0) {
      dying += dt;
      dieVy += 1300 * dt;
      dieOff += dieVy * dt;
      if (dying > 0.75) {
        dying = -1; alive = false;
        api.gameOver(score);
      }
      return;
    }
    spd = Math.min(330, 140 + dist * 1.1);
    var v = spd / STEP; // lattice units per second
    bx += (dirU ? TW : -TW) * v * dt;
    by += -TH * v * dt;
    // containing diamond: round skewed coords (always the right cell)
    var fi = (bx / TW - by / TH) / 2, fj = (-by / TH - bx / TW) / 2;
    var ri = Math.round(fi), rj = Math.round(fj);
    var tl = tmap[ri + '_' + rj];
    if (!tl || tl.fall >= 0) {
      dying = 0.0001; dieVy = 60;
      api.haptic('error');
      return;
    }
    if (tl.gem) {
      var dx = bx - tl.x, dy = by - tl.y;
      if (dx * dx + dy * dy < 22 * 22) {
        tl.gem = false; gems++;
        api.haptic('light');
      }
    }
    // progress (i+j fractional = -by/TH)
    var d = ((-by / TH) | 0) - 2;
    if (d > dist) dist = d;
    if (dist >= nextMile) { api.haptic('medium'); nextMile += 100; }
    score = dist + gems * 10;
    if (score !== lastScore) { lastScore = score; api.score(score); }
    // tiles behind the ball fall away (small delay)
    var ballSum = -by / TH;
    for (var k = tStart; k < tiles.length; k++) {
      var q = tiles[k];
      if (q.i + q.j >= ballSum - 5) break; // ordered by sum
      if (q.fall < 0) {
        q.fall = 0;
        delete tmap[q.i + '_' + q.j];
      }
    }
    genAhead();
    // trail
    trAcc += dt;
    if (trAcc > 0.03) {
      trAcc = 0;
      trX[trI] = bx; trY[trI] = by;
      trI = (trI + 1) % TRN;
      if (trCnt < TRN) trCnt++;
    }
  }

  function drawTile(q, sx0, sy0) {
    var x = q.x - camX + sx0, y = q.y - camY + sy0, a = 1;
    if (q.fall >= 0) {
      if (LOW) return; // no fall animation on low-end
      a = 1 - q.fall / 0.55;
      if (a <= 0) return;
      y += q.fall * q.fall * 900;
      g.globalAlpha = a;
    }
    // side faces (thickness)
    g.fillStyle = sideL;
    g.beginPath();
    g.moveTo(x - TW, y);
    g.lineTo(x, y + TH);
    g.lineTo(x, y + TH + DEPTH);
    g.lineTo(x - TW, y + DEPTH);
    g.closePath();
    g.fill();
    g.fillStyle = sideR;
    g.beginPath();
    g.moveTo(x + TW, y);
    g.lineTo(x, y + TH);
    g.lineTo(x, y + TH + DEPTH);
    g.lineTo(x + TW, y + DEPTH);
    g.closePath();
    g.fill();
    // top face
    g.fillStyle = ((q.i + q.j) & 1) ? topA : topB;
    g.beginPath();
    g.moveTo(x, y - TH);
    g.lineTo(x + TW, y);
    g.lineTo(x, y + TH);
    g.lineTo(x - TW, y);
    g.closePath();
    g.fill();
    if (q.gem) {
      g.font = '17px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('💎', x, y - 6);
    }
    if (q.fall >= 0) g.globalAlpha = 1;
  }

  function draw() {
    var W = cv.W, H = cv.H;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    var sx0 = W / 2, sy0 = H * 0.58;
    // tiles far→near (newest first, older drawn on top)
    for (var k = tiles.length - 1; k >= tStart; k--) drawTile(tiles[k], sx0, sy0);
    // trail
    for (k = 0; k < trCnt; k++) {
      var j = (trI + TRN - trCnt + k) % TRN;
      g.globalAlpha = (k + 1) / trCnt * 0.45;
      g.fillStyle = trailCol;
      g.beginPath();
      g.arc(trX[j] - camX + sx0, trY[j] - camY + sy0 - 9, 3 + 5 * k / trCnt, 0, 6.29);
      g.fill();
    }
    g.globalAlpha = 1;
    // ball
    var bsx = bx - camX + sx0, bsy = by - camY + sy0 - 10 + dieOff;
    var sc = dying > 0 ? Math.max(0.2, 1 - dying * 0.9) : 1;
    if (alive) {
      g.globalAlpha = dying > 0 ? Math.max(0, 1 - dying * 1.2) : 1;
      g.fillStyle = C.accent;
      g.beginPath();
      g.arc(bsx, bsy, 10 * sc, 0, 6.29);
      g.fill();
      g.fillStyle = ballHi;
      g.beginPath();
      g.arc(bsx - 3 * sc, bsy - 3 * sc, 3.5 * sc, 0, 6.29);
      g.fill();
      g.globalAlpha = 1;
    }
    // HUD
    if (started) {
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillText('💎 ' + gems + '   ' + dist, 12, 20);
    }
    // start overlay
    if (!started && alive) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2 - 14);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Тап — поворот на 90°' : 'Tap to turn 90°', W / 2, H / 2 + 14);
    }
  }

  function gc() {
    // drop tiles that finished falling / far behind (keep array compact)
    while (tStart < tiles.length) {
      var q = tiles[tStart];
      var gone = q.fall >= 0 ? (LOW || q.fall > 0.6) : false;
      if (!gone) break;
      tStart++;
    }
    if (tStart > 60) { tiles = tiles.slice(tStart); tStart = 0; }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last) / 1000;
    last = ts;
    t += dt;
    if (started && (alive || dying > 0)) {
      update(dt);
      // advance fall animations
      for (var k = tStart; k < tiles.length; k++)
        if (tiles[k].fall >= 0) tiles[k].fall += dt;
      // camera follows ball
      camX += (bx - camX) * Math.min(1, dt * 5);
      camY += (by - camY) * Math.min(1, dt * 5);
      gc();
    }
    draw();
  }

  cv.onResize = function () { draw(); };
  reset();
  genAhead();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
