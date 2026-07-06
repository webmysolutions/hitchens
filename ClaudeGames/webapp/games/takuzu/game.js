/* Takuzu (Binairo) — binary puzzle, generated + logic-solver verified, DOM grid. */
(function () {
'use strict';

/* @takuzu-core-start (pure logic, no DOM — extracted verbatim by the node test) */
function tkShuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = (Math.random() * (i + 1)) | 0, t = a[i];
    a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* fill a complete valid grid via randomized backtracking */
function tkGenFull(n) {
  var g = [], i, half = n / 2;
  for (i = 0; i < n * n; i++) g.push(-1);
  function ok(idx, v) {
    var r = (idx / n) | 0, c = idx % n, k, cnt;
    if (c >= 2 && g[idx - 1] === v && g[idx - 2] === v) return false;
    if (r >= 2 && g[idx - n] === v && g[idx - 2 * n] === v) return false;
    cnt = 1;
    for (k = 0; k < c; k++) if (g[r * n + k] === v) cnt++;
    if (cnt > half) return false;
    cnt = 1;
    for (k = 0; k < r; k++) if (g[k * n + c] === v) cnt++;
    if (cnt > half) return false;
    return true;
  }
  function bt(idx) {
    if (idx === n * n) return true;
    var first = Math.random() < 0.5 ? 0 : 1, t;
    for (t = 0; t < 2; t++) {
      var v = t === 0 ? first : 1 - first;
      if (ok(idx, v)) {
        g[idx] = v;
        if (bt(idx + 1)) return true;
        g[idx] = -1;
      }
    }
    return false;
  }
  return bt(0) ? g : null;
}

/* logical solver: three basic deduction rules applied to fixpoint.
   returns the solved full grid, or null if logic alone cannot finish. */
function tkSolve(puz, n) {
  var g = puz.slice(), half = n / 2, changed = true;
  function set(i, v) { if (g[i] === -1) { g[i] = v; changed = true; } }
  function trip(i, step) {
    var a = g[i], b = g[i + step], c = g[i + 2 * step];
    if (a !== -1 && a === b && c === -1) set(i + 2 * step, 1 - a);
    if (b !== -1 && b === c && a === -1) set(i, 1 - b);
    if (a !== -1 && a === c && b === -1) set(i + step, 1 - a);
  }
  while (changed) {
    changed = false;
    var r, c, i;
    for (r = 0; r < n; r++) {
      for (c = 0; c + 2 < n; c++) trip(r * n + c, 1);      /* pairs & gaps in rows */
      for (c = 0; c + 2 < n; c++) trip(c * n + r, n);      /* pairs & gaps in cols */
    }
    for (r = 0; r < n; r++) {                              /* count rule */
      var r0 = 0, r1 = 0, c0 = 0, c1 = 0;
      for (i = 0; i < n; i++) {
        if (g[r * n + i] === 0) r0++; else if (g[r * n + i] === 1) r1++;
        if (g[i * n + r] === 0) c0++; else if (g[i * n + r] === 1) c1++;
      }
      for (i = 0; i < n; i++) {
        if (g[r * n + i] === -1) {
          if (r0 === half) set(r * n + i, 1);
          else if (r1 === half) set(r * n + i, 0);
        }
        if (g[i * n + r] === -1) {
          if (c0 === half) set(i * n + r, 1);
          else if (c1 === half) set(i * n + r, 0);
        }
      }
    }
  }
  for (var k = 0; k < n * n; k++) if (g[k] === -1) return null;
  return g;
}

/* dig holes while the logic solver can still finish → human-solvable puzzle */
function tkMakePuzzle(n) {
  var sol = tkGenFull(n);
  var g = sol.slice(), order = [], i;
  for (i = 0; i < n * n; i++) order.push(i);
  tkShuffle(order);
  for (i = 0; i < order.length; i++) {
    var idx = order[i], save = g[idx];
    g[idx] = -1;
    if (!tkSolve(g, n)) g[idx] = save;
  }
  return { sol: sol, grid: g };
}
/* @takuzu-core-end */

MG.register('takuzu', function (container, api) {
  var C = api.colors;
  var SIZES = [6, 6, 8, 8, 8, 10, 10, 10];
  var timers = [];
  var paused = false, over = false, busy = false;
  var total = 0, lvl = 0;
  var n = 6, half = 3, grid = [], given = [], badPrev = 0;
  var cellEls = [];

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

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;';
  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;width:100%;max-width:430px;margin-bottom:8px;font-weight:600;color:' + C.text + ';';
  var levelEl = document.createElement('span');
  var sizeEl = document.createElement('span');
  sizeEl.style.color = C.muted;
  hud.appendChild(levelEl); hud.appendChild(sizeEl);
  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'display:grid;gap:2px;background:' + C.panel + ';border-radius:12px;padding:6px;user-select:none;-webkit-user-select:none;touch-action:manipulation;';
  var hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.style.cssText = 'margin-top:8px;font-size:12px;text-align:center;color:' + C.muted + ';';
  hint.textContent = api.lang === 'ru' ? 'не больше двух подряд · поровну 🔵 и 🔴 в ряду' : 'no three in a row · equal 🔵 and 🔴 per line';
  var toast = document.createElement('div');
  toast.style.cssText = 'position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:34px;font-weight:800;color:' + C.good + ';pointer-events:none;opacity:0;text-shadow:0 2px 10px rgba(0,0,0,.45);' + (api.lowEnd ? '' : 'transition:opacity .25s;');
  wrap.appendChild(hud); wrap.appendChild(boardEl); wrap.appendChild(hint); wrap.appendChild(toast);
  container.appendChild(wrap);

  var userBg = blend(C.panel2, C.bg, 0.35);

  function render() {
    boardEl.innerHTML = '';
    cellEls = [];
    var W = container.clientWidth || 320, H = container.clientHeight || 480;
    var cell = Math.floor(Math.min((W - 26) / n, (H - 130) / n));
    if (cell > 48) cell = 48;
    if (cell < 22) cell = 22;
    boardEl.style.gridTemplateColumns = 'repeat(' + n + ',' + cell + 'px)';
    boardEl.style.gridTemplateRows = 'repeat(' + n + ',' + cell + 'px)';
    for (var i = 0; i < n * n; i++) {
      var e = document.createElement('div');
      e.setAttribute('data-i', i);
      e.style.cssText = 'border-radius:6px;display:flex;align-items:center;justify-content:center;line-height:1;font-size:' + Math.round(cell * 0.58) + 'px;' +
        (given[i] ? 'background:' + C.panel2 + ';' : 'background:' + userBg + ';cursor:pointer;') +
        (api.lowEnd ? '' : 'transition:box-shadow .12s;');
      boardEl.appendChild(e);
      cellEls.push(e);
    }
    paintAll();
  }

  function paintCell(i, bad) {
    var e = cellEls[i];
    e.textContent = grid[i] === 0 ? '🔵' : grid[i] === 1 ? '🔴' : '';
    e.style.opacity = given[i] ? '.85' : '1';
    e.style.boxShadow = bad ? 'inset 0 0 0 2px ' + C.bad : 'none';
  }

  function findBad() {
    var bad = [], any = 0, i, r, c, v;
    for (i = 0; i < n * n; i++) bad.push(false);
    for (r = 0; r < n; r++) {
      for (c = 0; c + 2 < n; c++) {
        i = r * n + c; v = grid[i];
        if (v !== -1 && grid[i + 1] === v && grid[i + 2] === v) { bad[i] = bad[i + 1] = bad[i + 2] = true; any = 1; }
        i = c * n + r; v = grid[i];
        if (v !== -1 && grid[i + n] === v && grid[i + 2 * n] === v) { bad[i] = bad[i + n] = bad[i + 2 * n] = true; any = 1; }
      }
      var r0 = 0, r1 = 0, c0 = 0, c1 = 0;
      for (i = 0; i < n; i++) {
        if (grid[r * n + i] === 0) r0++; else if (grid[r * n + i] === 1) r1++;
        if (grid[i * n + r] === 0) c0++; else if (grid[i * n + r] === 1) c1++;
      }
      for (i = 0; i < n; i++) {
        v = grid[r * n + i];
        if ((v === 0 && r0 > half) || (v === 1 && r1 > half)) { bad[r * n + i] = true; any = 1; }
        v = grid[i * n + r];
        if ((v === 0 && c0 > half) || (v === 1 && c1 > half)) { bad[i * n + r] = true; any = 1; }
      }
    }
    return { bad: bad, any: any };
  }

  function paintAll() {
    var f = findBad();
    for (var i = 0; i < n * n; i++) paintCell(i, f.bad[i]);
    return f;
  }

  function updateHud() {
    levelEl.textContent = api.t('level') + ' ' + (lvl + 1) + '/' + SIZES.length;
    sizeEl.textContent = n + '×' + n;
  }

  function buildLevel() {
    n = SIZES[lvl];
    half = n / 2;
    var p = tkMakePuzzle(n);
    grid = p.grid.slice();
    given = [];
    for (var i = 0; i < n * n; i++) given.push(p.grid[i] !== -1);
    badPrev = 0;
    render();
    updateHud();
  }

  function checkSolved() {
    for (var i = 0; i < n * n; i++) if (grid[i] === -1) return false;
    return !findBad().any;
  }

  function onTap(ev) {
    if (paused || busy || over) return;
    var t = ev.target;
    var is = t && t.getAttribute ? t.getAttribute('data-i') : null;
    if (is === null || is === undefined) return;
    var i = +is;
    if (given[i]) return;
    grid[i] = grid[i] === -1 ? 0 : grid[i] === 0 ? 1 : -1;
    var f = paintAll();
    var badNow = 0, k;
    for (k = 0; k < n * n; k++) if (f.bad[k]) badNow++;
    if (badNow > badPrev) api.haptic('error');
    badPrev = badNow;
    if (checkSolved()) {
      busy = true;
      var pts = 150 + (n - 6) * 25;
      total += pts;
      api.score(total);
      api.haptic('success');
      toast.textContent = '✅ +' + pts;
      toast.style.opacity = '1';
      later(function () {
        toast.style.opacity = '0';
        lvl++;
        if (lvl >= SIZES.length) {
          over = true;
          api.gameOver(total, { win: true });
        } else {
          busy = false;
          buildLevel();
        }
      }, 1200);
    }
  }
  boardEl.addEventListener('click', onTap);

  function onResize() { if (!over) render(); }
  window.addEventListener('resize', onResize);

  api.score(0);
  buildLevel();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('resize', onResize);
      boardEl.removeEventListener('click', onTap);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
