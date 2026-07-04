/* Rock-paper-scissors vs bot — best of 10, DOM. */
(function () {
'use strict';
MG.register('rps', function (container, api) {
  var C = api.colors;
  var HANDS = ['✊', '✋', '✌️'];
  var ROUNDS = 10;
  var round = 1, score = 0, playerWins = 0, botWins = 0;
  var prevBot = -1, busy = false, over = false;
  var thinkInt = 0, revealTo = 0, nextTo = 0, endTo = 0;

  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:space-evenly;background:' + C.bg + ';color:' + C.text +
    ';user-select:none;-webkit-user-select:none;';
  container.appendChild(root);

  var head = document.createElement('div');
  head.style.cssText = 'text-align:center;font:bold 16px sans-serif;';
  var roundEl = document.createElement('div');
  var winsEl = document.createElement('div');
  winsEl.style.cssText = 'color:' + C.muted + ';font-weight:normal;margin-top:4px;';
  head.appendChild(roundEl); head.appendChild(winsEl);
  root.appendChild(head);

  var duel = document.createElement('div');
  duel.style.cssText = 'display:flex;align-items:center;gap:26px;font-size:56px;line-height:1;';
  var youEl = document.createElement('div');
  var vsEl = document.createElement('div');
  vsEl.style.cssText = 'font:bold 16px sans-serif;color:' + C.muted + ';';
  vsEl.textContent = 'VS';
  var botEl = document.createElement('div');
  botEl.style.transform = 'scaleX(-1)';
  duel.appendChild(youEl); duel.appendChild(vsEl); duel.appendChild(botEl);
  root.appendChild(duel);

  var msgEl = document.createElement('div');
  msgEl.style.cssText = 'font:bold 20px sans-serif;min-height:26px;text-align:center;';
  root.appendChild(msgEl);

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:14px;';
  root.appendChild(row);
  var btns = [];
  for (var i = 0; i < 3; i++) {
    (function (idx) {
      var b = document.createElement('button');
      b.className = 'mg-btn';
      b.textContent = HANDS[idx];
      b.style.cssText = 'font-size:38px;padding:14px 20px;background:' + C.panel +
        ';border:2px solid ' + C.panel2 + ';border-radius:16px;cursor:pointer;' +
        '-webkit-tap-highlight-color:transparent;color:' + C.text + ';';
      b.addEventListener('click', function () { pick(idx); });
      btns.push(b);
      row.appendChild(b);
    })(i);
  }

  var hint = document.createElement('div');
  hint.className = 'mg-hint';
  hint.style.cssText = 'font:13px sans-serif;color:' + C.muted + ';';
  hint.textContent = api.lang === 'ru' ? 'Победа +20, ничья +5' : 'Win +20, draw +5';
  root.appendChild(hint);

  function updHead() {
    roundEl.textContent = (api.lang === 'ru' ? 'Раунд ' : 'Round ') +
      Math.min(round, ROUNDS) + '/' + ROUNDS;
    winsEl.textContent = (api.lang === 'ru' ? 'Ты ' : 'You ') + playerWins +
      ' : ' + botWins + (api.lang === 'ru' ? ' Бот' : ' Bot');
  }

  function setBtns(on) {
    for (var i = 0; i < btns.length; i++) {
      btns[i].disabled = !on;
      btns[i].style.opacity = on ? '1' : '.45';
    }
  }

  function botThrow() {
    // Mild exploitable bias: 40% of the time repeats its previous throw.
    if (prevBot >= 0 && Math.random() < 0.4) return prevBot;
    return (Math.random() * 3) | 0;
  }

  function pick(p) {
    if (busy || over) return;
    busy = true;
    setBtns(false);
    youEl.textContent = HANDS[p];
    msgEl.style.color = C.muted;
    msgEl.textContent = api.t('thinking') + '…';
    var b = botThrow();
    var k = 0;
    var thinkMs = api.lowEnd ? 350 : 700;
    botEl.textContent = HANDS[0];
    thinkInt = setInterval(function () {
      k = (k + 1) % 3;
      botEl.textContent = HANDS[k];
    }, 90);
    revealTo = setTimeout(function () {
      clearInterval(thinkInt);
      botEl.textContent = HANDS[b];
      prevBot = b;
      var d = (p - b + 3) % 3; // 0 draw, 1 player wins, 2 bot wins
      if (d === 1) {
        playerWins++;
        score += 20;
        msgEl.style.color = C.good;
        msgEl.textContent = api.t('you_win') + '  +20';
        api.haptic('success');
      } else if (d === 0) {
        score += 5;
        msgEl.style.color = C.text;
        msgEl.textContent = api.t('draw') + '  +5';
        api.haptic('light');
      } else {
        botWins++;
        msgEl.style.color = C.bad;
        msgEl.textContent = api.t('you_lose');
        api.haptic('error');
      }
      api.score(score);
      updHead();
      if (round >= ROUNDS) {
        over = true;
        endTo = setTimeout(function () {
          api.gameOver(score, playerWins === botWins ? { draw: true } : { win: playerWins > botWins });
        }, 1100);
      } else {
        round++;
        nextTo = setTimeout(function () {
          busy = false;
          setBtns(true);
          youEl.textContent = '❔';
          botEl.textContent = '❔';
          msgEl.style.color = C.muted;
          msgEl.textContent = api.t('your_turn');
          updHead();
        }, 900);
      }
    }, thinkMs);
  }

  youEl.textContent = '❔';
  botEl.textContent = '❔';
  msgEl.style.color = C.muted;
  msgEl.textContent = api.t('your_turn');
  updHead();
  api.score(0);

  return {
    destroy: function () {
      clearInterval(thinkInt);
      clearTimeout(revealTo);
      clearTimeout(nextTo);
      clearTimeout(endTo);
    }
  };
});
})();
