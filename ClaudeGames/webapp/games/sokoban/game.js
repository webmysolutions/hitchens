/* Sokoban — 15 handcrafted levels, canvas board, swipe/arrows, full undo.
   Every level solver-verified; solutions embedded below (see SOLS). */
(function () {
'use strict';
MG.register('sokoban', function (container, api) {
  var C = api.colors;

  /* SOKOBAN_DATA_START */
  var LEVELS=[["#######","#     #","# @$. #","#     #","#######"],["#######","#  .  #","#  $  #","# @$. #","#     #","#######"],["######","#    #","# @$ #","# #$.#","#  . #","######"],["########","#      #","# $$$  #","# ...  #","#  @   #","########"],["#######","#   ###","# $ ###","#    .#","# @$ .#","#   ###","#######"],["######","#    #","# #@ #","# $* #","# .* #","#    #","######"],["#######","#.   .#","# $#$ #","#  @  #","#######"],["#########","###   ###","### $ ###","#  $@$  #","#  . .  #","###.#####","#########"],["########","#   #  #","# $ # .#","# $   .#","#@  #  #","########"],["########","#  ..  #","# $..$ #","#  $$  #","#  @   #","########"],["#######","#     #","#.$.$ #","# $@  #","#.$   #","#.  ###","#######"],["#########","#   #   #","# $ $ $ #","#  ...  #","#   @   #","#########"],["#########","#   #   #","# $ . $ #","#  .#.  #","# $ . $ #","#   @   #","#########"],["########","#      #","# ###  #","# #  $ #","# # @$ #","# #    #","#..  ###","########"],["#########","#  #    #","# $# $  #","#  #  # #","# .#$.# #","#  . @  #","#########"]];
  var SOLS=["r","ru","rurdld","ulluurdurdurd","uluurdldrrrlldrr","rddlruulduullddr","ludrrruulllddrrudlluurr","luurdrdlulddllurdrruuld","uurldrrrrdrulllluurdldrrr","luulurdddrrruuruldddlludru","ulurrrdlddllruruullddldurrdl","uluuldrdrrulrurdlddllllurrluurdrrrrdl","uluuuldrrrurrdlldddlllluurldrrdrrrurul","drrulruuldldurrdllulddurrdldllrruuldrdl","llluuluurdldddrrrruuluurdrrdddllllluluurdlddrrrrrruuulldlduurrrdddlll"];
  /* SOKOBAN_DATA_END */

  var N = LEVELS.length;
  var level = 0, total = 0;
  var W = 0, H = 0, walls, targets, boxes, player, moves, hist, done = false;
  var paused = false, timer = 0;

  var st = api.load();
  if (st && st.level > 0 && st.level < N) { level = st.level | 0; total = Math.max(0, st.total | 0); }

  var cv = api.createCanvas();
  var g = cv.g;
  var cell = 24, ox = 0, oy = 0;

  /* bottom buttons */
  var bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:10px;';
  function mkBtn(label, title) {
    var b = document.createElement('button');
    b.className = 'mg-btn';
    b.textContent = label;
    b.title = title;
    b.style.cssText = 'min-width:86px;padding:10px 14px;font-size:18px;border-radius:12px;border:1px solid ' + C.panel2 + ';background:' + C.panel + ';color:' + C.text + ';';
    bar.appendChild(b);
    return b;
  }
  var undoBtn = mkBtn('↩ ' + (api.lang === 'ru' ? 'Отмена' : 'Undo'), 'undo');
  var restBtn = mkBtn('🔄 ' + (api.lang === 'ru' ? 'Заново' : 'Retry'), 'restart');
  container.appendChild(bar);

  function loadLevel() {
    var rows = LEVELS[level];
    H = rows.length; W = 0;
    var y, x;
    for (y = 0; y < H; y++) W = Math.max(W, rows[y].length);
    walls = {}; targets = {}; boxes = [];
    for (y = 0; y < H; y++) {
      for (x = 0; x < rows[y].length; x++) {
        var ch = rows[y][x], p = y * W + x;
        if (ch === '#') walls[p] = 1;
        if (ch === '.' || ch === '*' || ch === '+') targets[p] = 1;
        if (ch === '$' || ch === '*') boxes.push(p);
        if (ch === '@' || ch === '+') player = p;
      }
    }
    moves = 0; hist = []; done = false;
    layout();
    draw();
  }

  function layout() {
    var availH = cv.H - 130;
    cell = Math.floor(Math.min((cv.W - 20) / W, availH / H));
    cell = Math.max(12, Math.min(56, cell));
    ox = Math.floor((cv.W - cell * W) / 2);
    oy = Math.floor((cv.H - 70 - cell * H) / 2) + 44;
  }
  cv.onResize = function () { layout(); draw(); };

  function boxAt(p) {
    for (var i = 0; i < boxes.length; i++) if (boxes[i] === p) return i;
    return -1;
  }
  function solvedNow() {
    for (var i = 0; i < boxes.length; i++) if (!targets[boxes[i]]) return false;
    return true;
  }

  var DIRS = { left: -1, right: 1, up: 0, down: 0 };
  function move(dir) {
    if (done || paused) return;
    var step = dir === 'left' ? -1 : dir === 'right' ? 1 : dir === 'up' ? -W : W;
    var n = player + step;
    if (walls[n]) return;
    var bi = boxAt(n);
    if (bi >= 0) {
      var n2 = n + step;
      if (walls[n2] || boxAt(n2) >= 0) return;
      hist.push({ p: player, b: bi, f: n });
      boxes[bi] = n2;
      api.haptic('light');
    } else {
      hist.push({ p: player, b: -1, f: 0 });
    }
    player = n;
    moves++;
    draw();
    if (solvedNow()) onSolved();
  }

  function undo() {
    if (done || paused || !hist.length) return;
    var h = hist.pop();
    if (h.b >= 0) boxes[h.b] = h.f;
    player = h.p;
    moves = Math.max(0, moves - 1);
    draw();
  }

  function onSolved() {
    done = true;
    var pts = 100 + Math.max(0, 100 - moves);
    total += pts;
    api.score(total);
    api.haptic('success');
    draw(pts);
    if (level >= N - 1) {
      api.save({ level: 0, total: 0 });
      timer = setTimeout(function () { api.gameOver(total, { win: true }); }, 900);
    } else {
      api.save({ level: level + 1, total: total });
      timer = setTimeout(function () { level++; loadLevel(); }, 900);
    }
  }

  function draw(banner) {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    /* HUD */
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.font = 'bold 15px sans-serif';
    g.fillStyle = C.text;
    g.fillText(api.t('level') + ' ' + (level + 1) + '/' + N, 14, 24);
    g.textAlign = 'right';
    g.fillStyle = C.muted;
    g.fillText(api.t('moves') + ': ' + moves, cv.W - 14, 24);
    /* board */
    g.textAlign = 'center';
    var em = Math.floor(cell * 0.78);
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var p = y * W + x;
        var px = ox + x * cell, py = oy + y * cell;
        if (walls[p]) {
          g.fillStyle = C.panel2;
          g.fillRect(px + 1, py + 1, cell - 2, cell - 2);
          continue;
        }
        g.fillStyle = C.panel;
        g.fillRect(px, py, cell, cell);
        if (targets[p]) {
          g.strokeStyle = C.accent;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(px + cell / 2, py + cell / 2, cell * 0.22, 0, 6.2832);
          g.stroke();
        }
      }
    }
    g.font = em + 'px sans-serif';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var bx = ox + (b % W) * cell, by = oy + ((b / W) | 0) * cell;
      if (targets[b]) {
        g.fillStyle = C.good;
        g.globalAlpha = 0.25;
        g.fillRect(bx + 1, by + 1, cell - 2, cell - 2);
        g.globalAlpha = 1;
      }
      g.fillText('📦', bx + cell / 2, by + cell / 2 + 1);
    }
    g.fillText('🙂', ox + (player % W) * cell + cell / 2, oy + ((player / W) | 0) * cell + cell / 2 + 1);
    if (banner) {
      g.fillStyle = C.good;
      g.font = 'bold 20px sans-serif';
      g.fillText('+' + banner + ' ✨', cv.W / 2, oy + H * cell + 26);
    }
  }

  /* input */
  var offSwipe = api.swipe(container, function (d) {
    if (d === 'tap') return;
    move(d);
  });
  function onKey(e) {
    var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
    else if (e.key === 'u' || e.key === 'z' || e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'r') { e.preventDefault(); loadLevel(); }
  }
  window.addEventListener('keydown', onKey);
  function onUndo(e) { e.stopPropagation(); undo(); }
  function onRest(e) { e.stopPropagation(); if (!done) loadLevel(); }
  undoBtn.addEventListener('click', onUndo);
  restBtn.addEventListener('click', onRest);

  api.score(total);
  loadLevel();

  return {
    destroy: function () {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
      undoBtn.removeEventListener('click', onUndo);
      restBtn.removeEventListener('click', onRest);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
