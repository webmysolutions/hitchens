/* Tic-tac-toe vs AI — best of 5 rounds. MG game contract. */
(function () {
'use strict';
MG.register('tictactoe', function (container, api) {
  var C = api.colors;
  var RU = api.lang === 'ru';
  var HU = 1, AI = 2, ROUNDS = 5;
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  var board, round, total, wins, losses, roundOver, myTurn, aiMoved, ended;
  var timers = [], queue = [], paused = false;

  // setTimeout wrapper: tracked for destroy, defers callbacks while paused
  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
      if (paused) { queue.push(fn); return; }
      fn();
    }, ms);
    timers.push(id);
  }

  /* ---------- UI ---------- */
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;padding:12px;box-sizing:border-box;';

  var roundEl = document.createElement('div');
  roundEl.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:6px;color:' + C.muted;

  var statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:17px;font-weight:700;height:24px;margin-bottom:14px;color:' + C.text;

  var gridWrap = document.createElement('div');
  gridWrap.style.cssText = 'position:relative;width:min(88vw,52vh,340px);';

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;';

  var cells = [];
  for (var ci = 0; ci < 9; ci++) (function (i) {
    var c = document.createElement('div');
    c.style.cssText = 'aspect-ratio:1;display:flex;align-items:center;justify-content:center;' +
      'border-radius:14px;font-size:min(15vw,9vh,56px);user-select:none;-webkit-user-select:none;' +
      'cursor:pointer;background:' + C.panel;
    c.onclick = function () { tapCell(i); };
    cells.push(c);
    grid.appendChild(c);
  })(ci);

  var banner = document.createElement('div');
  banner.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;' +
    'justify-content:center;pointer-events:none;';
  var bannerIn = document.createElement('div');
  bannerIn.style.cssText = 'padding:12px 26px;border-radius:14px;font-size:24px;font-weight:800;' +
    'box-shadow:0 6px 24px rgba(0,0,0,.35);background:' + C.panel2 + ';color:' + C.text;
  banner.appendChild(bannerIn);

  gridWrap.appendChild(grid);
  gridWrap.appendChild(banner);
  root.appendChild(roundEl);
  root.appendChild(statusEl);
  root.appendChild(gridWrap);
  container.appendChild(root);

  /* ---------- rules / AI ---------- */
  function winLine(b) {
    for (var i = 0; i < 8; i++) {
      var L = LINES[i];
      if (b[L[0]] && b[L[0]] === b[L[1]] && b[L[1]] === b[L[2]]) return L;
    }
    return null;
  }
  function full(b) {
    for (var i = 0; i < 9; i++) if (!b[i]) return false;
    return true;
  }
  // minimax value from AI's perspective; faster wins / slower losses preferred
  function minimax(b, turn, depth) {
    var L = winLine(b);
    if (L) return b[L[0]] === AI ? 10 - depth : depth - 10;
    if (full(b)) return 0;
    var best = turn === AI ? -99 : 99;
    for (var i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = turn;
      var v = minimax(b, turn === AI ? HU : AI, depth + 1);
      b[i] = 0;
      if (turn === AI) { if (v > best) best = v; }
      else if (v < best) best = v;
    }
    return best;
  }
  // Perfect play, except: on the AI's FIRST move of a round it picks uniformly
  // among moves whose value is within the top 2 distinct minimax values.
  function aiPick() {
    var moves = [], vals = [], i;
    for (i = 0; i < 9; i++) {
      if (board[i]) continue;
      board[i] = AI;
      vals.push(minimax(board, HU, 1));
      board[i] = 0;
      moves.push(i);
    }
    var uniq = vals.slice().sort(function (a, b) { return b - a; })
      .filter(function (v, k, arr) { return k === 0 || v !== arr[k - 1]; });
    var thr = aiMoved ? uniq[0] : uniq[Math.min(1, uniq.length - 1)];
    var pool = [];
    for (i = 0; i < moves.length; i++) if (vals[i] >= thr) pool.push(moves[i]);
    return pool[(Math.random() * pool.length) | 0];
  }

  /* ---------- flow ---------- */
  function startRound() {
    board = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    roundOver = false;
    aiMoved = false;
    for (var i = 0; i < 9; i++) {
      cells[i].textContent = '';
      cells[i].style.background = C.panel;
    }
    banner.style.display = 'none';
    roundEl.textContent = (RU ? 'Раунд ' : 'Round ') + round + '/' + ROUNDS +
      '  ·  ❌ ' + wins + ' : ' + losses + ' ⭕';
    var playerStarts = (round % 2) === 1; // player starts round 1, alternates
    myTurn = playerStarts;
    statusEl.textContent = playerStarts ? api.t('your_turn') : api.t('thinking');
    if (!playerStarts) later(aiTurn, 500);
  }

  function tapCell(i) {
    if (ended || roundOver || !myTurn || board[i] || paused) return;
    board[i] = HU;
    cells[i].textContent = '❌';
    api.haptic('light');
    myTurn = false;
    if (checkEnd()) return;
    statusEl.textContent = api.t('thinking');
    later(aiTurn, 350 + Math.random() * 250 | 0);
  }

  function aiTurn() {
    if (ended || roundOver) return;
    var m = aiPick();
    aiMoved = true;
    board[m] = AI;
    cells[m].textContent = '⭕';
    if (checkEnd()) return;
    myTurn = true;
    statusEl.textContent = api.t('your_turn');
  }

  function checkEnd() {
    var L = winLine(board);
    if (!L && !full(board)) return false;
    roundOver = true;
    var res = L ? (board[L[0]] === HU ? 'win' : 'lose') : 'draw';
    if (L) {
      var col = res === 'win' ? C.good : C.bad;
      for (var i = 0; i < 3; i++) cells[L[i]].style.background = col;
    }
    if (res === 'win') { total += 100; wins++; api.haptic('success'); }
    else if (res === 'draw') { total += 40; }
    else { losses++; api.haptic('error'); }
    api.score(total);
    statusEl.textContent = '';
    bannerIn.textContent = api.t(res === 'win' ? 'you_win' : res === 'lose' ? 'you_lose' : 'draw');
    banner.style.display = 'flex';
    later(nextRound, 1500);
    return true;
  }

  function nextRound() {
    if (round >= ROUNDS) {
      ended = true;
      api.gameOver(total, { win: wins > losses, draw: wins === losses });
      return;
    }
    round++;
    startRound();
  }

  function onKey(e) {
    var n = parseInt(e.key, 10); // keys 1..9 = cells, row by row
    if (n >= 1 && n <= 9) tapCell(n - 1);
  }
  window.addEventListener('keydown', onKey);

  round = 1; total = 0; wins = 0; losses = 0; ended = false;
  api.score(0);
  startRound();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers.length = 0;
      queue.length = 0;
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () {
      paused = false;
      var q = queue;
      queue = [];
      for (var i = 0; i < q.length; i++) q[i]();
    }
  };
});
})();
