/* Whack-a-mole — DOM 3x3 grid, 60 s round. */
(function () {
'use strict';
MG.register('mole', function (container, api) {
  var C = api.colors;
  var ROUND_MS = 60000;
  var TICK = 100;
  var score = 0, timeLeft = ROUND_MS;
  var running = false, paused = false, over = false;
  var spawnIn = 500;
  var interval = 0;
  var holes = [];
  var maxActive = api.lowEnd ? 2 : 3;

  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;background:' + C.bg + ';color:' + C.text + ';';
  container.appendChild(root);

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;gap:24px;font:bold 18px sans-serif;margin-bottom:18px;';
  var scoreEl = document.createElement('div');
  var timeEl = document.createElement('div');
  timeEl.style.color = C.accent;
  head.appendChild(scoreEl); head.appendChild(timeEl);
  root.appendChild(head);

  function updHead() {
    scoreEl.textContent = api.t('score') + ': ' + score;
    timeEl.textContent = api.t('time') + ': ' + Math.max(0, Math.ceil(timeLeft / 1000));
  }

  var grid = document.createElement('div');
  var sz = Math.min(300, Math.floor(Math.min(container.clientWidth, container.clientHeight - 120) * 0.9));
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;' +
    'width:' + sz + 'px;height:' + sz + 'px;';
  root.appendChild(grid);

  function onHoleTap(h) {
    if (!running || paused || over || !h.kind || h.kind === 'hit') return;
    if (h.kind === 'mole') {
      score += 10;
      api.haptic('light');
      h.face.textContent = '✨';
    } else { // bomb
      score = Math.max(0, score - 30);
      api.haptic('error');
      h.face.textContent = '💥';
    }
    h.kind = 'hit';
    h.hideIn = 180;
    api.score(score);
    updHead();
  }

  for (var i = 0; i < 9; i++) {
    (function () {
      var el = document.createElement('div');
      el.style.cssText = 'background:' + C.panel + ';border-radius:50%;display:flex;' +
        'align-items:center;justify-content:center;overflow:hidden;' +
        'box-shadow:inset 0 4px 10px rgba(0,0,0,.35);cursor:pointer;user-select:none;' +
        '-webkit-user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;';
      var face = document.createElement('span');
      face.style.cssText = 'font-size:' + Math.floor(sz / 5) + 'px;line-height:1;' +
        'transform:translateY(110%);' + (api.lowEnd ? '' : 'transition:transform .09s ease-out;');
      el.appendChild(face);
      var h = { el: el, face: face, kind: null, hideIn: 0 };
      el.addEventListener('pointerdown', function (e) { e.preventDefault(); onHoleTap(h); });
      holes.push(h);
      grid.appendChild(el);
    })();
  }

  function hide(h) {
    h.kind = null;
    h.face.style.transform = 'translateY(110%)';
  }

  function spawn() {
    var active = 0, empty = [];
    for (var i = 0; i < holes.length; i++) {
      if (holes[i].kind) active++; else empty.push(holes[i]);
    }
    if (active >= maxActive || !empty.length) return;
    var h = empty[(Math.random() * empty.length) | 0];
    var p = 1 - timeLeft / ROUND_MS;         // 0 → 1 over the round
    var up = Math.max(550, 1250 - 700 * p);  // shrinking pop-up duration
    if (Math.random() < 0.16) {
      h.kind = 'bomb';
      h.face.textContent = '💣';
      h.hideIn = up + 250;
    } else {
      h.kind = 'mole';
      h.face.textContent = '🐹';
      h.hideIn = up;
    }
    h.face.style.transform = 'translateY(0)';
  }

  function tick() {
    if (!running || paused || over) return;
    timeLeft -= TICK;
    updHead();
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      if (h.kind) {
        h.hideIn -= TICK;
        if (h.hideIn <= 0) hide(h);
      }
    }
    spawnIn -= TICK;
    if (spawnIn <= 0) {
      spawn();
      var p = 1 - timeLeft / ROUND_MS;
      spawnIn = Math.max(350, 850 - 500 * p) + Math.random() * 300;
    }
    if (timeLeft <= 0) {
      over = true;
      running = false;
      for (var j = 0; j < holes.length; j++) hide(holes[j]);
      api.haptic('success');
      api.gameOver(score);
    }
  }

  // start overlay
  var overlay = document.createElement('div');
  overlay.className = 'mg-center';
  overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;' +
    'align-items:center;justify-content:center;background:rgba(0,0,0,.45);';
  var btn = document.createElement('button');
  btn.className = 'mg-btn';
  btn.textContent = '🐹 ' + (api.lang === 'ru' ? 'Начать' : 'Start');
  btn.style.cssText = 'font-size:20px;padding:12px 28px;background:' + C.accent +
    ';color:' + C.bg + ';border:0;border-radius:12px;';
  var hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.style.color = C.muted;
  hint.textContent = api.lang === 'ru' ? '🐹 +10   💣 −30' : '🐹 +10   💣 −30';
  overlay.appendChild(btn); overlay.appendChild(hint);
  root.appendChild(overlay);
  btn.addEventListener('click', function () {
    root.removeChild(overlay);
    running = true;
  });

  api.score(0);
  updHead();
  interval = setInterval(tick, TICK);

  return {
    destroy: function () { clearInterval(interval); },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
