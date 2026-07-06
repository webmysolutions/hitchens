/* Code Breaker — guess the secret 4-color code; classic black/white peg feedback. */
(function () {
'use strict';
MG.register('mastermind', function (container, api) {
  var C = api.colors;
  var RU = api.lang === 'ru';
  var timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function baseHue(hex) {
    try {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
      var r = parseInt(h.substr(0, 2), 16) / 255, gg = parseInt(h.substr(2, 2), 16) / 255, b = parseInt(h.substr(4, 2), 16) / 255;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), d = mx - mn, hu = 0;
      if (d > 0) {
        if (mx === r) hu = ((gg - b) / d) % 6; else if (mx === gg) hu = (b - r) / d + 2; else hu = (r - gg) / d + 4;
        hu *= 60; if (hu < 0) hu += 360;
      }
      return hu;
    } catch (e) { return 210; }
  }
  var HUE = baseHue(C.accent);
  var PAL = [];
  for (var pi = 0; pi < 6; pi++) PAL.push('hsl(' + Math.round(HUE + [0, 55, 110, 175, 240, 300][pi]) % 360 + ',64%,56%)');

  var LEVELS = 5, MAX_TRIES = 10, SLOTS = 4;
  var level, secret, guess, tries, total, solved, busy;

  /* classic feedback: black = exact; white = right color wrong place (duplicate-safe) */
  function feedback(sec, gu) {
    var black = 0, i, c;
    var sc = [0, 0, 0, 0, 0, 0], gc = [0, 0, 0, 0, 0, 0];
    for (i = 0; i < SLOTS; i++) {
      if (sec[i] === gu[i]) black++;
      else { sc[sec[i]]++; gc[gu[i]]++; }
    }
    var white = 0;
    for (c = 0; c < 6; c++) white += Math.min(sc[c], gc[c]);
    return { black: black, white: white };
  }

  function makeSecret(lv) {
    var s = [], i;
    if (lv <= 3) { // no duplicates
      var pool = [0, 1, 2, 3, 4, 5];
      for (i = 0; i < SLOTS; i++) s.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    } else {
      for (i = 0; i < SLOTS; i++) s.push((Math.random() * 6) | 0);
    }
    return s;
  }

  /* ---- DOM ---- */
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;padding:8px 10px;box-sizing:border-box;color:' + C.text + ';font-family:sans-serif;-webkit-user-select:none;user-select:none;';
  container.appendChild(root);

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;color:' + C.muted + ';padding:2px 2px 6px;';
  root.appendChild(head);
  var headL = document.createElement('div'); head.appendChild(headL);
  var headR = document.createElement('div'); head.appendChild(headR);
  headR.textContent = '● ' + (RU ? 'место' : 'place') + '   ○ ' + (RU ? 'цвет' : 'color');

  var hist = document.createElement('div');
  hist.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:6px;padding:4px 0;';
  root.appendChild(hist);

  var slotRow = document.createElement('div');
  slotRow.style.cssText = 'display:flex;justify-content:center;gap:10px;padding:8px 0;background:' + C.panel + ';border-radius:12px;margin:6px 0;';
  root.appendChild(slotRow);
  var slotEls = [];
  function makeCircle(sz) {
    var d = document.createElement('div');
    d.style.cssText = 'width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;box-sizing:border-box;';
    return d;
  }
  for (var si = 0; si < SLOTS; si++) {
    (function (idx) {
      var s = makeCircle(40);
      s.style.border = '2px dashed ' + C.muted;
      s.addEventListener('click', function () { if (!busy && guess[idx] !== null) { guess[idx] = null; renderGuess(); } });
      slotRow.appendChild(s);
      slotEls.push(s);
    })(si);
  }

  var palRow = document.createElement('div');
  palRow.style.cssText = 'display:flex;justify-content:center;gap:8px;padding:4px 0;';
  root.appendChild(palRow);
  for (var ci = 0; ci < 6; ci++) {
    (function (col) {
      var b = makeCircle(38);
      b.style.background = PAL[col];
      b.style.boxShadow = '0 2px 6px rgba(0,0,0,.35)';
      b.addEventListener('click', function () { pickColor(col); });
      palRow.appendChild(b);
    })(ci);
  }

  var ctrlRow = document.createElement('div');
  ctrlRow.style.cssText = 'display:flex;justify-content:center;gap:10px;padding:8px 0 4px;';
  root.appendChild(ctrlRow);
  var okBtn = document.createElement('button');
  okBtn.className = 'mg-btn';
  okBtn.textContent = RU ? 'Проверить' : 'Check';
  okBtn.style.cssText += ';background:' + C.accent + ';color:#fff;border:none;border-radius:10px;padding:10px 26px;font-size:15px;font-weight:bold;';
  okBtn.addEventListener('click', submit);
  ctrlRow.appendChild(okBtn);
  var clrBtn = document.createElement('button');
  clrBtn.textContent = '⌫';
  clrBtn.style.cssText = 'background:' + C.panel2 + ';color:' + C.text + ';border:none;border-radius:10px;padding:10px 18px;font-size:15px;';
  clrBtn.addEventListener('click', function () {
    if (busy) return;
    for (var i = SLOTS - 1; i >= 0; i--) if (guess[i] !== null) { guess[i] = null; break; }
    renderGuess();
  });
  ctrlRow.appendChild(clrBtn);

  function renderHead() {
    headL.textContent = api.t('level') + ' ' + level + '/' + LEVELS + '  •  ' + (MAX_TRIES - tries) + (RU ? ' попыток' : ' tries');
  }
  function renderGuess() {
    for (var i = 0; i < SLOTS; i++) {
      var e = slotEls[i];
      if (guess[i] === null) { e.style.background = 'transparent'; e.style.border = '2px dashed ' + C.muted; }
      else { e.style.background = PAL[guess[i]]; e.style.border = '2px solid rgba(255,255,255,.25)'; }
    }
    var full = guess.indexOf(null) === -1;
    okBtn.style.opacity = full && !busy ? '1' : '.4';
  }
  function pickColor(col) {
    if (busy) return;
    var i = guess.indexOf(null);
    if (i === -1) return;
    guess[i] = col;
    api.haptic('light');
    renderGuess();
  }

  function addHistoryRow(gu, fb, isSecret) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:4px 6px;border-radius:10px;background:' + (isSecret ? C.panel2 : 'transparent') + ';';
    var i;
    if (isSecret) {
      var lab = document.createElement('span');
      lab.style.cssText = 'font-size:12px;color:' + C.muted + ';margin-right:4px;';
      lab.textContent = RU ? 'Код:' : 'Code:';
      row.appendChild(lab);
    }
    var revealEls = [];
    for (i = 0; i < SLOTS; i++) {
      var d = makeCircle(26);
      d.style.background = PAL[gu[i]];
      if (!api.lowEnd) {
        d.style.transform = 'scale(0)';
        d.style.transition = 'transform .25s';
        revealEls.push(d);
      }
      row.appendChild(d);
    }
    if (fb) {
      var pegs = document.createElement('div');
      pegs.style.cssText = 'display:grid;grid-template-columns:12px 12px;gap:3px;margin-left:8px;';
      for (i = 0; i < SLOTS; i++) {
        var p = document.createElement('div');
        p.style.cssText = 'width:10px;height:10px;border-radius:50%;box-sizing:border-box;';
        if (i < fb.black) p.style.background = C.text;
        else if (i < fb.black + fb.white) p.style.border = '2px solid ' + C.muted;
        else p.style.border = '1px solid rgba(255,255,255,.12)';
        if (!api.lowEnd) {
          p.style.transform = 'scale(0)';
          p.style.transition = 'transform .25s';
          revealEls.push(p);
        }
        pegs.appendChild(p);
      }
      row.appendChild(pegs);
    }
    hist.appendChild(row);
    hist.scrollTop = hist.scrollHeight;
    if (!api.lowEnd) {
      for (i = 0; i < revealEls.length; i++) {
        (function (el, k) { later(function () { el.style.transform = 'scale(1)'; }, 60 + k * 70); })(revealEls[i], i);
      }
    }
    return revealEls.length * 70 + 200;
  }

  function newLevel() {
    secret = makeSecret(level);
    guess = [null, null, null, null];
    tries = 0;
    busy = false;
    hist.innerHTML = '';
    renderHead();
    renderGuess();
  }

  function submit() {
    if (busy || guess.indexOf(null) !== -1) return;
    busy = true;
    tries++;
    var gu = guess.slice();
    var fb = feedback(secret, gu);
    var wait = addHistoryRow(gu, fb, false);
    guess = [null, null, null, null];
    renderGuess();
    renderHead();
    later(function () {
      if (fb.black === SLOTS) {
        var pts = Math.max(10, 200 - 15 * (tries - 1)) + (level - 1) * 25;
        total += pts;
        solved++;
        api.score(total);
        api.haptic('success');
        nextLevel();
      } else if (tries >= MAX_TRIES) {
        api.haptic('error');
        addHistoryRow(secret, null, true);
        later(nextLevel, 1500);
      } else {
        busy = false;
        renderGuess();
      }
    }, api.lowEnd ? 60 : wait);
  }

  function nextLevel() {
    if (level >= LEVELS) {
      api.gameOver(total, { win: solved >= 3 });
      return;
    }
    level++;
    newLevel();
  }

  function onKey(e) {
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) { pickColor(n - 1); e.preventDefault(); }
    else if (e.key === 'Enter') { submit(); e.preventDefault(); }
    else if (e.key === 'Backspace') {
      if (!busy) { for (var i = SLOTS - 1; i >= 0; i--) if (guess[i] !== null) { guess[i] = null; break; } renderGuess(); }
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);

  level = 1; total = 0; solved = 0;
  api.score(0);
  newLevel();

  return {
    destroy: function () {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      window.removeEventListener('keydown', onKey);
    },
    pause: function () {},
    resume: function () {}
  };
});
})();
