/* Math Quiz — 60 seconds of fast arithmetic. DOM. */
(function () {
'use strict';
MG.register('mathquiz', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var TOTAL = 60000;

  var timeLeft = TOTAL, score = 0, streak = 0, qn = 0, answer = 0;
  var running = false, paused = false, locked = false;
  var interval = 0, timers = [];

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function rnd(n) { return (Math.random() * n) | 0; }

  /* ---- DOM ---- */
  container.style.background = C.bg;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;max-width:480px;margin:0 auto;' +
    'display:flex;flex-direction:column;padding:16px;box-sizing:border-box;font-family:sans-serif;';

  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;align-items:center;min-height:26px;margin-bottom:6px;';
  var timeTxt = document.createElement('div');
  timeTxt.style.cssText = 'color:' + C.muted + ';font-weight:600;font-size:15px;';
  var flame = document.createElement('div');
  flame.style.cssText = 'color:' + C.accent + ';font-weight:700;font-size:16px;';
  hud.appendChild(timeTxt);
  hud.appendChild(flame);

  var barOuter = document.createElement('div');
  barOuter.style.cssText = 'height:10px;border-radius:6px;background:' + C.panel + ';overflow:hidden;';
  var bar = document.createElement('div');
  bar.style.cssText = 'height:100%;width:100%;background:' + C.accent + ';border-radius:6px;' +
    (api.lowEnd ? '' : 'transition:width .1s linear;');
  barOuter.appendChild(bar);

  var qDiv = document.createElement('div');
  qDiv.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;text-align:center;' +
    'color:' + C.text + ';font-weight:700;font-size:40px;';

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-bottom:8px;';
  var btns = [];
  var btnBase = 'padding:20px 0;border-radius:14px;text-align:center;font-weight:700;font-size:22px;' +
    'background:' + C.panel + ';color:' + C.text + ';border:1px solid ' + C.panel2 + ';' +
    'touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;';
  for (var i = 0; i < 4; i++) (function (i) {
    var b = document.createElement('div');
    b.style.cssText = btnBase;
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); pick(i); });
    btns.push(b);
    grid.appendChild(b);
  })(i);

  wrap.appendChild(hud);
  wrap.appendChild(barOuter);
  wrap.appendChild(qDiv);
  wrap.appendChild(grid);
  container.appendChild(wrap);

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,.45);color:' + C.text + ';font:700 20px sans-serif;';
  overlay.textContent = api.t('tap_to_start');
  container.appendChild(overlay);

  /* ---- questions ---- */
  function genQ() {
    var a, b, c, txt, ans, f;
    if (qn < 5) {
      a = 2 + rnd(14 + qn * 3);
      b = 1 + rnd(9 + qn * 2);
      if (Math.random() < 0.5) { txt = a + ' + ' + b; ans = a + b; }
      else {
        if (b > a) { c = a; a = b; b = c; }
        txt = a + ' − ' + b; ans = a - b;
      }
    } else if (qn < 12) {
      if (Math.random() < 0.5) {
        a = 2 + rnd(8); b = 2 + rnd(8);
        txt = a + ' × ' + b; ans = a * b;
      } else {
        b = 2 + rnd(8); ans = 2 + rnd(8); a = b * ans;
        txt = a + ' ÷ ' + b;
      }
    } else {
      f = rnd(3);
      if (f === 0) {
        a = 1 + rnd(15); b = 2 + rnd(7); c = 2 + rnd(7);
        txt = a + ' + ' + b + ' × ' + c; ans = a + b * c;
      } else if (f === 1) {
        a = 2 + rnd(7); b = 2 + rnd(7); c = 1 + rnd(Math.min(20, a * b));
        txt = a + ' × ' + b + ' − ' + c; ans = a * b - c;
      } else {
        a = 5 + rnd(20); b = 1 + rnd(12); c = 1 + rnd(a + b);
        txt = a + ' + ' + b + ' − ' + c; ans = a + b - c;
      }
    }
    qn++;
    answer = ans;
    // options: 1 correct + 3 close distractors
    var opts = [ans], guard = 0, d;
    while (opts.length < 4 && guard++ < 80) {
      d = ans + (Math.random() < 0.5 ? -1 : 1) * (1 + rnd(3));
      if (Math.random() < 0.2) d = ans + (Math.random() < 0.5 ? -10 : 10);
      if (d < 0 || opts.indexOf(d) >= 0) continue;
      opts.push(d);
    }
    d = ans + 1;
    while (opts.length < 4) {
      if (opts.indexOf(d) < 0) opts.push(d);
      d++;
    }
    // shuffle
    for (var k = opts.length - 1; k > 0; k--) {
      var j = rnd(k + 1), tmp = opts[k];
      opts[k] = opts[j]; opts[j] = tmp;
    }
    qDiv.textContent = txt + ' = ?';
    for (var m = 0; m < 4; m++) {
      btns[m].textContent = opts[m];
      btns[m].style.background = C.panel;
      btns[m].style.color = C.text;
    }
  }

  function updateHud() {
    flame.textContent = streak >= 2 ? '🔥x' + streak : '';
    timeTxt.textContent = Math.max(0, Math.ceil(timeLeft / 1000)) + (ru ? ' с' : ' s');
  }

  function pick(i) {
    if (!running || locked || paused) return;
    locked = true;
    var val = parseInt(btns[i].textContent, 10);
    if (val === answer) {
      streak++;
      score += streak >= 3 ? 15 : 10;
      api.score(score);
      api.haptic('light');
      btns[i].style.background = C.good;
      btns[i].style.color = C.bg;
      later(next, 220);
    } else {
      streak = 0;
      score = Math.max(0, score - 5);
      api.score(score);
      api.haptic('error');
      btns[i].style.background = C.bad;
      btns[i].style.color = C.bg;
      for (var k = 0; k < 4; k++) {
        if (parseInt(btns[k].textContent, 10) === answer) {
          btns[k].style.background = C.good;
          btns[k].style.color = C.bg;
        }
      }
      later(next, 500);
    }
    updateHud();
  }
  function next() {
    if (!running) return;
    genQ();
    locked = false;
  }

  /* ---- timer ---- */
  function tick() {
    if (paused || !running) return;
    timeLeft -= 100;
    bar.style.width = Math.max(0, timeLeft / TOTAL * 100) + '%';
    if (timeLeft <= 10000) bar.style.background = C.bad;
    updateHud();
    if (timeLeft <= 0) {
      running = false;
      clearInterval(interval);
      api.gameOver(score);
    }
  }

  function start() {
    if (running) return;
    overlay.style.display = 'none';
    running = true;
    api.score(0);
    updateHud();
    genQ();
    locked = false;
    interval = setInterval(tick, 100);
  }
  overlay.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });

  function onKey(e) {
    if (!running && (e.key === ' ' || e.key === 'Enter')) { start(); e.preventDefault(); return; }
    var n = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (n !== undefined) { pick(n); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);
  updateHud();

  return {
    destroy: function () {
      clearInterval(interval);
      for (var k = 0; k < timers.length; k++) clearTimeout(timers[k]);
      timers.length = 0;
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
