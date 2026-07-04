/* Higher-Lower — push-your-luck card streak. 52 cards, bank your pot. */
(function () {
'use strict';
MG.register('highlow', function (container, api) {
  var C = api.colors, ru = api.lang === 'ru', low = api.lowEnd;
  var SUITS = ['♠', '♥', '♦', '♣'];

  function pc(s) {
    var m; s = String(s).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(s))) { var p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
    return [128, 128, 128];
  }
  function rgba(c, a) { var p = pc(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }

  // deck: ranks 2..14 (A high), drawn without replacement
  var deck = [], s, r;
  for (s = 0; s < 4; s++) for (r = 2; r <= 14; r++) deck.push({ r: r, s: s });
  for (var i = deck.length - 1; i > 0; i--) {
    var j = (Math.random() * (i + 1)) | 0, t = deck[i];
    deck[i] = deck[j]; deck[j] = t;
  }
  var idx = 0, cur = deck[idx++];
  var hearts = 3, pot = 0, streak = 0, score = 0;
  var over = false, paused = false, lock = false, timeouts = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timeouts.push(id); return id; }
  function mult() { return 1 + ((streak / 3) | 0); }
  function rankStr(v) { return v <= 10 ? '' + v : 'JQKA'[v - 11]; }

  // ----- DOM -----
  container.style.background = C.bg;
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;color:' + C.text + ';user-select:none;-webkit-user-select:none;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;width:100%;max-width:420px;box-sizing:border-box;padding:10px 16px 0;font-size:16px;font-weight:700;';
  var heartsLbl = document.createElement('div');
  var deckLbl = document.createElement('div');
  deckLbl.style.color = C.muted;
  bar.appendChild(heartsLbl); bar.appendChild(deckLbl);

  var cardWrap = document.createElement('div');
  cardWrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-height:0;';
  var cardEl = document.createElement('div');
  cardEl.style.cssText = 'position:relative;width:126px;height:176px;border-radius:12px;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.4);' + (low ? '' : 'transition:transform .15s;');
  var fx = document.createElement('div');
  fx.style.cssText = 'position:absolute;left:0;right:0;top:8%;text-align:center;font-size:30px;font-weight:900;pointer-events:none;opacity:0;' + (low ? '' : 'transition:opacity .4s;');
  cardWrap.appendChild(cardEl); cardWrap.appendChild(fx);

  var potPanel = document.createElement('div');
  potPanel.style.cssText = 'display:flex;gap:14px;align-items:center;font-size:15px;font-weight:700;padding:4px 0;';
  var potLbl = document.createElement('div');
  var multLbl = document.createElement('div');
  multLbl.style.color = C.accent;
  var dotsLbl = document.createElement('div');
  dotsLbl.style.cssText = 'color:' + C.muted + ';letter-spacing:2px;font-size:12px;';
  potPanel.appendChild(potLbl); potPanel.appendChild(multLbl); potPanel.appendChild(dotsLbl);

  // probability hint bar
  var probWrap = document.createElement('div');
  probWrap.style.cssText = 'width:230px;padding:2px 0 6px;';
  var probLbls = document.createElement('div');
  probLbls.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:' + C.muted + ';padding-bottom:3px;';
  var hiLbl = document.createElement('span');
  hiLbl.style.color = C.good;
  var loLbl = document.createElement('span');
  loLbl.style.color = C.bad;
  probLbls.appendChild(hiLbl); probLbls.appendChild(loLbl);
  var probBar = document.createElement('div');
  probBar.style.cssText = 'position:relative;height:7px;border-radius:4px;overflow:hidden;background:' + rgba(C.muted, 0.25) + ';';
  var hiSeg = document.createElement('div');
  hiSeg.style.cssText = 'position:absolute;left:0;top:0;bottom:0;background:' + C.good + ';' + (low ? '' : 'transition:width .25s;');
  var loSeg = document.createElement('div');
  loSeg.style.cssText = 'position:absolute;right:0;top:0;bottom:0;background:' + C.bad + ';' + (low ? '' : 'transition:width .25s;');
  probBar.appendChild(hiSeg); probBar.appendChild(loSeg);
  probWrap.appendChild(probLbls); probWrap.appendChild(probBar);

  var btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:10px;justify-content:center;align-items:stretch;padding:4px 0 16px;';
  function mkBtn(html, color) {
    var b = document.createElement('button');
    b.style.cssText = 'border:0;border-radius:12px;padding:13px 18px;font-size:15px;font-weight:800;cursor:pointer;background:' + C.panel2 + ';color:' + color + ';min-width:96px;';
    b.innerHTML = html;
    return b;
  }
  var loBtn = mkBtn('⬇ ' + (ru ? 'Меньше' : 'Lower'), C.bad);
  var bankBtn = mkBtn('', '#fff');
  bankBtn.style.background = C.accent;
  var hiBtn = mkBtn('⬆ ' + (ru ? 'Больше' : 'Higher'), C.good);
  btns.appendChild(loBtn); btns.appendChild(bankBtn); btns.appendChild(hiBtn);

  root.appendChild(bar); root.appendChild(cardWrap); root.appendChild(potPanel);
  root.appendChild(probWrap); root.appendChild(btns);
  container.appendChild(root);

  function renderCard(c) {
    var col = (c.s === 1 || c.s === 2) ? '#d63a3a' : '#1c1c24';
    cardEl.innerHTML = '';
    var tl = document.createElement('div');
    tl.style.cssText = 'position:absolute;left:9px;top:7px;font-size:19px;font-weight:800;line-height:1.05;text-align:center;color:' + col + ';';
    tl.innerHTML = rankStr(c.r) + '<br>' + SUITS[c.s];
    var br = document.createElement('div');
    br.style.cssText = 'position:absolute;right:9px;bottom:7px;font-size:19px;font-weight:800;line-height:1.05;text-align:center;color:' + col + ';transform:rotate(180deg);';
    br.innerHTML = rankStr(c.r) + '<br>' + SUITS[c.s];
    var mid = document.createElement('div');
    mid.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:58px;color:' + col + ';';
    mid.textContent = SUITS[c.s];
    cardEl.appendChild(tl); cardEl.appendChild(br); cardEl.appendChild(mid);
  }

  function fxShow(text, color) {
    fx.textContent = text;
    fx.style.color = color;
    fx.style.opacity = '1';
    later(function () { fx.style.opacity = '0'; }, 650);
  }

  function updAll() {
    var h = '';
    for (var k = 0; k < 3; k++) h += k < hearts ? '❤️' : '🖤';
    heartsLbl.textContent = h;
    potLbl.textContent = '💰 ' + (ru ? 'На кону: ' : 'Pot: ') + pot;
    multLbl.textContent = '×' + mult();
    var d = '';
    for (k = 0; k < 3; k++) d += k < streak % 3 ? '●' : '○';
    dotsLbl.textContent = d;
    bankBtn.innerHTML = '🏦 ' + (ru ? 'Забрать' : 'Bank') + (pot > 0 ? '<br>+' + pot : '');
    bankBtn.style.opacity = pot > 0 ? '1' : '0.5';
    // probability of higher vs lower among remaining cards
    var hi = 0, lo = 0, n = 0;
    for (k = idx; k < deck.length; k++) {
      n++;
      if (deck[k].r > cur.r) hi++;
      else if (deck[k].r < cur.r) lo++;
    }
    deckLbl.textContent = '🂠 ' + n;
    if (n > 0) {
      hiSeg.style.width = (hi / n * 100) + '%';
      loSeg.style.width = (lo / n * 100) + '%';
      hiLbl.textContent = '⬆ ' + Math.round(hi / n * 100) + '%';
      loLbl.textContent = Math.round(lo / n * 100) + '% ⬇';
    }
  }

  function end() {
    over = true;
    later(function () { api.gameOver(score); }, 700);
  }

  function guess(up) {
    if (over || paused || lock) return;
    if (idx >= deck.length) { end(); return; }
    lock = true;
    var prev = cur, next = deck[idx++];
    cur = next;
    function resolve() {
      renderCard(next);
      if (!low) cardEl.style.transform = '';
      if (next.r === prev.r) {
        fxShow(ru ? 'Ничья' : 'Push', C.muted); // tie = push, no penalty
      } else if ((next.r > prev.r) === up) {
        streak++;
        var gain = 10 * mult();
        pot += gain;
        fxShow('+' + gain, C.good);
        api.haptic(streak % 3 === 0 ? 'success' : 'light');
      } else {
        hearts--;
        pot = 0; streak = 0;
        fxShow('✗', C.bad);
        api.haptic('error');
      }
      updAll();
      if (hearts <= 0 || idx >= deck.length) { end(); return; }
      lock = false;
    }
    if (low) { resolve(); return; }
    cardEl.style.transform = 'scaleX(0.05)';
    later(function () { resolve(); }, 160);
  }

  function bank() {
    if (over || paused || lock || pot <= 0) return;
    score += pot;
    api.score(score);
    fxShow('🏦 +' + pot, C.accent);
    pot = 0; streak = 0;
    api.haptic('medium');
    updAll();
  }

  hiBtn.addEventListener('click', function () { guess(true); });
  loBtn.addEventListener('click', function () { guess(false); });
  bankBtn.addEventListener('click', bank);

  function onKey(e) {
    if (e.key === 'ArrowUp') { guess(true); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { guess(false); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'b') { bank(); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  api.score(0);
  renderCard(cur);
  updAll();

  return {
    destroy: function () {
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
