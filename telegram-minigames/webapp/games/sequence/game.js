/* Number Memory — remember and type back growing numbers. MG game 'sequence'. */
(function () {
'use strict';
MG.register('sequence', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var LOW = api.lowEnd;

  var len = 3, hearts = 3, score = 0;
  var num = '', entry = '';
  var phase = 'pre'; // pre | show | input | reveal | done
  var phaseRemain = 800, showTotal = 0, showEl = 0;
  var paused = false, ended = false;
  var spans = [];

  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:12px;font-family:sans-serif;color:' + C.text + ';overflow:hidden;');
  container.appendChild(root);
  var styleTag = document.createElement('style');
  styleTag.textContent = '.sqk:active{transform:scale(.92);filter:brightness(1.15)}';
  container.appendChild(styleTag);

  var head = el('div', 'display:flex;width:100%;max-width:400px;justify-content:space-between;align-items:baseline;margin-bottom:4px;');
  var lvlEl = el('div', 'font-size:15px;font-weight:bold;', '');
  var heartsEl = el('div', 'font-size:18px;letter-spacing:2px;', '');
  head.appendChild(lvlEl);
  head.appendChild(heartsEl);
  root.appendChild(head);

  var barO = el('div', 'width:100%;max-width:400px;height:8px;border-radius:4px;background:' + C.panel + ';overflow:hidden;margin-bottom:8px;');
  var bar = el('div', 'height:100%;width:0%;background:' + C.accent + ';border-radius:4px;');
  barO.appendChild(bar);
  root.appendChild(barO);

  var mid = el('div', 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;min-height:0;');
  root.appendChild(mid);

  var msgEl = el('div', 'font-size:15px;font-weight:bold;color:' + C.muted + ';margin-bottom:10px;min-height:20px;text-align:center;', '');
  mid.appendChild(msgEl);

  var disp = el('div', 'display:flex;flex-wrap:wrap;justify-content:center;gap:2px;min-height:64px;align-items:center;max-width:96vw;', '');
  mid.appendChild(disp);

  // keypad
  var pad = el('div', 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:min(88vw,320px);margin:10px 0 6px;visibility:hidden;');
  root.appendChild(pad);
  var keyCss = 'border:0;border-radius:12px;padding:0;height:56px;font-size:24px;font-weight:bold;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;transition:transform .06s;background:' + C.panel + ';color:' + C.text + ';';
  var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
  var okBtn = null;
  KEYS.forEach(function (k2) {
    var b = el('button', keyCss, k2);
    b.className = 'sqk';
    if (k2 === '✓') { b.style.background = C.good; b.style.color = '#fff'; okBtn = b; }
    if (k2 === '⌫') b.style.color = C.bad;
    b.addEventListener('click', function () { key(k2); });
    pad.appendChild(b);
  });

  function digitSize() { return Math.max(26, Math.min(54, Math.floor(340 / Math.max(6, len)))); }

  function setHud() {
    lvlEl.textContent = api.t('level') + ' ' + (len - 2) + ' · ' + len + (ru ? ' цифр' : ' digits');
    var h = '';
    for (var i = 0; i < 3; i++) h += i < hearts ? '❤️' : '🖤';
    heartsEl.textContent = h;
  }

  function fillDisp(str, color, dim) {
    disp.textContent = '';
    spans = [];
    var fs = digitSize();
    for (var i = 0; i < str.length; i++) {
      var s = el('span', 'font-size:' + fs + 'px;font-weight:bold;font-variant-numeric:tabular-nums;line-height:1.1;color:' + (color || C.text) + ';' +
        (dim ? 'opacity:0;' + (LOW ? '' : 'transform:scale(1.5);transition:opacity .15s,transform .15s;') : ''), str[i]);
      disp.appendChild(s);
      spans.push(s);
    }
  }

  // ---------- rounds ----------
  function rndNum(n) {
    var s = String(1 + (Math.random() * 9) | 0);
    for (var i = 1; i < n; i++) s += String((Math.random() * 10) | 0);
    return s;
  }

  function startShow() {
    num = rndNum(len);
    entry = '';
    phase = 'show';
    showTotal = Math.round(1200 + 400 * len);
    showEl = 0;
    pad.style.visibility = 'hidden';
    msgEl.textContent = ru ? 'Запоминай!' : 'Memorize!';
    fillDisp(num, C.text, true);
    setHud();
  }

  function startInput() {
    phase = 'input';
    msgEl.textContent = ru ? 'Введи число' : 'Type it back';
    pad.style.visibility = 'visible';
    bar.style.width = '0%';
    renderEntry();
  }

  function renderEntry() {
    disp.textContent = '';
    var fs = digitSize();
    for (var i = 0; i < len; i++) {
      var ch = i < entry.length ? entry[i] : '·';
      disp.appendChild(el('span', 'font-size:' + fs + 'px;font-weight:bold;font-variant-numeric:tabular-nums;line-height:1.1;color:' + (i < entry.length ? C.text : C.muted) + ';', ch));
    }
  }

  function submit() {
    if (phase !== 'input' || entry.length === 0) return;
    if (entry === num) {
      score += len * 10;
      api.score(score);
      api.haptic('success');
      msgEl.textContent = '✅ +' + (len * 10);
      len = Math.min(12, len + 1);
      phase = 'pre';
      phaseRemain = 900;
      fillDisp(num, C.good, false);
      pad.style.visibility = 'hidden';
      setHud();
    } else {
      hearts--;
      api.haptic('error');
      phase = 'reveal';
      phaseRemain = 2200;
      pad.style.visibility = 'hidden';
      msgEl.textContent = (ru ? 'Правильно было: ' : 'Correct answer: ');
      fillDisp(num, C.bad, false);
      setHud();
    }
  }

  function key(k2) {
    if (phase !== 'input' || paused || ended) return;
    if (k2 === '⌫') {
      if (entry.length) { entry = entry.slice(0, -1); renderEntry(); }
    } else if (k2 === '✓') {
      submit();
    } else if (entry.length < len) {
      entry += k2;
      api.haptic('light');
      renderEntry();
    }
  }

  function onKey(e) {
    if (e.key >= '0' && e.key <= '9') { key(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { key('⌫'); e.preventDefault(); }
    else if (e.key === 'Enter') { key('✓'); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  // ---------- loop ----------
  var lastT = Date.now();
  var iv = setInterval(function () {
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    if (paused || ended) return;
    if (phase === 'pre') {
      phaseRemain -= dt;
      if (phaseRemain <= 0) startShow();
    } else if (phase === 'show') {
      showEl += dt;
      var k2 = Math.min(spans.length, Math.floor(showEl / 130) + 1); // digit-by-digit reveal
      for (var i = 0; i < k2; i++) {
        if (spans[i].style.opacity !== '1') {
          spans[i].style.opacity = '1';
          if (!LOW) spans[i].style.transform = 'scale(1)';
        }
      }
      bar.style.width = Math.max(0, 100 - showEl / showTotal * 100).toFixed(1) + '%';
      if (showEl >= showTotal) startInput();
    } else if (phase === 'reveal') {
      phaseRemain -= dt;
      if (phaseRemain <= 0) {
        if (hearts <= 0) {
          ended = true;
          phase = 'done';
          clearInterval(iv);
          api.gameOver(score);
        } else {
          startShow(); // same length, new number
        }
      }
    }
  }, 50);

  api.score(0);
  setHud();
  msgEl.textContent = ru ? 'Приготовься…' : 'Get ready…';

  return {
    destroy: function () {
      clearInterval(iv);
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
