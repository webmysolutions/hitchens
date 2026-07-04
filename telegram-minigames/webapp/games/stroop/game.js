/* Color Words — Stroop test: does the ink match the word? MG game 'stroop'. */
(function () {
'use strict';
MG.register('stroop', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var LOW = api.lowEnd;
  var TOTAL = 45000;

  var INK = [
    { en: 'RED', ru: 'КРАСНЫЙ', c: '#ef4444' },
    { en: 'GREEN', ru: 'ЗЕЛЁНЫЙ', c: '#22c55e' },
    { en: 'BLUE', ru: 'СИНИЙ', c: '#3b82f6' },
    { en: 'YELLOW', ru: 'ЖЁЛТЫЙ', c: '#eab308' },
    { en: 'PURPLE', ru: 'ФИОЛЕТОВЫЙ', c: '#a855f7' },
    { en: 'ORANGE', ru: 'ОРАНЖЕВЫЙ', c: '#f97316' }
  ];

  var score = 0, streak = 0, cards = 0;
  var isMatch = false, cardLimit = 3000, cardRemain = 0;
  var remain = TOTAL;
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

  var head = el('div', 'display:flex;width:100%;max-width:420px;justify-content:space-between;align-items:baseline;margin-bottom:6px;');
  var streakEl = el('div', 'font-size:15px;font-weight:bold;color:' + C.accent + ';', '');
  var timeEl = el('div', 'font-size:22px;font-weight:bold;font-variant-numeric:tabular-nums;', '45');
  head.appendChild(streakEl);
  head.appendChild(timeEl);
  root.appendChild(head);

  var barO = el('div', 'width:100%;max-width:420px;height:8px;border-radius:4px;background:' + C.panel + ';overflow:hidden;margin-bottom:10px;');
  var bar = el('div', 'height:100%;width:100%;background:' + C.accent + ';border-radius:4px;');
  barO.appendChild(bar);
  root.appendChild(barO);

  var mid = el('div', 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;');
  root.appendChild(mid);

  var card = el('div', 'width:min(88vw,380px);min-height:150px;border-radius:16px;background:' + C.panel + ';display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;border:3px solid transparent;will-change:transform;');
  var wordEl = el('div', 'font-size:38px;font-weight:bold;text-align:center;line-height:1.15;word-break:break-word;', '');
  card.appendChild(wordEl);
  mid.appendChild(card);

  // per-card timer
  var cbarO = el('div', 'width:min(88vw,380px);height:6px;border-radius:3px;background:' + C.panel + ';overflow:hidden;margin-top:10px;');
  var cbar = el('div', 'height:100%;width:100%;background:' + C.good + ';border-radius:3px;');
  cbarO.appendChild(cbar);
  mid.appendChild(cbarO);

  mid.appendChild(el('div', 'font-size:13px;color:' + C.muted + ';margin-top:12px;text-align:center;',
    ru ? 'Цвет букв совпадает со словом?' : 'Does the ink color match the word?'));

  var btns = el('div', 'display:flex;gap:10px;width:100%;max-width:420px;margin-top:8px;');
  var noB = el('button', 'flex:1;border:0;border-radius:14px;padding:18px 8px;font-size:18px;font-weight:bold;cursor:pointer;-webkit-tap-highlight-color:transparent;background:' + C.bad + ';color:#fff;', '✖ ' + (ru ? 'Нет' : 'No'));
  var yesB = el('button', 'flex:1;border:0;border-radius:14px;padding:18px 8px;font-size:18px;font-weight:bold;cursor:pointer;-webkit-tap-highlight-color:transparent;background:' + C.good + ';color:#fff;', '✔ ' + (ru ? 'Совпадает' : 'Match'));
  btns.appendChild(noB);
  btns.appendChild(yesB);
  root.appendChild(btns);

  var overlay = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);cursor:pointer;z-index:5;');
  overlay.appendChild(el('div', 'font-size:20px;font-weight:bold;color:#fff;', api.t('tap_to_start')));
  root.appendChild(overlay);
  overlay.addEventListener('click', function () {
    if (started) return;
    started = true;
    overlay.style.display = 'none';
    lastT = Date.now();
    newCard();
  });

  // ---------- game ----------
  function newCard() {
    var w = (Math.random() * INK.length) | 0;
    var match = Math.random() < 0.5;
    var ink = w;
    if (!match) {
      ink = (Math.random() * (INK.length - 1)) | 0;
      if (ink >= w) ink++;
    }
    isMatch = match;
    wordEl.textContent = ru ? INK[w].ru : INK[w].en;
    wordEl.style.color = INK[ink].c;
    cardLimit = Math.max(1200, 3000 - cards * 60);
    cardRemain = cardLimit;
    if (!LOW) { // flip-in
      card.style.transition = 'none';
      card.style.transform = 'rotateY(88deg)';
      void card.offsetWidth;
      card.style.transition = 'transform .18s ease-out';
      card.style.transform = 'rotateY(0deg)';
    }
  }

  function answer(yes) {
    if (!started || ended || paused) return;
    if (yes === isMatch) {
      streak++;
      score += 10 + Math.min(10, streak); // streak bonus
      api.haptic(streak > 0 && streak % 5 === 0 ? 'success' : 'light');
      card.style.borderColor = C.good;
    } else {
      streak = 0;
      score = Math.max(0, score - 5);
      api.haptic('error');
      card.style.borderColor = C.bad;
    }
    api.score(score);
    streakEl.textContent = streak >= 2 ? '🔥 ×' + streak : '';
    cards++;
    newCard();
  }

  yesB.addEventListener('click', function () { answer(true); });
  noB.addEventListener('click', function () { answer(false); });
  var offSwipe = api.swipe(mid, function (d) {
    if (d === 'right') answer(true);
    else if (d === 'left') answer(false);
  });
  function onKey(e) {
    if (e.key === 'ArrowRight') { answer(true); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { answer(false); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  // ---------- loop ----------
  var lastT = Date.now();
  var iv = setInterval(function () {
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    if (!started || ended || paused) return;
    remain -= dt;
    cardRemain -= dt;
    if (cardRemain <= 0) { // timeout counts as wrong
      streak = 0;
      score = Math.max(0, score - 5);
      api.score(score);
      api.haptic('error');
      streakEl.textContent = '';
      card.style.borderColor = C.bad;
      cards++;
      newCard();
    }
    if (remain <= 0) {
      remain = 0;
      ended = true;
      clearInterval(iv);
      api.gameOver(score);
      return;
    }
    timeEl.textContent = String(Math.ceil(remain / 1000));
    bar.style.width = (remain / TOTAL * 100).toFixed(1) + '%';
    if (remain < 10000) bar.style.background = C.bad;
    cbar.style.width = Math.max(0, cardRemain / cardLimit * 100).toFixed(1) + '%';
    cbar.style.background = cardRemain < cardLimit * 0.35 ? C.bad : C.good;
  }, 50);

  api.score(0);

  return {
    destroy: function () {
      clearInterval(iv);
      window.removeEventListener('keydown', onKey);
      offSwipe();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
