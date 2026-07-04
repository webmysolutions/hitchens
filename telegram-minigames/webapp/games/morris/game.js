/* Nine Men's Morris — player vs minimax AI. MG game module. */
(function () {
'use strict';

/* 24 points on a 7x7 lattice: 3 concentric squares + 4 connectors. */
var PX = [0, 3, 6, 1, 3, 5, 2, 3, 4, 0, 1, 2, 4, 5, 6, 2, 3, 4, 1, 3, 5, 0, 3, 6];
var PY = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6];
/* The 16 mills double as the drawn board lines (each is a straight segment). */
var MILLS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]
];
var ADJ = [
  [1, 9], [0, 2, 4], [1, 14],
  [4, 10], [1, 3, 5, 7], [4, 13],
  [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15],
  [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
  [11, 16], [15, 17, 19], [12, 16],
  [10, 19], [16, 18, 20, 22], [13, 19],
  [9, 22], [19, 21, 23], [14, 22]
];
var MAT = []; /* mills passing through each point */
(function () {
  var i, m, k;
  for (i = 0; i < 24; i++) MAT.push([]);
  for (m = 0; m < 16; m++) for (k = 0; k < 3; k++) MAT[MILLS[m][k]].push(MILLS[m]);
})();

MG.register('morris', function (container, api) {
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
  var pCol = C.accent;
  var aCol = blend('#ffffff', C.panel2, 0.14);
  var lineCol = blend(C.muted, C.bg, 0.35);
  var nodeCol = blend(C.panel2, '#ffffff', 0.08);

  /* ---------- rules / search ---------- */
  var B, hp, ha; /* board, pieces in hand (player / AI) */

  function cnt(bd, s) {
    var n = 0;
    for (var i = 0; i < 24; i++) if (bd[i] === s) n++;
    return n;
  }
  function millAt(bd, i, s) {
    var L = MAT[i];
    for (var k = 0; k < L.length; k++) {
      var m = L[k];
      if (bd[m[0]] === s && bd[m[1]] === s && bd[m[2]] === s) return m;
    }
    return null;
  }
  function millCount(bd, s) {
    var n = 0;
    for (var m = 0; m < 16; m++) {
      var L = MILLS[m];
      if (bd[L[0]] === s && bd[L[1]] === s && bd[L[2]] === s) n++;
    }
    return n;
  }
  function removables(bd, s) { /* removable pieces of side s */
    var free = [], all = [], i;
    for (i = 0; i < 24; i++) if (bd[i] === s) {
      all.push(i);
      if (!millAt(bd, i, s)) free.push(i);
    }
    return free.length ? free : all;
  }
  function genMoves(bd, side) {
    var hand = side === 1 ? hp : ha, bases = [], out = [], i, j, t;
    if (hand > 0) {
      for (t = 0; t < 24; t++) if (!bd[t]) bases.push({ f: -1, t: t });
    } else {
      var fly = cnt(bd, side) === 3;
      for (i = 0; i < 24; i++) if (bd[i] === side) {
        if (fly) { for (t = 0; t < 24; t++) if (!bd[t]) bases.push({ f: i, t: t }); }
        else {
          var A = ADJ[i];
          for (j = 0; j < A.length; j++) if (!bd[A[j]]) bases.push({ f: i, t: A[j] });
        }
      }
    }
    for (i = 0; i < bases.length; i++) {
      var b = bases[i];
      if (b.f >= 0) bd[b.f] = 0;
      bd[b.t] = side;
      if (millAt(bd, b.t, side)) {
        var rs = removables(bd, -side);
        if (rs.length) for (j = 0; j < rs.length; j++) out.push({ f: b.f, t: b.t, r: rs[j] });
        else out.push({ f: b.f, t: b.t, r: -1 });
      } else out.push({ f: b.f, t: b.t, r: -1 });
      bd[b.t] = 0;
      if (b.f >= 0) bd[b.f] = side;
    }
    return out;
  }
  function applyM(bd, m, side) {
    if (m.f < 0) { if (side === 1) hp--; else ha--; }
    else bd[m.f] = 0;
    bd[m.t] = side;
    if (m.r >= 0) bd[m.r] = 0;
  }
  function undoM(bd, m, side) {
    bd[m.t] = 0;
    if (m.f < 0) { if (side === 1) hp++; else ha++; }
    else bd[m.f] = side;
    if (m.r >= 0) bd[m.r] = -side;
  }
  function mobility(bd, side) {
    var hand = side === 1 ? hp : ha, i, j, n = 0, e = 0;
    for (i = 0; i < 24; i++) if (!bd[i]) e++;
    if (hand > 0) return e;
    if (cnt(bd, side) === 3) return e * 2;
    for (i = 0; i < 24; i++) if (bd[i] === side) {
      var A = ADJ[i];
      for (j = 0; j < A.length; j++) if (!bd[A[j]]) n++;
    }
    return n;
  }
  function blockedC(bd, side) { /* side's pieces with no empty neighbour */
    if ((side === 1 ? hp : ha) > 0 || cnt(bd, side) === 3) return 0;
    var n = 0, i, j;
    for (i = 0; i < 24; i++) if (bd[i] === side) {
      var ok = false, A = ADJ[i];
      for (j = 0; j < A.length; j++) if (!bd[A[j]]) { ok = true; break; }
      if (!ok) n++;
    }
    return n;
  }
  function evalS(bd, side) { /* from `side` point of view */
    var s = (cnt(bd, 1) + hp - cnt(bd, -1) - ha) * 26 +
      (millCount(bd, 1) - millCount(bd, -1)) * 14 +
      (mobility(bd, 1) - mobility(bd, -1)) * 2 +
      (blockedC(bd, -1) - blockedC(bd, 1)) * 5;
    return side === 1 ? s : -s;
  }
  function orderMv(ms) { /* mills (with removal) first for better cutoffs */
    var out = [], i;
    for (i = 0; i < ms.length; i++) if (ms[i].r >= 0) out.push(ms[i]);
    for (i = 0; i < ms.length; i++) if (ms[i].r < 0) out.push(ms[i]);
    return out;
  }
  function negamax(bd, side, depth, alpha, beta) {
    if (cnt(bd, side) + (side === 1 ? hp : ha) < 3) return -90000 - depth;
    var moves = genMoves(bd, side);
    if (!moves.length) return -90000 - depth;
    if (depth <= 0) return evalS(bd, side);
    moves = orderMv(moves);
    for (var k = 0; k < moves.length; k++) {
      applyM(bd, moves[k], side);
      var v = -negamax(bd, -side, depth - 1, -beta, -alpha);
      undoM(bd, moves[k], side);
      if (v > alpha) { alpha = v; if (alpha >= beta) break; }
    }
    return alpha;
  }

  /* ---------- DOM bar ---------- */
  function el(tag) { return document.createElement(tag); }
  var bar = el('div');
  bar.style.cssText = 'position:absolute;left:0;top:0;right:0;height:44px;display:flex;align-items:center;gap:8px;padding:0 10px;z-index:2;box-sizing:border-box';
  function chip(col) {
    var c = el('span');
    c.style.cssText = 'padding:3px 10px;border-radius:10px;font-size:14px;font-weight:bold;background:' + C.panel2 + ';color:' + col + ';border:2px solid transparent;white-space:nowrap';
    return c;
  }
  var pChip = chip(pCol), aChip = chip(aCol), st = el('span'), btn = el('button');
  st.style.cssText = 'flex:1;text-align:center;font-size:13px;color:' + C.muted + ';overflow:hidden;white-space:nowrap';
  btn.style.cssText = 'border:0;border-radius:8px;padding:5px 12px;font-size:20px;line-height:1;cursor:pointer;background:' + C.panel2 + ';color:' + C.text;
  btn.textContent = '↺';
  btn.title = RU ? 'Новая игра' : 'New game';
  bar.appendChild(pChip); bar.appendChild(st); bar.appendChild(aChip); bar.appendChild(btn);
  container.appendChild(bar);

  /* ---------- layout / drawing ---------- */
  var BT = 48, u, ox, oy;
  function layout() {
    var s = Math.min(cv.W - 40, cv.H - BT - 40);
    u = s / 6;
    ox = (cv.W - s) / 2;
    oy = BT + (cv.H - BT - s) / 2;
  }
  cv.onResize = function () { layout(); draw(); };
  function nx(i) { return ox + PX[i] * u; }
  function ny(i) { return oy + PY[i] * u; }
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function disc(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
  function ring(x, y, r, col, w) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.stroke();
  }

  var turn, over, busy, sel, removing, noMill, flash = null;

  function draw() {
    var i, k, m;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.fillStyle = C.panel;
    rr(ox - u * 0.55, oy - u * 0.55, u * 7.1, u * 7.1, 14);
    g.fill();
    /* board lines */
    g.strokeStyle = lineCol;
    g.lineWidth = Math.max(2, u * 0.05);
    g.lineCap = 'round';
    g.beginPath();
    for (m = 0; m < 16; m++) {
      var L = MILLS[m];
      g.moveTo(nx(L[0]), ny(L[0]));
      g.lineTo(nx(L[2]), ny(L[2]));
    }
    g.stroke();
    /* mill flash */
    if (flash) {
      var ph = (Date.now() - flash.t0) / 650;
      if (ph < 1) {
        g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(ph * 9.42));
        g.strokeStyle = C.accent;
        g.lineWidth = u * 0.16;
        g.beginPath();
        g.moveTo(nx(flash.m[0]), ny(flash.m[0]));
        g.lineTo(nx(flash.m[2]), ny(flash.m[2]));
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    /* highlights */
    var hl = null;
    if (!over && !busy && turn === 1) {
      hl = {};
      if (removing) {
        var rs = removables(B, -1);
        for (k = 0; k < rs.length; k++) hl[rs[k]] = 2;
      } else if (hp > 0) {
        for (i = 0; i < 24; i++) if (!B[i]) hl[i] = 1;
      } else if (sel >= 0) {
        if (cnt(B, 1) === 3) { for (i = 0; i < 24; i++) if (!B[i]) hl[i] = 1; }
        else {
          var A = ADJ[sel];
          for (k = 0; k < A.length; k++) if (!B[A[k]]) hl[A[k]] = 1;
        }
      }
    }
    /* nodes + pieces */
    for (i = 0; i < 24; i++) {
      var x = nx(i), y = ny(i), v = B[i];
      if (v === 0) {
        g.fillStyle = nodeCol;
        disc(x, y, u * 0.10);
        if (hl && hl[i] === 1) {
          ring(x, y, u * 0.20, C.accent, Math.max(2, u * 0.045));
          g.globalAlpha = 0.35;
          g.fillStyle = C.accent;
          disc(x, y, u * 0.10);
          g.globalAlpha = 1;
        }
      } else {
        g.fillStyle = v === 1 ? pCol : aCol;
        disc(x, y, u * 0.27);
        ring(x, y, u * 0.27, 'rgba(0,0,0,.35)', 1.5);
        if (sel === i) ring(x, y, u * 0.36, C.accent, Math.max(2, u * 0.05));
        if (hl && hl[i] === 2) ring(x, y, u * 0.36, C.bad, Math.max(2, u * 0.05));
      }
    }
  }

  function statusText() {
    if (over) return '';
    if (busy || turn === -1) return api.t('thinking');
    if (removing) return RU ? 'Сними фишку соперника' : 'Remove an enemy piece';
    if (hp > 0) return (RU ? 'Поставь фишку · ещё ' : 'Place a piece · ') + hp;
    if (cnt(B, 1) === 3) return RU ? 'Полёт — ходи куда угодно' : 'Flying — move anywhere';
    return RU ? 'Двигай фишку на соседний узел' : 'Move a piece along a line';
  }
  function upd() {
    pChip.textContent = '● ' + (cnt(B, 1) + hp);
    aChip.textContent = '● ' + (cnt(B, -1) + ha);
    pChip.style.borderColor = (!over && turn === 1) ? C.accent : 'transparent';
    aChip.style.borderColor = (!over && turn === -1) ? C.accent : 'transparent';
    st.textContent = statusText();
    api.score(cnt(B, 1));
  }

  function startFlash(m) {
    flash = { m: m, t0: Date.now() };
    (function pulse() {
      if (destroyed || !flash) return;
      if (Date.now() - flash.t0 > 650) { flash = null; draw(); return; }
      draw();
      later(pulse, 50);
    })();
  }

  /* ---------- game flow ---------- */
  function saveState() {
    if (over) return;
    api.save({ b: B.slice(), hp: hp, ha: ha, t: turn, nm: noMill, rm: removing ? 1 : 0 });
  }
  function end(w) { /* 1 player wins, -1 loses, 0 draw */
    over = true; busy = false; removing = false; sel = -1;
    clearTimers();
    flash = null;
    api.save(null);
    upd(); draw();
    if (w === 1) { api.haptic('success'); api.gameOver(100 + cnt(B, 1) * 10, { win: true }); }
    else if (w === 0) api.gameOver(50, { draw: true });
    else { api.haptic('error'); api.gameOver(10, { win: false }); }
  }
  function toMove(t) {
    if (over) return;
    turn = t; sel = -1; removing = false;
    if (cnt(B, t) + (t === 1 ? hp : ha) < 3) return end(-t);
    if (!genMoves(B, t).length) return end(-t);
    if (noMill >= 50) return end(0);
    saveState();
    upd(); draw();
    if (t === -1) aiGo();
  }
  function afterPlayer() {
    if (cnt(B, -1) + ha < 3) return end(1);
    if (noMill >= 50) return end(0);
    toMove(-1);
  }
  function postMove(t) { /* player just put a piece on t */
    var m = millAt(B, t, 1);
    if (m) {
      noMill = 0;
      startFlash(m);
      api.haptic('medium');
      if (removables(B, -1).length) {
        removing = true;
        saveState();
        upd(); draw();
        return;
      }
    }
    upd(); draw();
    later(afterPlayer, m ? 350 : 120);
  }
  function tapNode(i) {
    if (removing) {
      if (removables(B, -1).indexOf(i) < 0) return;
      B[i] = 0;
      removing = false;
      api.haptic('light');
      upd(); draw();
      later(afterPlayer, 150);
      return;
    }
    if (hp > 0) {
      if (B[i]) return;
      B[i] = 1; hp--;
      api.haptic('light');
      postMove(i);
      return;
    }
    if (B[i] === 1) { sel = sel === i ? -1 : i; upd(); draw(); return; }
    if (sel >= 0 && B[i] === 0) {
      if (cnt(B, 1) !== 3 && ADJ[sel].indexOf(i) < 0) return;
      B[sel] = 0; B[i] = 1; sel = -1;
      noMill++;
      api.haptic('light');
      postMove(i);
    }
  }
  function onClick(e) {
    if (over || busy || turn !== 1) return;
    var r = cv.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top, best = -1, bd = 1e18, i;
    for (i = 0; i < 24; i++) {
      var dx = x - nx(i), dy = y - ny(i), d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > u * 0.48 * u * 0.48) return; /* fat tap targets: ~half a cell */
    tapNode(best);
  }
  cv.canvas.addEventListener('click', onClick);

  function aiGo() {
    busy = true;
    upd(); draw();
    var moves = orderMv(genMoves(B, -1));
    var depth = api.lowEnd ? 2 : 3;
    var idx = 0, best = moves[0], bestV = -1e9, alpha = -1e9;
    function chunk() {
      var t0 = Date.now();
      while (idx < moves.length && Date.now() - t0 < 40) {
        var m = moves[idx++];
        applyM(B, m, -1);
        var v = -negamax(B, 1, depth - 1, -1e9, -alpha);
        undoM(B, m, -1);
        if (v > bestV) { bestV = v; best = m; if (v > alpha) alpha = v; }
      }
      if (idx < moves.length) { later(chunk, 16); return; }
      applyM(B, best, -1);
      if (best.f >= 0) noMill++;
      var mm = millAt(B, best.t, -1);
      if (mm) { noMill = 0; startFlash(mm); api.haptic('medium'); }
      busy = false;
      if (cnt(B, 1) + hp < 3) return end(-1);
      upd(); draw();
      later(function () { toMove(1); }, mm ? 400 : 150);
    }
    later(chunk, 30);
  }

  function newGame(useSaved) {
    clearTimers();
    flash = null; over = false; busy = false; sel = -1; removing = false;
    var s = useSaved ? api.load() : null, ok = false, i, c1 = 0, c2 = 0;
    if (s && s.b && s.b.length === 24 && (s.t === 1 || s.t === -1) &&
        s.hp >= 0 && s.hp <= 9 && s.ha >= 0 && s.ha <= 9) {
      ok = true;
      for (i = 0; i < 24; i++) {
        var v = s.b[i];
        if (v !== 0 && v !== 1 && v !== -1) { ok = false; break; }
        if (v === 1) c1++; else if (v === -1) c2++;
      }
      if (c1 + s.hp > 9 || c2 + s.ha > 9) ok = false;
    }
    if (ok) {
      B = s.b.slice(); hp = s.hp | 0; ha = s.ha | 0; noMill = Math.max(0, s.nm | 0);
      if (s.rm && s.t === 1 && removables(B, -1).length) {
        turn = 1; removing = true;
        upd(); draw();
        return;
      }
      toMove(s.t);
    } else {
      B = [];
      for (i = 0; i < 24; i++) B.push(0);
      hp = 9; ha = 9; noMill = 0;
      toMove(1);
    }
  }
  btn.onclick = function () {
    api.haptic('light');
    api.save(null);
    newGame(false);
  };

  layout();
  newGame(true);

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
