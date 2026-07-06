/* Crazy Eights — vs AI, 8 is wild, best of 5 rounds. */
(function () {
'use strict';
MG.register('crazy8', function (container, api) {
  var C = api.colors, RU = api.lang === 'ru', LOW = api.lowEnd;
  var dead = false, paused = false, timers = [];

  function arm(o) {
    o.at = Date.now();
    o.id = setTimeout(function () {
      var i = timers.indexOf(o);
      if (i >= 0) timers.splice(i, 1);
      if (!dead && !paused) o.fn();
    }, o.rem);
  }
  function setT(fn, ms) {
    var o = { fn: fn, rem: ms, at: 0, id: 0 };
    timers.push(o);
    if (!paused) arm(o);
    return o;
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var SU = ['♠', '♥', '♦', '♣'];
  function rkName(r) { return r <= 10 ? String(r) : { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r]; }
  function isRed(s) { return s === 1 || s === 2; }

  // ---- UI ----
  container.style.background = 'radial-gradient(ellipse at 50% 28%, ' + C.panel2 + ', ' + C.bg + ' 82%)';
  var style = document.createElement('style');
  style.textContent =
    '.c8-wrap{position:absolute;inset:0;display:flex;flex-direction:column;font-family:sans-serif;color:' + C.text + ';overflow:hidden}' +
    '.c8-top{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;font:bold 13px sans-serif}' +
    '.c8-ai{display:flex;justify-content:center;align-items:center;min-height:44px}' +
    '.c8-back{width:28px;height:40px;border-radius:5px;background:linear-gradient(135deg,' + C.accent + ' 20%,' + C.panel2 + ');box-shadow:0 1px 3px rgba(0,0,0,.4);margin-left:-14px;flex:none}' +
    '.c8-back:first-child{margin-left:0}' +
    '.c8-mid{display:flex;justify-content:center;align-items:center;gap:16px;padding:8px 4px;flex:1}' +
    '.c8-card{width:58px;height:84px;border-radius:8px;background:#fff;color:#23252b;position:relative;box-shadow:0 2px 5px rgba(0,0,0,.4);flex:none;transition:transform .15s ease}' +
    '.c8-card.red{color:#d0342c}' +
    '.c8-card .r{position:absolute;top:4px;left:5px;font:bold 14px/1.05 sans-serif;text-align:center}' +
    '.c8-card .r2{top:auto;left:auto;bottom:4px;right:5px;transform:rotate(180deg)}' +
    '.c8-card .m{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px}' +
    '.c8-deck{width:58px;height:84px;border-radius:8px;background:linear-gradient(135deg,' + C.accent + ' 20%,' + C.panel2 + ');box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;color:#fff;font:bold 15px sans-serif}' +
    '.c8-deck.glow{box-shadow:0 0 14px ' + C.accent + '}' +
    '.c8-suit{width:44px;height:44px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 2px 5px rgba(0,0,0,.4)}' +
    '.c8-msg{text-align:center;font:bold 15px sans-serif;min-height:22px;padding:2px 6px}' +
    '.c8-hand{display:flex;overflow-x:auto;padding:16px 14px 12px;-webkit-overflow-scrolling:touch}' +
    '.c8-hand .c8-card{margin-left:-26px}' +
    '.c8-hand .c8-card:first-child{margin-left:0}' +
    '.c8-hand .c8-card.up{transform:translateY(-12px);box-shadow:0 0 12px ' + C.accent + ',0 2px 5px rgba(0,0,0,.4)}' +
    '.c8-ovl{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:5}' +
    '.c8-sb{width:64px;height:64px;border-radius:12px;background:#fff;border:0;font-size:36px;margin:8px}';
  container.appendChild(style);

  var wrap = document.createElement('div');
  wrap.className = 'c8-wrap';
  wrap.innerHTML =
    '<div class="c8-top"><div id="c8_rnd"></div><div id="c8_sc"></div></div>' +
    '<div class="c8-ai" id="c8_ai"></div>' +
    '<div class="c8-mid">' +
    '<div class="c8-deck" id="c8_deck"></div>' +
    '<div id="c8_disc"></div>' +
    '<div class="c8-suit" id="c8_suit"></div>' +
    '</div>' +
    '<div class="c8-msg" id="c8_msg"></div>' +
    '<div class="c8-hand" id="c8_hand"></div>';
  container.appendChild(wrap);
  function q(id) { return wrap.querySelector('#' + id); }
  var handEl = q('c8_hand'), aiEl = q('c8_ai'), deckEl = q('c8_deck'), discEl = q('c8_disc'), suitEl = q('c8_suit'), msgEl = q('c8_msg');

  var ovl = document.createElement('div'); // suit picker for 8s
  ovl.className = 'c8-ovl';
  ovl.style.display = 'none';
  for (var so = 0; so < 4; so++) {
    (function (s) {
      var b = document.createElement('button');
      b.className = 'c8-sb';
      b.textContent = SU[s];
      b.style.color = isRed(s) ? '#d0342c' : '#23252b';
      b.addEventListener('click', function (ev) { ev.stopPropagation(); pickSuit(s); });
      ovl.appendChild(b);
    })(so);
  }
  ovl.addEventListener('click', function () { pending8 = null; ovl.style.display = 'none'; });
  container.appendChild(ovl);

  // ---- state ----
  var deck = [], discard = [], pHand = [], aHand = [];
  var curSuit = 0, curRank = 0, turn = 'p', drawsLeft = 3, passStreak = 0;
  var round = 1, pWins = 0, aWins = 0, pPts = 0, aPts = 0, roundOver = false, matchOver = false;
  var pending8 = null;

  function cardHtml(c, cls, attr) {
    return '<div class="c8-card' + (isRed(c.s) ? ' red' : '') + (cls || '') + '"' + (attr || '') + '>' +
      '<div class="r">' + rkName(c.r) + '<br>' + SU[c.s] + '</div>' +
      '<div class="r r2">' + rkName(c.r) + '<br>' + SU[c.s] + '</div>' +
      '<div class="m">' + (c.r === 8 ? '🎱' : SU[c.s]) + '</div></div>';
  }
  function playable(c) { return c.r === 8 || c.s === curSuit || c.r === curRank; }
  function canDraw() { return deck.length > 0 || discard.length > 1; }
  function drawCard() {
    if (!deck.length && discard.length > 1) {
      var top = discard.pop();
      deck = shuffle(discard);
      discard = [top];
    }
    return deck.length ? deck.pop() : null;
  }
  function val(c) { return c.r === 8 ? 50 : (c.r === 14 ? 1 : (c.r > 10 ? 10 : c.r)); }

  function msg(s, col) {
    msgEl.textContent = s || '';
    msgEl.style.color = col || C.text;
  }
  function render() {
    q('c8_rnd').textContent = (RU ? 'Раунд ' : 'Round ') + Math.min(round, 5) + '/5 · ' + pWins + ':' + aWins;
    q('c8_sc').textContent = (RU ? 'Очки ' : 'Pts ') + pPts + ' · ' + (RU ? 'ИИ ' : 'AI ') + aPts;
    var i, h = '';
    for (i = 0; i < aHand.length; i++) h += '<div class="c8-back"></div>';
    aiEl.innerHTML = h + '<span style="margin-left:8px;font:bold 13px sans-serif;color:' + C.muted + '">' + aHand.length + '</span>';
    deckEl.textContent = String(deck.length);
    deckEl.className = 'c8-deck' + (turn === 'p' && !roundOver && drawsLeft > 0 && canDraw() && !anyPlayable(pHand) ? ' glow' : '');
    discEl.innerHTML = discard.length ? cardHtml(discard[discard.length - 1]) : '';
    suitEl.textContent = SU[curSuit];
    suitEl.style.color = isRed(curSuit) ? '#d0342c' : '#23252b';
    h = '';
    for (i = 0; i < pHand.length; i++) {
      var up = turn === 'p' && !roundOver && playable(pHand[i]);
      h += cardHtml(pHand[i], up ? ' up' : '', ' data-i="' + i + '"');
    }
    handEl.innerHTML = h;
  }
  function anyPlayable(hand) {
    for (var i = 0; i < hand.length; i++) if (playable(hand[i])) return true;
    return false;
  }

  function dealRound() {
    deck = [];
    for (var s = 0; s < 4; s++) for (var r = 2; r <= 14; r++) deck.push({ r: r, s: s });
    shuffle(deck);
    pHand = deck.splice(0, 7);
    aHand = deck.splice(0, 7);
    var top = deck.pop();
    while (top.r === 8) { // starter can't be an 8
      deck.splice((Math.random() * deck.length) | 0, 0, top);
      top = deck.pop();
    }
    discard = [top];
    curSuit = top.s; curRank = top.r;
    passStreak = 0; roundOver = false; pending8 = null;
    turn = (round % 2 === 1) ? 'p' : 'a';
    beginTurn();
  }

  function beginTurn() {
    if (roundOver || dead) return;
    drawsLeft = 3;
    if (turn === 'a') {
      msg(api.t('thinking'), C.muted);
      render();
      setT(aiStep, LOW ? 450 : 800);
    } else {
      msg(api.t('your_turn'), C.accent);
      render();
      checkStuck();
    }
  }
  function checkStuck() {
    if (turn !== 'p' || roundOver) return;
    if (!anyPlayable(pHand)) {
      if (!canDraw() || drawsLeft === 0) {
        msg(RU ? 'Нет хода — пас…' : 'No play — pass…', C.muted);
        setT(passTurn, 900);
      } else msg(RU ? 'Возьми карту (' + drawsLeft + ')' : 'Draw a card (' + drawsLeft + ')', C.muted);
    }
  }
  function passTurn() {
    if (roundOver) return;
    passStreak++;
    if (passStreak >= 2 && !canDraw()) return blockedEnd();
    turn = turn === 'p' ? 'a' : 'p';
    beginTurn();
  }

  function playCard(who, idx, suit) {
    var hand = who === 'p' ? pHand : aHand;
    var c = hand.splice(idx, 1)[0];
    discard.push(c);
    curSuit = suit;
    curRank = c.r;
    passStreak = 0;
    if (who === 'p') api.haptic('light');
    if (c.r === 8) msg((who === 'p' ? (RU ? 'Масть: ' : 'Suit: ') : (RU ? 'ИИ: масть ' : 'AI picks ')) + SU[suit]);
    else msg('');
    render();
    if (!hand.length) return roundEnd(who);
    turn = who === 'p' ? 'a' : 'p';
    beginTurn();
  }

  // player input
  handEl.addEventListener('click', function (ev) {
    if (dead || paused || turn !== 'p' || roundOver || matchOver) return;
    var el = ev.target;
    while (el && el !== handEl && !el.getAttribute('data-i')) el = el.parentNode;
    if (!el || el === handEl) return;
    var i = +el.getAttribute('data-i');
    var c = pHand[i];
    if (!c || !playable(c)) return;
    if (c.r === 8) {
      pending8 = c;
      ovl.style.display = 'flex';
      return;
    }
    playCard('p', i, c.s);
  });
  function pickSuit(s) {
    ovl.style.display = 'none';
    if (!pending8 || turn !== 'p' || roundOver) { pending8 = null; return; }
    var i = pHand.indexOf(pending8);
    pending8 = null;
    if (i < 0) return;
    playCard('p', i, s);
  }
  deckEl.addEventListener('click', function () {
    if (dead || paused || turn !== 'p' || roundOver || matchOver) return;
    if (drawsLeft <= 0 || !canDraw()) return;
    var c = drawCard();
    if (!c) return;
    pHand.push(c);
    drawsLeft--;
    api.haptic('light');
    render();
    if (!anyPlayable(pHand) && (drawsLeft === 0 || !canDraw())) {
      msg(RU ? 'Нет хода — пас…' : 'No play — pass…', C.muted);
      setT(passTurn, 800);
    } else checkStuck();
  });

  // AI: hold 8s, dump high-count cards, pick its longest suit for 8s
  function aiStep() {
    if (roundOver || dead) return;
    var plays = [], i;
    for (i = 0; i < aHand.length; i++) if (playable(aHand[i])) plays.push(i);
    var non8 = [];
    for (i = 0; i < plays.length; i++) if (aHand[plays[i]].r !== 8) non8.push(plays[i]);
    if (non8.length) {
      non8.sort(function (a, b) { return val(aHand[b]) - val(aHand[a]); });
      return playCard('a', non8[0], aHand[non8[0]].s);
    }
    if (plays.length) { // only 8s playable
      var i8 = plays[0], cnt = [0, 0, 0, 0], best = 0;
      for (i = 0; i < aHand.length; i++) if (i !== i8) cnt[aHand[i].s]++;
      for (i = 1; i < 4; i++) if (cnt[i] > cnt[best]) best = i;
      return playCard('a', i8, best);
    }
    if (drawsLeft > 0 && canDraw()) {
      var c = drawCard();
      if (c) {
        aHand.push(c);
        drawsLeft--;
        render();
        return setT(aiStep, LOW ? 250 : 450);
      }
    }
    msg(RU ? 'ИИ пасует' : 'AI passes', C.muted);
    render();
    setT(passTurn, 700);
  }

  function roundEnd(w) {
    roundOver = true;
    var oppN = w === 'p' ? aHand.length : pHand.length;
    var pts = 50 + oppN * 5;
    if (w === 'p') { pPts += pts; pWins++; api.haptic('success'); msg(api.t('you_win') + '  +' + pts, C.good); }
    else if (w === 'a') { aPts += pts; aWins++; api.haptic('error'); msg(api.t('you_lose'), C.bad); }
    else msg(api.t('draw'), C.muted);
    api.score(pPts);
    render();
    setT(function () {
      round++;
      if (round > 5 || pWins >= 3 || aWins >= 3) endMatch();
      else dealRound();
    }, 1700);
  }
  function blockedEnd() { // both stuck: fewer cards wins the round
    if (pHand.length < aHand.length) roundEnd('p');
    else if (aHand.length < pHand.length) roundEnd('a');
    else roundEnd(null);
  }
  function endMatch() {
    matchOver = true;
    if (pWins === aWins) api.gameOver(pPts, { draw: true });
    else api.gameOver(pPts, { win: pWins > aWins });
  }

  // init
  api.score(0);
  dealRound();

  return {
    destroy: function () {
      dead = true;
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i].id);
      timers.length = 0;
      container.style.background = '';
    },
    pause: function () {
      paused = true;
      for (var i = 0; i < timers.length; i++) {
        var o = timers[i];
        clearTimeout(o.id);
        o.rem = Math.max(0, o.rem - (Date.now() - o.at));
      }
    },
    resume: function () {
      paused = false;
      for (var i = 0; i < timers.length; i++) arm(timers[i]);
    }
  };
});
})();
