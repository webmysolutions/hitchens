/* Reaction test — 5 rounds, tap when the screen turns green. */
(function () {
'use strict';
MG.register('reaction', function (container, api) {
  var C = api.colors;
  var ROUNDS = 5;
  var state = 'idle'; // idle | wait | go | early | result | done
  var round = 0, score = 0, t0 = 0;
  var results = [];
  var timer = 0, pending = null; // pending = {fn, delay} for pause/resume

  var stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;background:' + C.panel + ';color:' + C.text +
    ';user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;' +
    'cursor:pointer;touch-action:manipulation;';
  container.appendChild(stage);

  var roundEl = document.createElement('div');
  roundEl.style.cssText = 'position:absolute;top:14px;left:0;right:0;text-align:center;' +
    'font:bold 15px sans-serif;color:' + C.muted + ';';
  var bigEl = document.createElement('div');
  bigEl.style.cssText = 'font:bold 28px sans-serif;text-align:center;padding:0 20px;';
  var subEl = document.createElement('div');
  subEl.className = 'mg-hint';
  subEl.style.cssText = 'font:15px sans-serif;color:' + C.muted + ';margin-top:10px;min-height:20px;';
  var listEl = document.createElement('div');
  listEl.style.cssText = 'position:absolute;bottom:20px;left:0;right:0;text-align:center;' +
    'font:14px monospace;color:' + C.muted + ';line-height:1.6;';
  stage.appendChild(roundEl); stage.appendChild(bigEl); stage.appendChild(subEl); stage.appendChild(listEl);

  var btn = document.createElement('button');
  btn.className = 'mg-btn';
  btn.textContent = '⚡ ' + (api.lang === 'ru' ? 'Начать' : 'Start');
  btn.style.cssText = 'font-size:20px;padding:12px 28px;margin-top:16px;background:' + C.accent +
    ';color:' + C.bg + ';border:0;border-radius:12px;cursor:pointer;';
  stage.appendChild(btn);

  function sched(fn, delay) {
    pending = { fn: fn, delay: delay };
    timer = setTimeout(function () { pending = null; fn(); }, delay);
  }

  function updList() {
    var s = '';
    for (var i = 0; i < results.length; i++) {
      s += (i + 1) + ': ' + results[i] + ' ' + api.t('ms') + '<br>';
    }
    listEl.innerHTML = s;
  }

  function updRound() {
    roundEl.textContent = (api.lang === 'ru' ? 'Раунд ' : 'Round ') +
      Math.min(round + 1, ROUNDS) + '/' + ROUNDS;
  }

  function startRound() {
    state = 'wait';
    updRound();
    stage.style.background = C.panel;
    bigEl.textContent = api.t('wait') + '…';
    subEl.textContent = '';
    sched(goGreen, 1500 + Math.random() * 2500);
  }

  function goGreen() {
    state = 'go';
    stage.style.background = C.good;
    bigEl.textContent = api.t('tap_now');
    t0 = performance.now();
  }

  function onTap(e) {
    if (e) e.preventDefault();
    if (state === 'wait') {
      clearTimeout(timer); pending = null;
      state = 'early';
      stage.style.background = C.bad;
      bigEl.textContent = api.t('too_early');
      subEl.textContent = '';
      api.haptic('error');
      sched(startRound, 1000); // retry same round
    } else if (state === 'go') {
      var ms = Math.max(1, Math.round(performance.now() - t0));
      var pts = Math.max(10, 400 - ms);
      results.push(ms);
      score += pts;
      round++;
      api.score(score);
      api.haptic(ms < 250 ? 'success' : 'light');
      state = 'result';
      stage.style.background = C.panel;
      bigEl.textContent = ms + ' ' + api.t('ms');
      subEl.textContent = '+' + pts;
      updList();
      if (round >= ROUNDS) {
        state = 'done';
        updRound();
        sched(function () { api.gameOver(score); }, 1400);
      } else {
        sched(startRound, 1100);
      }
    }
  }

  stage.addEventListener('pointerdown', function (e) {
    if (state === 'idle' || state === 'result' || state === 'early' || state === 'done') return;
    onTap(e);
  });
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state === 'wait' || state === 'go') onTap(null);
    }
  }
  window.addEventListener('keydown', onKey);

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    stage.removeChild(btn);
    startRound();
  });

  bigEl.textContent = '⚡';
  subEl.textContent = api.lang === 'ru' ? 'Жми, когда экран станет зелёным' :
    'Tap when the screen turns green';
  updRound();
  api.score(0);

  return {
    destroy: function () {
      clearTimeout(timer);
      pending = null;
      window.removeEventListener('keydown', onKey);
    },
    pause: function () {
      clearTimeout(timer);
      if (state === 'go') { // don't let a stale timestamp ruin the round
        pending = { fn: startRound, delay: 500 };
      }
    },
    resume: function () {
      if (pending) sched(pending.fn, pending.delay);
    }
  };
});
})();
