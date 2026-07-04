/* Nonogram (Picross) — DOM grid, 24 embedded pixel-art patterns, 6 puzzles/session. */
(function () {
'use strict';

/* [emoji, bitmap] — bitmap is size*size chars of 0/1, size = sqrt(length) */
var PATS = {
  5: [
    ['❤️', '01010' + '11111' + '11111' + '01110' + '00100'],
    ['➕', '00100' + '00100' + '11111' + '00100' + '00100'],
    ['✖️', '10001' + '01010' + '00100' + '01010' + '10001'],
    ['🔷', '00100' + '01110' + '11111' + '01110' + '00100'],
    ['🏠', '00100' + '01110' + '11111' + '01110' + '01110'],
    ['🌲', '00100' + '01110' + '11111' + '00100' + '00100'],
    ['🗼', '11111' + '00100' + '00100' + '00100' + '00100'],
    ['⛵', '00100' + '01110' + '00100' + '11111' + '01110']
  ],
  8: [
    ['❤️', '01100110' + '11111111' + '11111111' + '11111111' + '11111111' + '01111110' + '00111100' + '00011000'],
    ['🙂', '00111100' + '01000010' + '10100101' + '10000001' + '10100101' + '10011001' + '01000010' + '00111100'],
    ['☂️', '00111100' + '01111110' + '11111111' + '00010000' + '00010000' + '00010000' + '00010010' + '00001100'],
    ['🐟', '00000010' + '00111000' + '01111101' + '11111111' + '11111111' + '01111101' + '00111000' + '01000000'],
    ['🔨', '01111110' + '01111110' + '00011000' + '00011000' + '00011000' + '00011000' + '00011000' + '00011000'],
    ['🎵', '01111110' + '01111110' + '00100010' + '00100010' + '00100010' + '00100010' + '01100110' + '01100110'],
    ['🔔', '00011000' + '00111100' + '00111100' + '01111110' + '01111110' + '01111110' + '11111111' + '00011000'],
    ['⭐', '00011000' + '00011000' + '11111111' + '01111110' + '00111100' + '01111110' + '01100110' + '11000011']
  ],
  10: [
    ['⭐', '0000110000' + '0000110000' + '0001111000' + '1111111111' + '0111111110' + '0011111100' + '0011111100' + '0111111110' + '0110000110' + '1100000011'],
    ['🚀', '0000110000' + '0001111000' + '0001111000' + '0011111100' + '0011111100' + '0011111100' + '0111111110' + '1101111011' + '1100110011' + '0000110000'],
    ['🎄', '0000110000' + '0001111000' + '0011111100' + '0001111000' + '0011111100' + '0111111110' + '0011111100' + '0111111110' + '1111111111' + '0000110000'],
    ['🦋', '1000000001' + '0100110010' + '0011111100' + '0111111110' + '1111111111' + '1111111111' + '0111111110' + '0011111100' + '0011001100' + '0001001000'],
    ['⚓', '0000110000' + '0001111000' + '0000110000' + '0011111100' + '0000110000' + '0000110000' + '1000110001' + '1100110011' + '0111111110' + '0011111100'],
    ['💀', '0011111100' + '0111111110' + '1111111111' + '1100110011' + '1100110011' + '1111001111' + '0111111110' + '0110110110' + '0011111100' + '0001111000'],
    ['👑', '1000110001' + '1100110011' + '1101111011' + '1111111111' + '1111111111' + '0111111110' + '0111111110' + '0111111110' + '1111111111' + '1111111111'],
    ['🔑', '0011110000' + '0100001000' + '0100001000' + '0011110000' + '0001100000' + '0001100000' + '0001111000' + '0001100000' + '0001111000' + '0001100000']
  ]
};

MG.register('nonogram', function (container, api) {
  var C = api.colors;
  var timers = [];
  var paused = false, over = false, busy = false;

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
    var n = parseInt(c, 16);
    if (isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

  /* session: 2 small, 2 medium, 2 large */
  var p5 = shuffle(PATS[5].slice()), p8 = shuffle(PATS[8].slice()), p10 = shuffle(PATS[10].slice());
  var session = [p5[0], p5[1], p8[0], p8[1], p10[0], p10[1]];
  var TOTAL_P = session.length;

  var total = 0, pidx = 0;
  var size = 5, sol = '', state = [], lives = 3, onesTotal = 0, filledCount = 0;
  var rowClues = [], colClues = [], rowEls = [], colEls = [], cellEls = [];
  var mode = 'fill';

  /* ---- DOM ---- */
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;';
  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;max-width:430px;margin-bottom:8px;font-weight:600;color:' + C.text + ';';
  var progEl = document.createElement('span');
  var livesEl = document.createElement('span');
  livesEl.style.letterSpacing = '2px';
  var modeBtn = document.createElement('button');
  modeBtn.style.cssText = 'border:0;border-radius:10px;padding:7px 12px;font-size:14px;font-weight:700;cursor:pointer;color:' + C.text + ';background:' + C.panel2 + ';';
  hud.appendChild(progEl); hud.appendChild(livesEl); hud.appendChild(modeBtn);
  var gridEl = document.createElement('div');
  gridEl.style.cssText = 'display:grid;gap:1px;background:' + C.panel + ';border-radius:10px;padding:6px;user-select:none;-webkit-user-select:none;touch-action:manipulation;';
  var hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.style.cssText = 'margin-top:8px;color:' + C.muted + ';font-size:12px;text-align:center;';
  hint.textContent = api.lang === 'ru' ? 'закрась клетки по числам-подсказкам' : 'fill cells to match the number clues';
  var toast = document.createElement('div');
  toast.style.cssText = 'position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-size:34px;font-weight:800;color:' + C.good + ';pointer-events:none;opacity:0;text-align:center;text-shadow:0 2px 10px rgba(0,0,0,.45);' + (api.lowEnd ? '' : 'transition:opacity .25s;');
  wrap.appendChild(hud); wrap.appendChild(gridEl); wrap.appendChild(hint); wrap.appendChild(toast);
  container.appendChild(wrap);

  function setMode(m) {
    mode = m;
    modeBtn.textContent = m === 'fill'
      ? '✏️ ' + (api.lang === 'ru' ? 'закрасить' : 'fill')
      : '✖️ ' + (api.lang === 'ru' ? 'пометить' : 'mark');
    modeBtn.style.background = m === 'fill' ? C.panel2 : C.accent;
  }
  function onModeClick() { setMode(mode === 'fill' ? 'mark' : 'fill'); }
  modeBtn.addEventListener('click', onModeClick);

  /* ---- clues ---- */
  function lineRuns(get) {
    var out = [], run = 0, i;
    for (i = 0; i < size; i++) {
      if (get(i)) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    if (!out.length) out.push(0);
    return out;
  }
  function rowOnes(r) { var k = 0; for (var c = 0; c < size; c++) if (sol.charAt(r * size + c) === '1') k++; return k; }
  function colOnes(c) { var k = 0; for (var r = 0; r < size; r++) if (sol.charAt(r * size + c) === '1') k++; return k; }
  function rowFilled(r) { var k = 0; for (var c = 0; c < size; c++) if (state[r * size + c] === 1) k++; return k; }
  function colFilled(c) { var k = 0; for (var r = 0; r < size; r++) if (state[r * size + c] === 1) k++; return k; }

  function bgFor(r, c) {
    return ((((r / 5) | 0) + ((c / 5) | 0)) % 2) ? blend(C.panel2, C.accent, 0.14) : C.panel2;
  }

  function computeCell() {
    var W = container.clientWidth || 320, H = container.clientHeight || 480;
    var mR = 1, mC = 1, i;
    for (i = 0; i < size; i++) {
      if (rowClues[i].length > mR) mR = rowClues[i].length;
      if (colClues[i].length > mC) mC = colClues[i].length;
    }
    var cell = Math.floor(Math.min((W - 28) / (size + mR * 0.6), (H - 118) / (size + mC * 0.62)));
    if (cell > 44) cell = 44;
    if (cell < 12) cell = 12;
    return { cell: cell, clueW: Math.ceil(cell * 0.6 * mR) + 6, clueH: Math.ceil(cell * 0.62 * mC) + 6 };
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    rowEls = []; colEls = []; cellEls = [];
    var m = computeCell(), cell = m.cell;
    var fs = Math.max(9, Math.round(cell * 0.42));
    gridEl.style.gridTemplateColumns = m.clueW + 'px repeat(' + size + ',' + cell + 'px)';
    gridEl.style.gridTemplateRows = m.clueH + 'px repeat(' + size + ',' + cell + 'px)';
    gridEl.appendChild(document.createElement('div')); // corner
    var r, c, d;
    for (c = 0; c < size; c++) {
      d = document.createElement('div');
      d.textContent = colClues[c].join('\n');
      d.style.cssText = 'display:flex;flex-direction:column;justify-content:flex-end;align-items:center;white-space:pre;line-height:1.08;font-size:' + fs + 'px;font-weight:600;color:' + C.text + ';padding-bottom:2px;';
      gridEl.appendChild(d);
      colEls.push(d);
    }
    for (r = 0; r < size; r++) {
      d = document.createElement('div');
      d.textContent = rowClues[r].join(' ');
      d.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;font-size:' + fs + 'px;font-weight:600;color:' + C.text + ';padding-right:4px;';
      gridEl.appendChild(d);
      rowEls.push(d);
      for (c = 0; c < size; c++) {
        var e = document.createElement('div');
        e.setAttribute('data-i', r * size + c);
        e.style.cssText = 'border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-size:' + Math.round(cell * 0.62) + 'px;font-weight:700;color:' + C.muted + ';background:' + bgFor(r, c) + ';' + (api.lowEnd ? '' : 'transition:background .1s;');
        gridEl.appendChild(e);
        cellEls.push(e);
      }
    }
    paintAll();
    updateClueStyles();
  }

  function paint(i) {
    var e = cellEls[i];
    if (!e) return;
    var v = state[i];
    if (v === 1) { e.style.background = C.text; e.textContent = ''; }
    else if (v === 2) { e.style.background = bgFor((i / size) | 0, i % size); e.textContent = '✕'; }
    else { e.style.background = bgFor((i / size) | 0, i % size); e.textContent = ''; }
  }
  function paintAll() { for (var i = 0; i < size * size; i++) paint(i); }

  function updateClueStyles() {
    var i;
    for (i = 0; i < size; i++) {
      var rd = rowFilled(i) === rowOnes(i);
      rowEls[i].style.color = rd ? C.muted : C.text;
      rowEls[i].style.opacity = rd ? '.45' : '1';
      var cd = colFilled(i) === colOnes(i);
      colEls[i].style.color = cd ? C.muted : C.text;
      colEls[i].style.opacity = cd ? '.45' : '1';
    }
  }

  function updateHud() {
    progEl.textContent = '🖼 ' + (pidx + 1) + '/' + TOTAL_P;
    var h = '', i;
    for (i = 0; i < 3; i++) h += i < lives ? '❤️' : '🖤';
    livesEl.textContent = h;
  }

  function buildPuzzle() {
    var pat = session[pidx];
    sol = pat[1];
    size = Math.round(Math.sqrt(sol.length));
    state = [];
    onesTotal = 0; filledCount = 0; lives = 3;
    var i;
    for (i = 0; i < size * size; i++) {
      state.push(0);
      if (sol.charAt(i) === '1') onesTotal++;
    }
    rowClues = []; colClues = [];
    for (i = 0; i < size; i++) {
      (function (k) {
        rowClues.push(lineRuns(function (c) { return sol.charAt(k * size + c) === '1'; }));
        colClues.push(lineRuns(function (r) { return sol.charAt(r * size + k) === '1'; }));
      })(i);
    }
    setMode('fill');
    renderGrid();
    updateHud();
  }

  /* ---- play ---- */
  function mistake(i) {
    lives--;
    api.haptic('error');
    updateHud();
    state[i] = 2;
    var e = cellEls[i];
    e.style.background = C.bad;
    e.textContent = '✕';
    later(function () { paint(i); }, 380);
    if (lives <= 0) {
      over = true;
      later(function () { api.gameOver(total, { win: false }); }, 700);
    }
  }

  function solvePuzzle() {
    busy = true;
    var pts = 200 + lives * 50;
    total += pts;
    api.score(total);
    api.haptic('success');
    var col = blend(C.accent, C.good, pidx / (TOTAL_P - 1));
    var i;
    for (i = 0; i < size * size; i++) {
      (function (k) {
        var doIt = function () {
          var e = cellEls[k];
          if (sol.charAt(k) === '1') { e.style.background = col; e.style.borderRadius = '1px'; e.textContent = ''; }
          else { e.textContent = ''; }
        };
        if (api.lowEnd) doIt();
        else later(doIt, (((k / size) | 0) + (k % size)) * 22);
      })(i);
    }
    toast.textContent = session[pidx][0] + ' +' + pts;
    toast.style.opacity = '1';
    later(function () {
      toast.style.opacity = '0';
      pidx++;
      if (pidx >= TOTAL_P) {
        over = true;
        api.gameOver(total, { win: true });
      } else {
        busy = false;
        buildPuzzle();
      }
    }, 1600);
  }

  function onTap(ev) {
    if (paused || busy || over) return;
    var t = ev.target;
    var is = t && t.getAttribute ? t.getAttribute('data-i') : null;
    if (is === null || is === undefined) return;
    var i = +is, st = state[i];
    if (st === 1) return;
    if (mode === 'fill') {
      if (st === 2) { state[i] = 0; paint(i); return; }
      if (sol.charAt(i) === '1') {
        state[i] = 1;
        paint(i);
        filledCount++;
        api.haptic('light');
        updateClueStyles();
        if (filledCount === onesTotal) solvePuzzle();
      } else {
        mistake(i);
      }
    } else {
      state[i] = st === 2 ? 0 : 2;
      paint(i);
    }
  }
  gridEl.addEventListener('click', onTap);

  function onResize() { if (!over) renderGrid(); }
  window.addEventListener('resize', onResize);

  api.score(0);
  buildPuzzle();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      window.removeEventListener('resize', onResize);
      gridEl.removeEventListener('click', onTap);
      modeBtn.removeEventListener('click', onModeClick);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
