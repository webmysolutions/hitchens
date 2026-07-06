/* Odd Color — spot the tile with a different shade. MG game 'colorblind'. */
(function () {
'use strict';
MG.register('colorblind', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var LOW = api.lowEnd;
  var TOTAL = 60000;

  var level = 1, score = 0, remain = TOTAL;
  var odd = -1, roundStart = 0;
  var started = false, ended = false, paused = false;

  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:12px;font-family:sans-serif;color:' + C.text + ';overflow:hidden;');
  container.appendChild(root);
  if (!LOW) {
    var styleTag = document.createElement('style');
    styleTag.textContent = '@keyframes cbshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}';
    container.appendChild(styleTag);
  }

  var head = el('div', 'display:flex;width:100%;max-width:420px;justify-content:space-between;align-items:baseline;margin-bottom:6px;');
  var lvlEl = el('div', 'font-size:16px;font-weight:bold;', api.t('level') + ' 1');
  var timeEl = el('div', 'font-size:22px;font-weight:bold;font-variant-numeric:tabular-nums;', '60');
  head.appendChild(lvlEl);
  head.appendChild(timeEl);
  root.appendChild(head);

  var barO = el('div', 'width:100%;max-width:420px;height:8px;border-radius:4px;background:' + C.panel + ';overflow:hidden;margin-bottom:12px;');
  var bar = el('div', 'height:100%;width:100%;background:' + C.accent + ';border-radius:4px;');
  barO.appendChild(bar);
  root.appendChild(barO);

  var gridWrap = el('div', 'flex:1;display:flex;align-items:center;justify-content:center;width:100%;');
  var grid = el('div', 'display:grid;width:min(92vw,52vh,420px);height:min(92vw,52vh,420px);');
  gridWrap.appendChild(grid);
  root.appendChild(gridWrap);

  var hint = el('div', 'font-size:13px;color:' + C.muted + ';margin:10px 0 4px;text-align:center;',
    ru ? 'Найди плитку другого оттенка!' : 'Find the tile with a different shade!');
  root.appendChild(hint);

  var overlay = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);cursor:pointer;z-index:5;');
  overlay.appendChild(el('div', 'font-size:20px;font-weight:bold;color:#fff;', api.t('tap_to_start')));
  root.appendChild(overlay);
  overlay.addEventListener('click', function () {
    if (started) return;
    started = true;
    overlay.style.display = 'none';
    lastT = Date.now();
    roundStart = Date.now();
  });

  // ---------- grid ----------
  function gridSize() {
    if (level < 3) return 2;
    if (level < 6) return 3;
    if (level < 10) return 4;
    if (level < 15) return 5;
    return 6;
  }
  function hsl(h, s, l) { return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }

  function build() {
    var size = gridSize();
    var n = size * size;
    odd = (Math.random() * n) | 0;
    var h = (Math.random() * 360) | 0;
    var s = 55 + Math.random() * 30;
    var l = 42 + Math.random() * 18;
    var delta = Math.max(5, 20 - level * 1.1); // shrinks, floor stays perceptible
    var l2 = l < 50 ? l + delta : l - delta;
    var base = hsl(h, s.toFixed(0), l.toFixed(1));
    var diff = hsl(h, s.toFixed(0), l2.toFixed(1));

    grid.textContent = '';
    grid.style.gridTemplateColumns = 'repeat(' + size + ',1fr)';
    grid.style.gap = size > 4 ? '4px' : '7px';
    for (var i = 0; i < n; i++) {
      var t = el('div', 'border-radius:' + (size > 4 ? 8 : 12) + 'px;cursor:pointer;-webkit-tap-highlight-color:transparent;background:' + (i === odd ? diff : base) + ';');
      t.dataset.i = i;
      grid.appendChild(t);
    }
    lvlEl.textContent = api.t('level') + ' ' + level;
    roundStart = Date.now();
  }

  grid.addEventListener('click', function (e) {
    if (!started || ended || paused) return;
    var t = e.target;
    if (t === grid || t.dataset.i == null) return;
    if ((t.dataset.i | 0) === odd) {
      var bonus = Math.max(0, 5 - Math.floor((Date.now() - roundStart) / 1000));
      score += 10 + bonus;
      api.score(score);
      api.haptic(level % 5 === 0 ? 'success' : 'light');
      level++;
      build();
    } else {
      score = Math.max(0, score - 5);
      api.score(score);
      api.haptic('error');
      if (!LOW) {
        grid.style.animation = 'none';
        void grid.offsetWidth;
        grid.style.animation = 'cbshake .25s';
      }
    }
  });

  // ---------- loop ----------
  var lastT = Date.now();
  var iv = setInterval(function () {
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    if (!started || ended || paused) return;
    remain -= dt;
    if (remain <= 0) {
      remain = 0;
      ended = true;
      clearInterval(iv);
      api.gameOver(score);
    }
    timeEl.textContent = String(Math.ceil(remain / 1000));
    bar.style.width = (remain / TOTAL * 100).toFixed(1) + '%';
    if (remain < 10000) bar.style.background = C.bad;
  }, 100);

  api.score(0);
  build();

  return {
    destroy: function () { clearInterval(iv); },
    pause: function () { paused = true; },
    resume: function () {
      paused = false;
      lastT = Date.now();
      roundStart = Date.now();
    }
  };
});
})();
