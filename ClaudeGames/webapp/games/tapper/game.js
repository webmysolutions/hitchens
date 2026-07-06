/* Speed Tap — 3 rounds of frantic tapping. MG game 'tapper'. */
(function () {
'use strict';
MG.register('tapper', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var LOW = api.lowEnd;
  var ROUNDS = 3, ROUND_MS = 10000, CNT_MS = 2400; // 3-2-1 countdown
  var MAX_TPS = 25; // anti-cheat: ignore multi-touch bursts

  var phase = 'idle'; // idle | count | play | done
  var round = 0, taps = 0, total = 0, best = 0;
  var remain = 0, cntRemain = 0, lastCnt = 0;
  var times = []; // trailing tap timestamps for tps + anti-cheat
  var paused = false, ended = false;

  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:12px;font-family:sans-serif;color:' + C.text + ';overflow:hidden;');
  container.appendChild(root);

  var glow = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 55%,' + C.accent + '33 0%,transparent 70%);');
  if (!LOW) root.appendChild(glow);

  var roundEl = el('div', 'font-size:14px;font-weight:bold;color:' + C.muted + ';margin-top:4px;', '');
  var timeEl = el('div', 'font-size:44px;font-weight:bold;font-variant-numeric:tabular-nums;', '10.0');
  root.appendChild(roundEl);
  root.appendChild(timeEl);

  var mid = el('div', 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;position:relative;');
  root.appendChild(mid);

  var big = el('div', 'position:absolute;left:0;right:0;top:0;text-align:center;font-size:64px;font-weight:bold;color:' + C.accent + ';opacity:0;pointer-events:none;will-change:transform,opacity;', '');
  mid.appendChild(big);

  var btn = el('div', 'position:relative;width:min(65vw,260px);height:min(65vw,260px);border-radius:50%;background:' + C.accent + ';color:' + C.bg + ';display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;transition:transform .06s;will-change:transform;overflow:hidden;box-shadow:0 6px 0 rgba(0,0,0,.25);');
  var cntEl = el('div', 'font-size:56px;font-weight:bold;line-height:1;', '');
  var lblEl = el('div', 'font-size:15px;font-weight:bold;margin-top:6px;text-align:center;padding:0 14px;', api.t('tap_to_start'));
  btn.appendChild(cntEl);
  btn.appendChild(lblEl);
  mid.appendChild(btn);

  // ripple pool
  var pool = [], pi = 0, k;
  if (!LOW) {
    for (k = 0; k < 6; k++) {
      var r = el('div', 'position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.45);pointer-events:none;opacity:0;will-change:transform,opacity;');
      btn.appendChild(r);
      pool.push(r);
    }
  }
  function ripple(x, y) {
    if (LOW) return;
    var f = pool[pi++ % pool.length];
    f.style.transition = 'none';
    f.style.transform = 'translate(' + (x - 20) + 'px,' + (y - 20) + 'px) scale(.3)';
    f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = 'transform .45s ease-out,opacity .45s linear';
    f.style.transform = 'translate(' + (x - 20) + 'px,' + (y - 20) + 'px) scale(5)';
    f.style.opacity = '0';
  }

  var meterO = el('div', 'width:min(65vw,260px);height:10px;border-radius:5px;background:' + C.panel + ';margin:16px 0 4px;overflow:hidden;');
  var meter = el('div', 'height:100%;width:0%;background:' + C.good + ';border-radius:5px;');
  meterO.appendChild(meter);
  var tpsEl = el('div', 'font-size:13px;color:' + C.muted + ';margin-bottom:8px;', '0.0 ' + (ru ? 'нажатий/с' : 'taps/s'));
  root.appendChild(meterO);
  root.appendChild(tpsEl);

  function setRoundLabel() {
    roundEl.textContent = (ru ? 'Раунд ' : 'Round ') + Math.min(ROUNDS, round + 1) + '/' + ROUNDS;
  }

  function popBig(txt) {
    big.textContent = txt;
    big.style.transition = 'none';
    big.style.transform = 'scale(1.6)';
    big.style.opacity = '1';
    void big.offsetWidth;
    big.style.transition = 'transform .3s,opacity .8s 1.6s';
    big.style.transform = 'scale(1)';
    big.style.opacity = '0';
  }

  // ---------- flow ----------
  function startCountdown() {
    phase = 'count';
    cntRemain = CNT_MS;
    lastCnt = 0;
    setRoundLabel();
    lblEl.textContent = ru ? 'Приготовься…' : 'Get ready…';
    cntEl.textContent = '3';
  }

  function startRound() {
    phase = 'play';
    taps = 0;
    times.length = 0;
    remain = ROUND_MS;
    cntEl.textContent = '0';
    lblEl.textContent = ru ? 'ЖМИ!!!' : 'TAP!!!';
    api.haptic('medium');
  }

  function endRound() {
    total += taps;
    if (taps > best) best = taps;
    round++;
    api.haptic('success');
    api.score(total * 2);
    if (round >= ROUNDS) {
      phase = 'done';
      ended = true;
      var score = total * 2 + best;
      big.style.opacity = '0';
      clearInterval(iv);
      api.gameOver(score);
    } else {
      popBig(taps + '!');
      startCountdown();
    }
  }

  function tap(x, y) {
    if (ended) return;
    if (phase === 'idle') { startCountdown(); return; }
    if (phase !== 'play' || paused) return;
    var now = Date.now();
    while (times.length && times[0] < now - 1000) times.shift();
    if (times.length >= MAX_TPS) return; // ignore impossible bursts
    times.push(now);
    taps++;
    cntEl.textContent = String(taps);
    api.score((total + taps) * 2);
    btn.style.transform = 'scale(.92)';
    clearTimeout(upT);
    upT = setTimeout(unpress, 70);
    ripple(x, y);
  }
  var upT = 0;
  function unpress() { btn.style.transform = 'scale(1)'; }

  function onDown(e) {
    var rc = btn.getBoundingClientRect();
    tap((e.clientX || 0) - rc.left, (e.clientY || 0) - rc.top);
    e.preventDefault();
  }
  btn.addEventListener('pointerdown', onDown);
  function onKey(e) {
    if (e.key === ' ') {
      var rc = btn.getBoundingClientRect();
      tap(rc.width / 2, rc.height / 2);
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);

  // ---------- loop ----------
  var lastT = Date.now();
  var iv = setInterval(function () {
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    if (paused || ended) return;
    if (phase === 'count') {
      cntRemain -= dt;
      var n = Math.max(1, Math.ceil(cntRemain / 800));
      if (n !== lastCnt) {
        lastCnt = n;
        cntEl.textContent = String(n);
        if (!LOW) {
          cntEl.style.transition = 'none';
          cntEl.style.transform = 'scale(1.5)';
          void cntEl.offsetWidth;
          cntEl.style.transition = 'transform .3s';
          cntEl.style.transform = 'scale(1)';
        }
        api.haptic('light');
      }
      timeEl.textContent = '10.0';
      if (cntRemain <= 0) startRound();
    } else if (phase === 'play') {
      remain -= dt;
      timeEl.textContent = (Math.max(0, remain) / 1000).toFixed(1);
      var now2 = Date.now();
      while (times.length && times[0] < now2 - 1000) times.shift();
      var tps = times.length;
      meter.style.width = Math.min(100, tps / 12 * 100).toFixed(0) + '%';
      tpsEl.textContent = tps.toFixed(1) + ' ' + (ru ? 'нажатий/с' : 'taps/s');
      if (!LOW) glow.style.opacity = Math.min(1, tps / 12).toFixed(2);
      if (remain <= 0) endRound();
    }
  }, 100);

  api.score(0);
  setRoundLabel();

  return {
    destroy: function () {
      clearInterval(iv);
      clearTimeout(upT);
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
