/* Simon Says — repeat the growing sequence of lights. DOM + lazy WebAudio. */
(function () {
'use strict';
MG.register('simon', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var HUES = [0, 130, 48, 210]; // red, green, yellow, blue quadrants
  var FREQ = [220, 277.2, 329.6, 415.3];

  var seq = [], pos = 0, score = 0;
  var state = 'idle'; // idle | show | input | wait | over
  var paused = false;
  var timers = {}, tid = 0;
  var ac = null, acFailed = false;

  function dim(i) { return 'hsl(' + HUES[i] + ',62%,30%)'; }
  function lit(i) { return 'hsl(' + HUES[i] + ',90%,58%)'; }

  /* ---- pause-aware timeouts ---- */
  function later(fn, ms) {
    var id = ++tid;
    timers[id] = setTimeout(function () {
      delete timers[id];
      if (paused) { later(fn, 250); return; }
      fn();
    }, ms);
  }
  function clearTimers() {
    for (var k in timers) clearTimeout(timers[k]);
    timers = {};
  }

  /* ---- audio (lazy, optional) ---- */
  function initAudio() {
    if (ac || acFailed) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ac = AC ? new AC() : null;
      if (!ac) acFailed = true;
    } catch (e) { ac = null; acFailed = true; }
  }
  function beep(i, ms) {
    if (!ac) return;
    try {
      var t = ac.currentTime;
      var o = ac.createOscillator();
      var gn = ac.createGain();
      o.type = 'sine';
      o.frequency.value = FREQ[i];
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(gn);
      gn.connect(ac.destination);
      o.start(t);
      o.stop(t + ms / 1000 + 0.03);
    } catch (e) { /* no sound */ }
  }

  /* ---- DOM ---- */
  container.style.background = C.bg;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  var status = document.createElement('div');
  status.style.cssText = 'color:' + C.muted + ';font:600 16px sans-serif;margin-bottom:14px;min-height:22px;text-align:center;';
  var pad = document.createElement('div');
  pad.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;';
  var btns = [];
  var RAD = [['34% 12% 12% 12%', '12% 34% 12% 12%'], ['12% 12% 12% 34%', '12% 12% 34% 12%']];
  for (var i = 0; i < 4; i++) (function (i) {
    var b = document.createElement('div');
    b.style.cssText = 'background:' + dim(i) + ';border-radius:' + RAD[(i / 2) | 0][i % 2] +
      ';touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); press(i); });
    btns.push(b);
    pad.appendChild(b);
  })(i);
  wrap.appendChild(status);
  wrap.appendChild(pad);
  container.appendChild(wrap);

  function size() {
    var s = Math.max(160, Math.min(container.clientWidth - 24, container.clientHeight - 90, 440));
    pad.style.width = pad.style.height = s + 'px';
  }
  window.addEventListener('resize', size);
  size();

  function flash(i, ms) {
    btns[i].style.background = lit(i);
    beep(i, ms);
    later(function () { btns[i].style.background = dim(i); }, ms);
  }

  /* ---- game flow ---- */
  function stepMs() { return Math.max(260, 560 - seq.length * 20); }

  function playback() {
    state = 'show';
    status.textContent = (ru ? 'Смотри' : 'Watch') + ' · ' + seq.length;
    var ms = stepMs();
    function show(k) {
      if (k >= seq.length) {
        state = 'input';
        pos = 0;
        status.textContent = ru ? 'Повторяй' : 'Repeat';
        return;
      }
      flash(seq[k], Math.round(ms * 0.6));
      later(function () { show(k + 1); }, ms);
    }
    later(function () { show(0); }, 400);
  }

  function nextRound() {
    seq.push((Math.random() * 4) | 0);
    playback();
  }

  function start() {
    if (state !== 'idle') return;
    seq = [];
    score = 0;
    api.score(0);
    nextRound();
  }

  function press(i) {
    initAudio(); // user gesture — safe spot to create AudioContext
    if (paused) return;
    if (state === 'idle') { start(); return; }
    if (state !== 'input') return;
    flash(i, 200);
    if (i === seq[pos]) {
      pos++;
      if (pos === seq.length) {
        score += seq.length * 10;
        api.score(score);
        api.haptic('success');
        state = 'wait';
        status.textContent = '+' + seq.length * 10;
        later(nextRound, 750);
      }
      return;
    }
    // mistake
    state = 'over';
    api.haptic('error');
    flash(seq[pos], 500); // show what it should have been
    later(function () { api.gameOver(score); }, 550);
  }

  status.textContent = api.t('tap_to_start');
  function onDown() { initAudio(); if (state === 'idle') start(); }
  container.addEventListener('pointerdown', onDown);

  function onKey(e) {
    var n = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (n !== undefined) { press(n); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { initAudio(); if (state === 'idle') start(); }
  }
  window.addEventListener('keydown', onKey);

  return {
    destroy: function () {
      clearTimers();
      window.removeEventListener('resize', size);
      window.removeEventListener('keydown', onKey);
      container.removeEventListener('pointerdown', onDown);
      if (ac) { try { ac.close(); } catch (e) {} ac = null; }
    },
    pause: function () {
      paused = true;
      if (ac) { try { ac.suspend(); } catch (e) {} }
    },
    resume: function () {
      paused = false;
      if (ac) { try { ac.resume(); } catch (e) {} }
    }
  };
});
})();
