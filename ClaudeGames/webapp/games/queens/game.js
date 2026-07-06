/* N-Queens — place N peaceful queens, N = 4..10, DOM board. */
(function () {
'use strict';
MG.register('queens', function (container, api) {
  var C = api.colors;
  var NS = [4, 5, 6, 7, 8, 9, 10];
  var timers = [];
  var paused = false, over = false, busy = false;
  var total = 0, lvl = 0;
  var n = 4, q = [], solCols = [], cellEls = [], pairsNow = 0;

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
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* board square colors — blends of the theme palette */
  var lightSq = blend(C.panel2, C.text, 0.22);
  var darkSq = blend(C.panel, C.bg, 0.35);

  /* precompute one random solution for hints */
  function solveN(size) {
    var res = [], r;
    for (r = 0; r < size; r++) res.push(-1);
    function ok(row, col) {
      for (var rr = 0; rr < row; rr++) {
        var cc = res[rr];
        if (cc === col || Math.abs(rr - row) === Math.abs(cc - col)) return false;
      }
      return true;
    }
    function bt(row) {
      if (row === size) return true;
      var order = [], k;
      for (k = 0; k < size; k++) order.push(k);
      shuffle(order);
      for (k = 0; k < size; k++) {
        if (ok(row, order[k])) {
          res[row] = order[k];
          if (bt(row + 1)) return true;
          res[row] = -1;
        }
      }
      return false;
    }
    bt(0);
    return res;
  }

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;';
  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;max-width:430px;margin-bottom:8px;font-weight:600;color:' + C.text + ';';
  var levelEl = document.createElement('span');
  var confEl = document.createElement('span');
  var hintBtn = document.createElement('button');
  hintBtn.textContent = '💡 −10';
  hintBtn.style.cssText = 'border:0;border-radius:10px;padding:7px 12px;font-size:14px;font-weight:700;cursor:pointer;color:' + C.text + ';background:' + C.panel2 + ';';
  hud.appendChild(levelEl); hud.appendChild(confEl); hud.appendChild(hintBtn);
  var boardEl = document.createElement('div');
  boardEl.style.cssText = 'display:grid;background:' + C.panel + ';border-radius:10px;padding:5px;user-select:none;-webkit-user-select:none;touch-action:manipulation;overflow:hidden;position:relative;';
  var hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.style.cssText = 'margin-top:8px;font-size:12px;text-align:center;color:' + C.muted + ';';
  hint.textContent = api.lang === 'ru' ? 'расставь ферзей так, чтобы никто никого не бил' : 'place queens so none attack each other';
  var toast = document.createElement('div');
  toast.style.cssText = 'position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:34px;font-weight:800;color:' + C.good + ';pointer-events:none;opacity:0;text-shadow:0 2px 10px rgba(0,0,0,.45);' + (api.lowEnd ? '' : 'transition:opacity .25s;');
  wrap.appendChild(hud); wrap.appendChild(boardEl); wrap.appendChild(hint); wrap.appendChild(toast);
  container.appendChild(wrap);

  function render() {
    boardEl.innerHTML = '';
    cellEls = [];
    var W = container.clientWidth || 320, H = container.clientHeight || 480;
    var cell = Math.floor(Math.min((W - 26) / n, (H - 130) / n));
    if (cell > 52) cell = 52;
    if (cell < 26) cell = 26;
    boardEl.style.gridTemplateColumns = 'repeat(' + n + ',' + cell + 'px)';
    boardEl.style.gridTemplateRows = 'repeat(' + n + ',' + cell + 'px)';
    for (var i = 0; i < n * n; i++) {
      var e = document.createElement('div');
      e.setAttribute('data-i', i);
      e.style.cssText = 'display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1;font-size:' + Math.round(cell * 0.72) + 'px;color:' + C.text + ';' + (api.lowEnd ? '' : 'transition:background .12s;');
      boardEl.appendChild(e);
      cellEls.push(e);
    }
    paint();
  }

  function recompute() {
    var queens = [], badMap = {}, i, a, b;
    for (i = 0; i < n * n; i++) if (q[i]) queens.push({ r: (i / n) | 0, c: i % n });
    var pairs = 0;
    for (a = 0; a < queens.length; a++) {
      for (b = a + 1; b < queens.length; b++) {
        var A = queens[a], B = queens[b];
        var dr = B.r - A.r, dc = B.c - A.c;
        if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) continue;
        pairs++;
        var steps = Math.max(Math.abs(dr), Math.abs(dc));
        var sr = dr === 0 ? 0 : dr > 0 ? 1 : -1;
        var sc = dc === 0 ? 0 : dc > 0 ? 1 : -1;
        for (i = 0; i <= steps; i++) badMap[(A.r + sr * i) * n + (A.c + sc * i)] = true;
      }
    }
    return { pairs: pairs, bad: badMap, placed: queens.length };
  }

  function paint() {
    var st = recompute();
    pairsNow = st.pairs;
    for (var i = 0; i < n * n; i++) {
      var base = ((((i / n) | 0) + (i % n)) % 2) ? darkSq : lightSq;
      var e = cellEls[i];
      e.style.background = st.bad[i] ? blend(base, C.bad, 0.5) : base;
      e.textContent = q[i] ? '♛' : '';
      e.style.textShadow = q[i] && st.bad[i] ? '0 0 6px ' + C.bad : 'none';
    }
    confEl.textContent = '⚔️ ' + st.pairs + '  👑 ' + st.placed + '/' + n;
    return st;
  }

  function updateHud() {
    levelEl.textContent = api.t('level') + ' ' + (lvl + 1) + '/' + NS.length;
  }

  function build() {
    n = NS[lvl];
    q = [];
    for (var i = 0; i < n * n; i++) q.push(false);
    solCols = solveN(n);
    render();
    updateHud();
  }

  function crownShower() {
    if (api.lowEnd) return;
    var W = container.clientWidth || 320, H = container.clientHeight || 480;
    for (var k = 0; k < 12; k++) {
      (function () {
        var s = document.createElement('span');
        s.textContent = '👑';
        var x = (Math.random() * (W - 30)) | 0;
        var rot = ((Math.random() * 240 - 120) | 0);
        var dur = 800 + ((Math.random() * 500) | 0);
        s.style.cssText = 'position:absolute;left:' + x + 'px;top:-34px;font-size:' + (18 + ((Math.random() * 16) | 0)) + 'px;pointer-events:none;z-index:5;transition:transform ' + dur + 'ms ease-in;';
        wrap.appendChild(s);
        later(function () { s.style.transform = 'translateY(' + (H + 60) + 'px) rotate(' + rot + 'deg)'; }, 16);
        later(function () { if (s.parentNode) s.parentNode.removeChild(s); }, dur + 120);
      })();
    }
  }

  function win() {
    busy = true;
    var pts = n * 20;
    total += pts;
    api.score(total);
    api.haptic('success');
    crownShower();
    toast.textContent = '👑 +' + pts;
    toast.style.opacity = '1';
    later(function () {
      toast.style.opacity = '0';
      lvl++;
      if (lvl >= NS.length) {
        over = true;
        api.gameOver(total, { win: true });
      } else {
        busy = false;
        build();
      }
    }, 1300);
  }

  function afterChange() {
    var prev = pairsNow;
    var st = paint();
    if (st.placed === n && st.pairs === 0) win();
    else if (st.pairs > prev) api.haptic('error');
  }

  function onTap(ev) {
    if (paused || busy || over) return;
    var t = ev.target;
    var is = t && t.getAttribute ? t.getAttribute('data-i') : null;
    if (is === null || is === undefined) return;
    var i = +is;
    q[i] = !q[i];
    afterChange();
  }
  boardEl.addEventListener('click', onTap);

  function onHint() {
    if (paused || busy || over) return;
    for (var r = 0; r < n; r++) {
      var idx = r * n + solCols[r];
      if (!q[idx]) {
        /* clear wrong queens in that row, then place the correct one */
        for (var c = 0; c < n; c++) q[r * n + c] = false;
        q[idx] = true;
        total = Math.max(0, total - 10);
        api.score(total);
        api.haptic('medium');
        afterChange();
        return;
      }
    }
  }
  hintBtn.addEventListener('click', onHint);

  function onResize() { if (!over) render(); }
  window.addEventListener('resize', onResize);

  api.score(0);
  build();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('resize', onResize);
      boardEl.removeEventListener('click', onTap);
      hintBtn.removeEventListener('click', onHint);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
