/* Sea Battle — Battleship 10x10 vs AI, Russian fleet rules. MG game module. */
(function () {
'use strict';

var SIZES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

/* Random fleet; ships never touch, even diagonally. Returns {ships, grid}. */
function randFleet() {
  for (var t = 0; t < 80; t++) {
    var occ = [], ships = [], ok = true, i;
    for (i = 0; i < 100; i++) occ.push(0);
    for (var s = 0; s < SIZES.length && ok; s++) {
      var sz = SIZES[s], done = false;
      for (var a = 0; a < 300 && !done; a++) {
        var hor = Math.random() < 0.5;
        var x = (Math.random() * (hor ? 11 - sz : 10)) | 0;
        var y = (Math.random() * (hor ? 10 : 11 - sz)) | 0;
        var cells = [], fit = true;
        for (var k = 0; k < sz && fit; k++) {
          var cx = hor ? x + k : x, cyy = hor ? y : y + k;
          for (var dx = -1; dx <= 1 && fit; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
              var nx = cx + dx, ny = cyy + dy;
              if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10 && occ[ny * 10 + nx]) { fit = false; break; }
            }
          }
          if (fit) cells.push(cyy * 10 + cx);
        }
        if (fit) {
          for (k = 0; k < sz; k++) occ[cells[k]] = ships.length + 1;
          ships.push({ c: cells, h: 0, s: false });
          done = true;
        }
      }
      if (!done) ok = false;
    }
    if (ok) return { ships: ships, grid: occ };
  }
  return null;
}

