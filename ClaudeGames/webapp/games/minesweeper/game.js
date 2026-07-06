/* Minesweeper — DOM UI. Tap to reveal, toggle button or long-press to flag. */
(function () {
'use strict';
MG.register('minesweeper', function (container, api) {
  var C = api.colors, ru = api.lang === 'ru';
  var COLS = 9, ROWS = 12, MINES = 16, N = COLS * ROWS;

  function pc(s) {
    var m; s = String(s).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(s))) { var p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
    return [128, 128, 128];
  }
  function mix(a, b, t) {
    var A = pc(a), B = pc(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  // classic minesweeper number hues blended toward theme text color
  var BASE = ['', '#2e62ff', '#1f9e44', '#e33b3b', '#7040e0', '#b03030', '#18a0a0', '#c47f1e', '#8a8a8a'];
  var NUMC = BASE.map(function (h, i) { return i ? mix(h, C.text, 0.4) : ''; });

  var mine = new Uint8Array(N), flag = new Uint8Array(N), open = new Uint8Array(N), cnt = new Uint8Array(N);
  var placed = false, over = false, flagMode = false, opened = 0, flags = 0, seconds = 0, boomIdx = -1;
  var timerInt = 0, lpTimer = 0, paused = false;
  var downIdx = -1, downX = 0, downY = 0, lpFired = false;

  // ----- DOM -----
  container.style.background = C.bg;
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;color:' + C.text + ';user-select:none;-webkit-user-select:none;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;max-width:420px;padding:10px 14px;box-sizing:border-box;font-weight:700;font-size:16px;';
  var mineLbl = document.createElement('div');
  var timeLbl = document.createElement('div');
  var modeBtn = document.createElement('button');
  modeBtn.style.cssText = 'font:inherit;font-size:18px;padding:5px 14px;border-radius:10px;border:1px solid ' + mix(C.text, C.bg, 0.75) + ';background:' + C.panel2 + ';color:' + C.text + ';cursor:pointer;';
  bar.appendChild(mineLbl); bar.appendChild(timeLbl); bar.appendChild(modeBtn);

  var wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;width:100%;min-height:0;';
  var gridEl = document.createElement('div');
  gridEl.style.cssText = 'display:grid;gap:2px;touch-action:none;';
  wrap.appendChild(gridEl);

  var hint = document.createElement('div');
  hint.style.cssText = 'padding:8px 12px 12px;font-size:12px;color:' + C.muted + ';text-align:center;';
  hint.textContent = ru ? 'Долгое нажатие — флажок' : 'Long-press to flag';

  root.appendChild(bar); root.appendChild(wrap); root.appendChild(hint);
  container.appendChild(root);

  var cells = [];
  for (var i0 = 0; i0 < N; i0++) {
    var el = document.createElement('div');
    el.setAttribute('data-i', i0);
    el.style.cssText = 'display:flex;align-items:center;justify-content:center;border-radius:4px;font-weight:700;background:' + C.panel2 + ';';
    gridEl.appendChild(el);
    cells.push(el);
  }

  function layout() {
    var w = wrap.clientWidth - 16, h = wrap.clientHeight - 16;
    var cell = Math.floor(Math.min((w - (COLS - 1) * 2) / COLS, (h - (ROWS - 1) * 2) / ROWS));
    cell = Math.max(16, Math.min(cell, 52));
    gridEl.style.gridTemplateColumns = 'repeat(' + COLS + ',' + cell + 'px)';
    gridEl.style.gridAutoRows = cell + 'px';
    gridEl.style.fontSize = Math.floor(cell * 0.55) + 'px';
  }
  window.addEventListener('resize', layout);

  // ----- helpers -----
  function fmt(s) { var m = (s / 60) | 0; s = s % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function updBar() {
    mineLbl.textContent = '💣 ' + (MINES - flags);
    timeLbl.textContent = '⏱ ' + fmt(seconds);
    modeBtn.textContent = flagMode ? '🚩' : '⛏';
    modeBtn.style.background = flagMode ? mix(C.accent, C.bg, 0.6) : C.panel2;
  }
  function eachNb(i, fn) {
    var x = i % COLS, y = (i / COLS) | 0;
    for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      var nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) fn(ny * COLS + nx);
    }
  }
  function paint(i) {
    var el = cells[i], s = el.style;
    if (open[i]) {
      if (mine[i]) {
        s.background = i === boomIdx ? C.bad : mix(C.panel, C.bad, 0.3);
        el.textContent = '💣';
      } else {
        s.background = mix(C.panel, C.bg, 0.45);
        el.textContent = cnt[i] ? String(cnt[i]) : '';
        if (cnt[i]) s.color = NUMC[cnt[i]];
      }
    } else {
      s.background = C.panel2;
      el.textContent = flag[i] ? '🚩' : '';
    }
  }
  function placeMines(safe) {
    var banned = {}; banned[safe] = 1;
    eachNb(safe, function (j) { banned[j] = 1; });
    var left = MINES;
    while (left > 0) {
      var k = (Math.random() * N) | 0;
      if (mine[k] || banned[k]) continue;
      mine[k] = 1; left--;
    }
    for (var i = 0; i < N; i++) {
      if (mine[i]) continue;
      var c = 0;
      eachNb(i, function (j) { if (mine[j]) c++; });
      cnt[i] = c;
    }
    placed = true;
    timerInt = setInterval(function () {
      if (!paused && !over) { seconds++; timeLbl.textContent = '⏱ ' + fmt(seconds); }
    }, 1000);
  }
  function stopTimer() { if (timerInt) { clearInterval(timerInt); timerInt = 0; } }

  function toggleFlag(i) {
    if (over || open[i]) return;
    flag[i] = flag[i] ? 0 : 1;
    flags += flag[i] ? 1 : -1;
    paint(i); updBar();
    api.haptic('light');
  }
  function doReveal(i0) {
    var st = [i0];
    while (st.length) {
      var i = st.pop();
      if (open[i] || flag[i]) continue;
      open[i] = 1; opened++; paint(i);
      if (!cnt[i]) eachNb(i, function (j) { if (!open[j] && !mine[j]) st.push(j); });
    }
    api.score(opened);
  }
  function boom(i) {
    over = true; boomIdx = i; stopTimer();
    for (var k = 0; k < N; k++) {
      if (mine[k]) { open[k] = 1; paint(k); }
      else if (flag[k]) cells[k].textContent = '❌';
    }
    api.haptic('error');
    api.gameOver(opened);
  }
  function win() {
    over = true; stopTimer();
    var sc = 1000 + Math.max(0, 600 - seconds);
    api.haptic('success');
    api.score(sc);
    api.gameOver(sc, { win: true });
  }
  function act(i) {
    if (over) return;
    if (flagMode) { toggleFlag(i); return; }
    if (flag[i] || open[i]) return;
    if (!placed) placeMines(i);
    if (mine[i]) { boom(i); return; }
    doReveal(i);
    if (opened === N - MINES) win();
  }

  // ----- input -----
  function idxOf(ev) {
    var t = ev.target;
    var a = t && t.getAttribute && t.getAttribute('data-i');
    return a == null ? -1 : +a;
  }
  function onDown(ev) {
    if (over || paused) return;
    var i = idxOf(ev);
    if (i < 0) return;
    downIdx = i; downX = ev.clientX; downY = ev.clientY; lpFired = false;
    clearTimeout(lpTimer);
    lpTimer = setTimeout(function () {
      lpFired = true;
      if (!open[downIdx]) toggleFlag(downIdx);
    }, 400);
  }
  function onMove(ev) {
    if (downIdx < 0) return;
    if (Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 14) cancelPress();
  }
  function cancelPress() { clearTimeout(lpTimer); downIdx = -1; lpFired = false; }
  function onUp(ev) {
    if (downIdx < 0) return;
    clearTimeout(lpTimer);
    if (!lpFired && idxOf(ev) === downIdx) act(downIdx);
    downIdx = -1; lpFired = false;
  }
  function onCtx(ev) {
    ev.preventDefault();
    var i = idxOf(ev);
    if (i >= 0) toggleFlag(i);
  }
  gridEl.addEventListener('pointerdown', onDown);
  gridEl.addEventListener('pointermove', onMove);
  gridEl.addEventListener('pointerup', onUp);
  gridEl.addEventListener('pointercancel', cancelPress);
  gridEl.addEventListener('contextmenu', onCtx);
  modeBtn.addEventListener('click', function () { flagMode = !flagMode; updBar(); });

  layout();
  updBar();
  api.score(0);

  return {
    destroy: function () {
      stopTimer();
      clearTimeout(lpTimer);
      window.removeEventListener('resize', layout);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
