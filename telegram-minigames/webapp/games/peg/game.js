/* Peg Solitaire — English cross, European, Triangle-15. Tap or drag to jump. */
(function () {
'use strict';
MG.register('peg', function (container, api) {
  var C = api.colors;
  var timers = [];
  var paused = false, over = false, busy = false;
  var total = 0, lvl = 0, allSolved = true;

  var holes = [];      /* {r,c,x,y} */
  var keyMap = {};     /* 'r,c' -> hole index */
  var pegs = [];       /* boolean per hole */
  var history = [];    /* [from, mid, to] */
  var sel = -1;
  var targets = {};    /* holeIdx -> midIdx */
  var kind = 0, cell = 40;
  var holeEls = [];

  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      fn();
    }, ms);
    timers.push(id);
  }
  function hx(c) {
    c = String(c || '').replace('#', '');
    if (c.length === 3) c = c.charAt(0) + c.charAt(0) + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2);
    if (c.length !== 6) return null;
    var v = parseInt(c, 16);
    return isNaN(v) ? null : [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function blend(a, b, t) {
    var A = hx(a), B = hx(b);
    if (!A || !B) return a;
    var r = [0, 0, 0];
    for (var i = 0; i < 3; i++) r[i] = Math.round(A[i] + (B[i] - A[i]) * t);
    return 'rgb(' + r[0] + ',' + r[1] + ',' + r[2] + ')';
  }

  /* warm "wood" tone derived from the theme palette */
  var wood = blend(C.bad, C.good, 0.45);
  var woodL = blend(wood, C.text, 0.5);
  var woodD = blend(wood, C.bg, 0.55);
  var holeBg = blend(C.bg, C.panel, 0.5);

  var SQ_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  var TRI_DIRS = [[0, 1], [0, -1], [-1, 0], [-1, -1], [1, 0], [1, 1]];
  var EMPTY_AT = [[3, 3], [0, 2], [0, 0]];

  function validCell(k, r, c) {
    if (k === 2) return r >= 0 && r < 5 && c >= 0 && c <= r;
    if (r < 0 || r > 6 || c < 0 || c > 6) return false;
    var eng = (r >= 2 && r <= 4) || (c >= 2 && c <= 4);
    if (k === 0) return eng;
    return eng || ((r === 1 || r === 5) && (c === 1 || c === 5));
  }

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;';
  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;max-width:430px;margin-bottom:8px;font-weight:600;color:' + C.text + ';';
  var levelEl = document.createElement('span');
  var pegsEl = document.createElement('span');
  var undoBtn = document.createElement('button');
  var restBtn = document.createElement('button');
  var btnCss = 'border:0;border-radius:10px;padding:7px 11px;font-size:14px;font-weight:700;cursor:pointer;color:' + C.text + ';background:' + C.panel2 + ';';
  undoBtn.style.cssText = btnCss;
  restBtn.style.cssText = btnCss;
  undoBtn.textContent = '↩️';
  restBtn.textContent = '🔄';
  hud.appendChild(levelEl); hud.appendChild(pegsEl); hud.appendChild(undoBtn); hud.appendChild(restBtn);
  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'position:relative;background:' + C.panel + ';border-radius:14px;user-select:none;-webkit-user-select:none;touch-action:manipulation;';
  var hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.style.cssText = 'margin-top:8px;font-size:12px;text-align:center;color:' + C.muted + ';';
  hint.textContent = api.lang === 'ru' ? 'прыгай через фишку в пустую лунку — оставь одну' : 'jump over a peg into an empty hole — leave one';
  var toast = document.createElement('div');
  toast.style.cssText = 'position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:32px;font-weight:800;color:' + C.good + ';pointer-events:none;opacity:0;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.45);' + (api.lowEnd ? '' : 'transition:opacity .25s;');
  wrap.appendChild(hud); wrap.appendChild(boardEl); wrap.appendChild(hint); wrap.appendChild(toast);
  container.appendChild(wrap);

  function boardDims() {
    var W = container.clientWidth || 320, H = container.clientHeight || 480;
    var cols = kind === 2 ? 5 : 7, rows = kind === 2 ? 4.6 : 7;
    cell = Math.floor(Math.min((W - 26) / cols, (H - 150) / rows));
    if (cell > 56) cell = 56;
    if (cell < 30) cell = 30;
    return { w: Math.ceil(cols * cell) + 12, h: Math.ceil(rows * cell) + 12 };
  }

  function layout() {
    var d = boardDims();
    boardEl.style.width = d.w + 'px';
    boardEl.style.height = d.h + 'px';
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      if (kind === 2) {
        h.x = d.w / 2 + (h.c - h.r / 2) * cell;
        h.y = 6 + h.r * cell * 0.9 + cell / 2;
      } else {
        h.x = 6 + h.c * cell + cell / 2;
        h.y = 6 + h.r * cell + cell / 2;
      }
      var e = holeEls[i], sz = Math.round(cell * 0.82);
      e.style.width = e.style.height = sz + 'px';
      e.style.left = Math.round(h.x - sz / 2) + 'px';
      e.style.top = Math.round(h.y - sz / 2) + 'px';
    }
  }

  function build() {
    holes = []; keyMap = {}; pegs = []; history = []; sel = -1; targets = {};
    boardEl.innerHTML = '';
    holeEls = [];
    var maxR = kind === 2 ? 5 : 7, r, c;
    for (r = 0; r < maxR; r++) {
      for (c = 0; c < 7; c++) {
        if (!validCell(kind, r, c)) continue;
        keyMap[r + ',' + c] = holes.length;
        holes.push({ r: r, c: c, x: 0, y: 0 });
        pegs.push(true);
      }
    }
    var em = EMPTY_AT[kind];
    pegs[keyMap[em[0] + ',' + em[1]]] = false;
    for (var i = 0; i < holes.length; i++) {
      var e = document.createElement('div');
      e.setAttribute('data-i', i);
      e.style.cssText = 'position:absolute;border-radius:50%;cursor:pointer;' + (api.lowEnd ? '' : 'transition:box-shadow .1s;');
      boardEl.appendChild(e);
      holeEls.push(e);
    }
    layout();
    paintAll();
    updateHud();
  }

  function paint(i) {
    var e = holeEls[i];
    if (pegs[i]) {
      e.style.background = 'radial-gradient(circle at 32% 28%,' + woodL + ',' + wood + ' 55%,' + woodD + ')';
      e.style.boxShadow = (sel === i ? '0 0 0 3px ' + C.accent + ',' : '') + '0 2px 4px rgba(0,0,0,.35)';
    } else {
      e.style.background = holeBg;
      e.style.boxShadow = targets[i] !== undefined
        ? '0 0 0 3px ' + C.good + ', inset 0 2px 4px rgba(0,0,0,.4)'
        : 'inset 0 2px 4px rgba(0,0,0,.4)';
    }
  }
  function paintAll() { for (var i = 0; i < holes.length; i++) paint(i); }

  function pegCount() {
    var k = 0;
    for (var i = 0; i < pegs.length; i++) if (pegs[i]) k++;
    return k;
  }

  function updateHud() {
    levelEl.textContent = api.t('level') + ' ' + (lvl + 1) + '/3';
    pegsEl.textContent = '📍 ' + pegCount();
  }

  function jumpsFrom(i) {
    var out = {}, h = holes[i];
    if (!pegs[i]) return out;
    var dirs = kind === 2 ? TRI_DIRS : SQ_DIRS;
    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var mid = keyMap[(h.r + dr) + ',' + (h.c + dc)];
      var to = keyMap[(h.r + 2 * dr) + ',' + (h.c + 2 * dc)];
      if (mid !== undefined && to !== undefined && pegs[mid] && !pegs[to]) out[to] = mid;
    }
    return out;
  }

  function anyMoves() {
    for (var i = 0; i < holes.length; i++) {
      if (!pegs[i]) continue;
      var j = jumpsFrom(i);
      for (var k in j) return true;
    }
    return false;
  }

  function select(i) {
    sel = i;
    targets = jumpsFrom(i);
    paintAll();
  }
  function deselect() {
    sel = -1;
    targets = {};
    paintAll();
  }

  function endLevel() {
    busy = true;
    var left = pegCount();
    var pts = left === 1 ? 300 : Math.max(0, 100 - left * 10);
    if (left !== 1) allSolved = false;
    total += pts;
    api.score(total);
    api.haptic(left === 1 ? 'success' : 'medium');
    toast.textContent = (left === 1 ? '🏆 ' : '📍' + left + ' · ') + '+' + pts;
    toast.style.opacity = '1';
    later(function () {
      toast.style.opacity = '0';
      lvl++;
      if (lvl >= 3) {
        over = true;
        api.gameOver(total, { win: allSolved });
      } else {
        busy = false;
        kind = lvl;
        build();
      }
    }, 1500);
  }

  function doMove(from, to) {
    var mid = targets[to];
    if (mid === undefined) return;
    pegs[from] = false;
    pegs[mid] = false;
    pegs[to] = true;
    history.push([from, mid, to]);
    api.haptic('light');
    deselect();
    updateHud();
    if (!anyMoves()) endLevel();
  }

  function holeAt(el) {
    var is = el && el.getAttribute ? el.getAttribute('data-i') : null;
    return (is === null || is === undefined) ? -1 : +is;
  }

  var downIdx = -1;
  function onDown(ev) {
    if (paused || busy || over) return;
    var i = holeAt(ev.target);
    if (i < 0) { deselect(); return; }
    downIdx = i;
    if (pegs[i]) select(i);
    else if (sel >= 0 && targets[i] !== undefined) doMove(sel, i);
    else deselect();
  }
  function onUp(ev) {
    if (paused || busy || over) return;
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    var i = holeAt(el);
    /* drag: released on a legal empty hole different from where we pressed */
    if (i >= 0 && i !== downIdx && sel >= 0 && !pegs[i] && targets[i] !== undefined) doMove(sel, i);
    downIdx = -1;
  }
  boardEl.addEventListener('pointerdown', onDown);
  boardEl.addEventListener('pointerup', onUp);

  function onUndo() {
    if (paused || busy || over || !history.length) return;
    var m = history.pop();
    pegs[m[0]] = true;
    pegs[m[1]] = true;
    pegs[m[2]] = false;
    deselect();
    updateHud();
  }
  function onRestart() {
    if (paused || busy || over) return;
    build();
  }
  undoBtn.addEventListener('click', onUndo);
  restBtn.addEventListener('click', onRestart);

  function onResize() {
    if (over) return;
    layout();
    paintAll();
  }
  window.addEventListener('resize', onResize);

  api.score(0);
  kind = 0;
  build();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('resize', onResize);
      boardEl.removeEventListener('pointerdown', onDown);
      boardEl.removeEventListener('pointerup', onUp);
      undoBtn.removeEventListener('click', onUndo);
      restBtn.removeEventListener('click', onRestart);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
