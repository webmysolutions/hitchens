/* Lights Out — 5x5 DOM grid, 10 generated levels, always solvable. */
(function () {
'use strict';
MG.register('lightsout', function (container, api) {
  var C = api.colors;
  var S = 5, CELLS = S * S, LEVELS = 10;
  var lights = new Array(CELLS);
  var level = 1, par = 0, movesUsed = 0, total = 0;
  var busy = false, paused = false;
  var timers = [];
  var GLOW = api.lowEnd ? '' : '0 0 10px ';

  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
  }

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:10px;font-weight:600;color:' + C.muted + ';';
  var levelEl = document.createElement('span');
  levelEl.style.color = C.text;
  var movesEl = document.createElement('span');
  hud.appendChild(levelEl);
  hud.appendChild(movesEl);
  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'display:grid;grid-template-columns:repeat(' + S + ',1fr);grid-gap:6px;gap:6px;' +
    'padding:8px;border-radius:12px;background:' + C.panel + ';';
  wrap.appendChild(hud);
  wrap.appendChild(boardEl);
  container.appendChild(wrap);

  var cells = [];
  for (var ci = 0; ci < CELLS; ci++) {
    var d = document.createElement('div');
    d.setAttribute('data-i', ci);
    d.style.cssText = 'border-radius:8px;cursor:pointer;background:' + C.panel2 + ';' +
      (api.lowEnd ? '' : 'transition:background .12s ease,box-shadow .12s ease;');
    boardEl.appendChild(d);
    cells.push(d);
  }

  function layout() {
    var w = container.clientWidth || 320, h = container.clientHeight || 480;
    var px = Math.min(400, Math.max(160, Math.floor(Math.min(w * 0.92, h * 0.75))));
    boardEl.style.width = boardEl.style.height = px + 'px';
    hud.style.width = px + 'px';
    var cell = Math.floor((px - 16 - 6 * (S - 1)) / S) + 'px';
    for (var i = 0; i < CELLS; i++) cells[i].style.height = cell;
  }

  function paint(i) {
    cells[i].style.background = lights[i] ? C.accent : C.panel2;
    if (GLOW) cells[i].style.boxShadow = lights[i] ? GLOW + C.accent : 'none';
  }
  function paintAll() { for (var i = 0; i < CELLS; i++) paint(i); }

  var parLabel = api.lang === 'ru' ? 'цель' : 'par';
  function updateHud() {
    levelEl.textContent = api.t('level') + ' ' + level + '/' + LEVELS;
    movesEl.textContent = api.t('moves') + ': ' + movesUsed + ' (' + parLabel + ' ' + par + ')';
  }

  /* ---- logic ---- */
  function press(i) {
    var r = (i / S) | 0, c = i % S;
    lights[i] = !lights[i];
    if (c > 0) lights[i - 1] = !lights[i - 1];
    if (c < S - 1) lights[i + 1] = !lights[i + 1];
    if (r > 0) lights[i - S] = !lights[i - S];
    if (r < S - 1) lights[i + S] = !lights[i + S];
  }
  function allOff() {
    for (var i = 0; i < CELLS; i++) if (lights[i]) return false;
    return true;
  }
  function newLevel() {
    par = Math.min(12, level + 2); // 3,4,5,... capped at 12
    do {
      var i;
      for (i = 0; i < CELLS; i++) lights[i] = false;
      // press `par` distinct random cells => solvable in `par` moves
      var idx = [];
      for (i = 0; i < CELLS; i++) idx.push(i);
      for (i = idx.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
      }
      for (i = 0; i < par; i++) press(idx[i]);
    } while (allOff());
    movesUsed = 0;
    paintAll();
    updateHud();
  }

  function tap(i) {
    if (busy || paused) return;
    press(i);
    movesUsed++;
    api.haptic('light');
    // repaint the plus shape
    var r = (i / S) | 0, c = i % S;
    paint(i);
    if (c > 0) paint(i - 1);
    if (c < S - 1) paint(i + 1);
    if (r > 0) paint(i - S);
    if (r < S - 1) paint(i + S);
    updateHud();
    if (!allOff()) return;
    busy = true;
    var pts = Math.max(10, 100 - 5 * (movesUsed - par));
    total += pts;
    api.score(total);
    api.haptic('success');
    if (level >= LEVELS) {
      later(function () { api.gameOver(total, { win: true }); }, 500);
    } else {
      later(function () { level++; newLevel(); busy = false; }, 600);
    }
  }

  /* ---- input ---- */
  function onTap(e) {
    var t = e.target;
    if (!t || t === boardEl || !t.getAttribute) return;
    var a = t.getAttribute('data-i');
    if (a === null) return;
    tap(+a);
  }
  var EVT = window.PointerEvent ? 'pointerdown' : 'click';
  boardEl.addEventListener(EVT, onTap);

  // keyboard: arrows move a cursor, space/enter presses
  var cur = 12, kb = false;
  function showCur() {
    for (var i = 0; i < CELLS; i++) cells[i].style.outline = 'none';
    if (kb) cells[cur].style.outline = '2px solid ' + C.text;
  }
  function onKey(e) {
    var d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -S, ArrowDown: S }[e.key];
    if (d !== undefined) {
      e.preventDefault();
      kb = true;
      var c = cur % S;
      if (d === -1 && c === 0) return showCur();
      if (d === 1 && c === S - 1) return showCur();
      var n = cur + d;
      if (n >= 0 && n < CELLS) cur = n;
      showCur();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      kb = true;
      showCur();
      tap(cur);
    }
  }
  window.addEventListener('keydown', onKey);
  function onResize() { layout(); }
  window.addEventListener('resize', onResize);

  /* ---- start ---- */
  layout();
  api.score(0);
  newLevel();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      boardEl.removeEventListener(EVT, onTap);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