MG.register('seabattle', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru';
  var cv = api.createCanvas(), g = cv.g;
  var destroyed = false, paused = false, timers = {}, tseq = 0;

  function later(fn, ms) {
    var k = ++tseq;
    function tick() {
      if (destroyed) return;
      if (paused) { timers[k] = setTimeout(tick, 250); return; }
      delete timers[k];
      fn();
    }
    timers[k] = setTimeout(tick, ms);
  }
  function clearTimers() {
    for (var k in timers) clearTimeout(timers[k]);
    timers = {};
  }

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
  var seaCol = blend(C.panel2, C.accent, 0.10);
  var gridLn = blend(C.panel2, '#000000', 0.30);
  var shipCol = blend(C.accent, C.panel, 0.45);
  var boomCol = blend(C.bad, '#ffffff', 0.35);
  var LET = RU ? 'АБВГДЕЖЗИК' : 'ABCDEFGHIJ';

  /* ---------- DOM ---------- */
  function el(tag) { return document.createElement(tag); }
  var bar = el('div');
  bar.style.cssText = 'position:absolute;left:0;top:0;right:0;height:44px;display:flex;align-items:center;gap:8px;padding:0 10px;z-index:2;box-sizing:border-box';
  function chip() {
    var c = el('span');
    c.style.cssText = 'padding:3px 10px;border-radius:10px;font-size:14px;font-weight:bold;background:' + C.panel2 + ';color:' + C.text + ';white-space:nowrap';
    return c;
  }
  var pChip = chip(), aChip = chip(), st = el('span'), btn = el('button');
  st.style.cssText = 'flex:1;text-align:center;font-size:13px;color:' + C.muted + ';overflow:hidden;white-space:nowrap';
  btn.style.cssText = 'border:0;border-radius:8px;padding:5px 12px;font-size:20px;line-height:1;cursor:pointer;background:' + C.panel2 + ';color:' + C.text;
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  bar.appendChild(pChip); bar.appendChild(st); bar.appendChild(aChip); bar.appendChild(btn);
  container.appendChild(bar);

  var pbar = el('div');
  pbar.style.cssText = 'position:absolute;left:0;bottom:0;right:0;height:64px;display:flex;align-items:center;justify-content:center;gap:14px;z-index:2';
  function bigBtn(txt, main) {
    var b = el('button');
    b.style.cssText = 'border:0;border-radius:12px;padding:12px 20px;font-size:16px;font-weight:bold;cursor:pointer;background:' +
      (main ? C.accent : C.panel2) + ';color:' + (main ? '#fff' : C.text);
    b.textContent = txt;
    return b;
  }
  var btnR = bigBtn('🎲 ' + (RU ? 'Заново' : 'Reroll'), false);
  var btnS = bigBtn('✔ ' + (RU ? 'В бой!' : 'Start'), true);
  pbar.appendChild(btnR); pbar.appendChild(btnS);
  container.appendChild(pbar);

  /* ---------- state ---------- */
  var phase; /* 0 placement, 1 battle, 2 over */
  var pf, ef, eShots, pShots; /* fleets; shots: 0 none 1 miss 2 hit 3 auto-marked */
  var myTurn, pShotsN, pHitsN, aiHits;
  var fx = [];

  function shipsAlive(ships) {
    var n = 0;
    for (var i = 0; i < ships.length; i++) if (!ships[i].s) n++;
    return n;
  }
  /* fire at idx; 0 miss, 1 hit, 2 sunk */
  function fire(shots, fleet, idx) {
    var si = fleet.grid[idx];
    if (!si) { shots[idx] = 1; return 0; }
    var sh = fleet.ships[si - 1];
    shots[idx] = 2;
    sh.h++;
    if (sh.h < sh.c.length) return 1;
    sh.s = true;
    for (var k = 0; k < sh.c.length; k++) { /* auto-mark halo of sunk ship */
      var x = sh.c[k] % 10, y = (sh.c[k] / 10) | 0;
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10 && shots[ny * 10 + nx] === 0) shots[ny * 10 + nx] = 3;
      }
    }
    return 2;
  }

  /* ---------- layout ---------- */
  var BT = 46, LB, cs0, gx0, gy0, cs1, gx1, gy1, cs2, gx2, gy2;
  function layout() {
    LB = 15;
    cs0 = Math.min((cv.W - 24 - LB) / 10, (cv.H - BT - 80 - LB) / 10);
    gx0 = (cv.W - 10 * cs0 + LB) / 2;
    gy0 = BT + LB + (cv.H - BT - 74 - LB - 10 * cs0) / 2;
    cs1 = Math.min((cv.W - 24 - LB) / 10, (cv.H - BT - LB - 44) / 16.4);
    gx1 = (cv.W - 10 * cs1 + LB) / 2;
    gy1 = BT + LB + 4;
    cs2 = cs1 * 0.62;
    gx2 = (cv.W - 10 * cs2) / 2;
    gy2 = gy1 + 10 * cs1 + 18;
  }
  cv.onResize = function () { layout(); draw(); };

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function shipRect(gx, gy, cs, sh, pad) {
    var mnx = 9, mny = 9, mxx = 0, mxy = 0;
    for (var k = 0; k < sh.c.length; k++) {
      var x = sh.c[k] % 10, y = (sh.c[k] / 10) | 0;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    return [gx + mnx * cs + pad, gy + mny * cs + pad, (mxx - mnx + 1) * cs - pad * 2, (mxy - mny + 1) * cs - pad * 2];
  }
  function drawGrid(gx, gy, cs, fleet, shots, showShips, labels) {
    var i, x, y, k;
    g.fillStyle = seaCol;
    g.fillRect(gx, gy, cs * 10, cs * 10);
    g.strokeStyle = gridLn;
    g.lineWidth = 1;
    g.beginPath();
    for (i = 0; i <= 10; i++) {
      g.moveTo(gx + i * cs, gy);
      g.lineTo(gx + i * cs, gy + cs * 10);
      g.moveTo(gx, gy + i * cs);
      g.lineTo(gx + cs * 10, gy + i * cs);
    }
    g.stroke();
    if (labels) {
      g.fillStyle = C.muted;
      g.font = Math.max(8, Math.round(cs * 0.42)) + 'px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (i = 0; i < 10; i++) {
        g.fillText(LET[i], gx + i * cs + cs / 2, gy - LB / 2 - 1);
        g.fillText(String(i + 1), gx - LB / 2 - 2, gy + i * cs + cs / 2);
      }
    }
    /* ships */
    for (i = 0; i < fleet.ships.length; i++) {
      var sh = fleet.ships[i];
      if (showShips || sh.s) {
        var rc = shipRect(gx, gy, cs, sh, Math.max(1.5, cs * 0.08));
        g.fillStyle = sh.s ? blend(C.bad, C.panel, 0.5) : shipCol;
        rr(rc[0], rc[1], rc[2], rc[3], cs * 0.2);
        g.fill();
        if (sh.s) {
          g.strokeStyle = C.bad;
          g.lineWidth = Math.max(1.5, cs * 0.08);
          rr(rc[0], rc[1], rc[2], rc[3], cs * 0.2);
          g.stroke();
        }
      }
    }
    /* shot marks */
    for (i = 0; i < 100; i++) {
      var sm = shots[i];
      if (!sm) continue;
      x = gx + (i % 10) * cs + cs / 2;
      y = gy + ((i / 10) | 0) * cs + cs / 2;
      if (sm === 1 || sm === 3) {
        g.globalAlpha = sm === 3 ? 0.4 : 1;
        g.fillStyle = C.muted;
        g.beginPath();
        g.arc(x, y, Math.max(1.5, cs * 0.09), 0, 6.2832);
        g.fill();
        g.globalAlpha = 1;
      } else {
        g.strokeStyle = C.bad;
        g.lineWidth = Math.max(1.5, cs * 0.09);
        g.lineCap = 'round';
        var d = cs * 0.26;
        g.beginPath();
        g.moveTo(x - d, y - d); g.lineTo(x + d, y + d);
        g.moveTo(x + d, y - d); g.lineTo(x - d, y + d);
        g.stroke();
      }
    }
    /* explosions */
    var now = Date.now();
    for (k = 0; k < fx.length; k++) {
      var f = fx[k];
      if (f.gx !== gx) continue;
      var ph = (now - f.t0) / 380;
      if (ph >= 1) continue;
      x = gx + (f.i % 10) * cs + cs / 2;
      y = gy + ((f.i / 10) | 0) * cs + cs / 2;
      g.globalAlpha = 1 - ph;
      g.fillStyle = boomCol;
      g.beginPath();
      g.arc(x, y, cs * (0.15 + 0.45 * ph), 0, 6.2832);
      g.fill();
      g.globalAlpha = 1;
    }
  }
  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (phase === 0) {
      drawGrid(gx0, gy0, cs0, pf, [], true, true);
      return;
    }
    drawGrid(gx1, gy1, cs1, ef, eShots, false, true);
    g.fillStyle = C.muted;
    g.font = '11px sans-serif';
    g.fillText(RU ? 'Твой флот' : 'Your fleet', cv.W / 2, gy2 - 8);
    drawGrid(gx2, gy2, cs2, pf, pShots, true, false);
  }
  function addFx(i, gx) {
    if (api.lowEnd) return;
    fx.push({ i: i, gx: gx, t0: Date.now() });
    if (fx.length === 1) pulse();
  }
  function pulse() {
    if (destroyed) return;
    var now = Date.now(), nf = [];
    for (var k = 0; k < fx.length; k++) if (now - fx[k].t0 < 380) nf.push(fx[k]);
    fx = nf;
    draw();
    if (fx.length) later(pulse, 40);
  }

  function upd() {
    if (phase === 0) {
      pChip.textContent = '🛡 10';
      aChip.textContent = '🎯 10';
      st.textContent = RU ? 'Расставь корабли' : 'Place your fleet';
    } else {
      pChip.textContent = '🛡 ' + shipsAlive(pf.ships);
      aChip.textContent = '🎯 ' + shipsAlive(ef.ships);
      st.textContent = phase === 2 ? '' :
        (myTurn ? api.t('your_turn') : (RU ? 'Ход противника' : 'Enemy turn'));
    }
    api.score(pHitsN);
  }

  /* ---------- AI ---------- */
  function avail(i) { return pShots[i] === 0; }
  function pushIf(arr, x, y) {
    if (x >= 0 && x < 10 && y >= 0 && y < 10 && avail(y * 10 + x)) arr.push(y * 10 + x);
  }
  function aiPick() {
    var c = [], i, x, y;
    if (aiHits.length === 1) {
      x = aiHits[0] % 10; y = (aiHits[0] / 10) | 0;
      pushIf(c, x - 1, y); pushIf(c, x + 1, y); pushIf(c, x, y - 1); pushIf(c, x, y + 1);
    } else if (aiHits.length > 1) {
      var mnx = 9, mxx = 0, mny = 9, mxy = 0;
      for (i = 0; i < aiHits.length; i++) {
        x = aiHits[i] % 10; y = (aiHits[i] / 10) | 0;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
      }
      if (mny === mxy) { pushIf(c, mnx - 1, mny); pushIf(c, mxx + 1, mny); } /* extend row */
      else { pushIf(c, mnx, mny - 1); pushIf(c, mnx, mxy + 1); }             /* extend col */
      if (!c.length) for (i = 0; i < aiHits.length; i++) {
        x = aiHits[i] % 10; y = (aiHits[i] / 10) | 0;
        pushIf(c, x - 1, y); pushIf(c, x + 1, y); pushIf(c, x, y - 1); pushIf(c, x, y + 1);
      }
    }
    if (c.length) return c[(Math.random() * c.length) | 0];
    var par = [], all = [];
    for (i = 0; i < 100; i++) if (avail(i)) {
      all.push(i);
      if (((i % 10) + ((i / 10) | 0)) % 2 === 0) par.push(i);
    }
    var pool = par.length ? par : all;
    return pool.length ? pool[(Math.random() * pool.length) | 0] : -1;
  }
  function aiShot() {
    if (phase !== 1 || destroyed) return;
    var i = aiPick();
    if (i < 0) return;
    var res = fire(pShots, pf, i);
    addFx(i, gx2);
    if (res === 0) {
      myTurn = true;
      upd(); draw();
      return;
    }
    if (res === 1) { aiHits.push(i); api.haptic('light'); }
    else {
      aiHits = []; /* ships never touch, so all stored hits were this ship */
      api.haptic('medium');
      if (!shipsAlive(pf.ships)) return endGame(false);
    }
    upd(); draw();
    later(aiShot, 650);
  }

  /* ---------- flow ---------- */
  function endGame(win) {
    phase = 2;
    upd(); draw();
    if (win) {
      var acc = pShotsN ? Math.round(50 * pHitsN / pShotsN) : 0;
      api.haptic('success');
      api.gameOver(100 + shipsAlive(pf.ships) * 15 + acc, { win: true });
    } else {
      api.haptic('error');
      api.gameOver(pHitsN, { win: false });
    }
  }
  function playerFire(idx) {
    if (eShots[idx] !== 0) return;
    pShotsN++;
    var res = fire(eShots, ef, idx);
    addFx(idx, gx1);
    if (res === 0) {
      myTurn = false;
      upd(); draw();
      later(aiShot, 700);
      return;
    }
    pHitsN++;
    api.haptic(res === 2 ? 'success' : 'medium');
    upd(); draw();
    if (res === 2 && !shipsAlive(ef.ships)) endGame(true);
  }
  function onClick(e) {
    if (phase !== 1 || !myTurn) return;
    var r = cv.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var cx = Math.floor((x - gx1) / cs1), cy = Math.floor((y - gy1) / cs1);
    if (cx < 0 || cx > 9 || cy < 0 || cy > 9) return;
    playerFire(cy * 10 + cx);
  }
  cv.canvas.addEventListener('click', onClick);

  function toPlacement() {
    clearTimers();
    fx = [];
    phase = 0;
    myTurn = true;
    pShotsN = 0; pHitsN = 0; aiHits = [];
    pf = randFleet();
    pbar.style.display = 'flex';
    upd(); draw();
  }
  function startBattle() {
    ef = randFleet();
    eShots = []; pShots = [];
    for (var i = 0; i < 100; i++) { eShots.push(0); pShots.push(0); }
    phase = 1;
    myTurn = true;
    pbar.style.display = 'none';
    api.haptic('light');
    upd(); draw();
  }
  btnR.onclick = function () { api.haptic('light'); pf = randFleet(); draw(); };
  btnS.onclick = startBattle;
  btn.onclick = function () { api.haptic('light'); toPlacement(); };

  layout();
  toPlacement();

  return {
    destroy: function () {
      destroyed = true;
      clearTimers();
      cv.canvas.removeEventListener('click', onClick);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
