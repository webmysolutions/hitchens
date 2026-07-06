/* Blackjack — casino blackjack vs dealer, persistent chips, 6-deck shoe. */
(function () {
'use strict';
MG.register('blackjack', function (container, api) {
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
  var RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // ---- persistent chips (daily top-up to 200 if broke) ----
  var st = api.load() || {};
  var chips = (typeof st.chips === 'number' && st.chips >= 0) ? Math.floor(st.chips) : 500;
  var bet = (typeof st.bet === 'number') ? st.bet : 25;
  function persist() { st.chips = chips; st.bet = bet; api.save(st); }
  function topup() {
    var today = new Date().toDateString();
    if (chips < 10 && st.day !== today) {
      chips = 200; st.day = today; persist();
      msg(RU ? 'Ежедневный бонус: 200 💰' : 'Daily top-up: 200 💰');
    }
  }

  // ---- shoe ----
  var shoe = [];
  function newShoe() {
    shoe = [];
    for (var d = 0; d < 6; d++) for (var s = 0; s < 4; s++) for (var r = 1; r <= 13; r++) shoe.push({ r: r, s: s });
    shuffle(shoe);
  }
  function draw1() { if (!shoe.length) newShoe(); return shoe.pop(); }

  function total(cards) {
    var t = 0, aces = 0, i;
    for (i = 0; i < cards.length; i++) {
      if (cards[i].r === 1) { t += 11; aces++; }
      else t += Math.min(10, cards[i].r);
    }
    while (t > 21 && aces) { t -= 10; aces--; }
    return t;
  }
  function isBJ(cards) { return cards.length === 2 && total(cards) === 21; }
  function handPayout(cards, betAmt, bust, isSplit, dCards) {
    var dt = total(dCards), dbj = isBJ(dCards);
    var pt = total(cards);
    var pbj = !isSplit && isBJ(cards);
    if (bust) return 0;
    if (pbj && dbj) return betAmt;
    if (pbj) return betAmt + Math.floor(betAmt * 3 / 2); // blackjack pays 3:2
    if (dbj) return 0;
    if (dt > 21 || pt > dt) return betAmt * 2;
    if (pt === dt) return betAmt;
    return 0;
  }

  // ---- UI ----
  container.style.background = 'radial-gradient(ellipse at 50% 25%, ' + C.panel2 + ', ' + C.bg + ' 82%)';
  var style = document.createElement('style');
  style.textContent =
    '.bj-wrap{position:absolute;inset:0;display:flex;flex-direction:column;font-family:sans-serif;color:' + C.text + ';overflow:hidden}' +
    '.bj-top{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;font-weight:bold}' +
    '.bj-cards{display:flex;justify-content:center;align-items:flex-start;min-height:88px;padding:2px}' +
    '.bj-hand{display:flex;border-radius:10px;padding:3px;margin:0 3px}' +
    '.bj-hand.act{outline:2px solid ' + C.accent + '}' +
    '.bj-card{width:54px;height:78px;border-radius:8px;background:#fff;color:#23252b;position:relative;margin:0 2px;box-shadow:0 2px 5px rgba(0,0,0,.4);flex:none;transition:transform .18s ease,opacity .18s ease}' +
    '.bj-card.red{color:#d0342c}' +
    '.bj-card.in{transform:translateY(-26px) scale(.7);opacity:0}' +
    '.bj-card.back{background:linear-gradient(135deg,' + C.accent + ' 20%,' + C.panel2 + ')}' +
    '.bj-card .r{position:absolute;top:4px;left:5px;font:bold 13px/1.05 sans-serif;text-align:center}' +
    '.bj-card .r2{top:auto;left:auto;bottom:4px;right:5px;transform:rotate(180deg)}' +
    '.bj-card .m{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px}' +
    '.bj-tot{text-align:center;font:bold 13px sans-serif;color:' + C.muted + ';min-height:17px}' +
    '.bj-msg{text-align:center;font:bold 15px sans-serif;min-height:22px;padding:2px 6px}' +
    '.bj-b{padding:10px 12px;border-radius:10px;border:0;background:' + C.panel + ';color:' + C.text + ';font:bold 14px sans-serif;margin:3px;min-width:62px}' +
    '.bj-b:disabled{opacity:.35}' +
    '.bj-b.acc{background:' + C.accent + ';color:#fff}' +
    '.bj-chip{width:44px;height:44px;border-radius:50%;border:3px dashed rgba(255,255,255,.75);font:bold 12px sans-serif;color:#fff;margin:2px}';
  container.appendChild(style);

  var wrap = document.createElement('div');
  wrap.className = 'bj-wrap';
  wrap.innerHTML =
    '<div class="bj-top"><div id="bj_chips"></div><div id="bj_shoe" style="color:' + C.muted + ';font-weight:normal;font-size:12px"></div><button class="bj-b" id="bj_out" title="cash out">🏁</button></div>' +
    '<div class="bj-cards"><div class="bj-hand" id="bj_dealer"></div></div><div class="bj-tot" id="bj_dtot"></div>' +
    '<div class="bj-msg" id="bj_msg"></div>' +
    '<div style="flex:1"></div>' +
    '<div class="bj-cards" id="bj_hands"></div><div class="bj-tot" id="bj_ptot"></div>' +
    '<div id="bj_ctrl" style="padding:4px 8px 12px;text-align:center"></div>';
  container.appendChild(wrap);
  function q(id) { return wrap.querySelector('#' + id); }
  var dealerEl = q('bj_dealer'), handsEl = q('bj_hands'), ctrl = q('bj_ctrl');
  var msgEl = q('bj_msg'), dTotEl = q('bj_dtot'), pTotEl = q('bj_ptot');

  function msg(s) { msgEl.textContent = s || ''; }
  function renderChips() {
    q('bj_chips').textContent = '💰 ' + chips;
    q('bj_shoe').textContent = '🂠 ' + shoe.length;
    api.score(chips);
  }
  function isRed(c) { return c.s === 1 || c.s === 2; }
  function face(c) {
    var rk = RK[c.r - 1], su = SU[c.s];
    return '<div class="r">' + rk + '<br>' + su + '</div><div class="r r2">' + rk + '<br>' + su + '</div><div class="m">' + su + '</div>';
  }
  function cardEl(c, down) {
    var d = document.createElement('div');
    d.className = 'bj-card' + (down ? ' back' : (isRed(c) ? ' red' : ''));
    if (!down) d.innerHTML = face(c);
    return d;
  }
  function addCard(parent, c, down) {
    var d = cardEl(c, down);
    if (!LOW) {
      d.classList.add('in');
      parent.appendChild(d);
      setT(function () { d.classList.remove('in'); }, 30);
    } else parent.appendChild(d);
    return d;
  }
  function flipUp(d, c) { // hole card reveal
    if (LOW) {
      d.className = 'bj-card' + (isRed(c) ? ' red' : '');
      d.innerHTML = face(c);
      return;
    }
    d.style.transform = 'scaleX(0)';
    setT(function () {
      d.className = 'bj-card' + (isRed(c) ? ' red' : '');
      d.innerHTML = face(c);
      d.style.transform = '';
    }, 160);
  }

  // ---- game state ----
  var phase = 'bet'; // bet | play | dealer
  var dealer = { cards: [], els: [] };
  var hands = [], act = 0, isSplit = false;

  function buildHandEls() {
    handsEl.innerHTML = '';
    for (var i = 0; i < hands.length; i++) {
      var h = hands[i];
      h.el = document.createElement('div');
      h.el.className = 'bj-hand';
      handsEl.appendChild(h.el);
      for (var j = 0; j < h.cards.length; j++) h.el.appendChild(cardEl(h.cards[j], false));
    }
    updateActive();
  }
  function updateActive() {
    for (var i = 0; i < hands.length; i++)
      hands[i].el.className = 'bj-hand' + (phase === 'play' && hands.length > 1 && i === act ? ' act' : '');
  }
  function updateTotals() {
    var parts = [];
    for (var i = 0; i < hands.length; i++) {
      var t = total(hands[i].cards);
      parts.push(t + (hands[i].bust ? ' ✕' : '') + ' (' + hands[i].bet + ')');
    }
    pTotEl.textContent = parts.join('  |  ');
  }
  function updateDTot(revealed) {
    if (!dealer.cards.length) { dTotEl.textContent = ''; return; }
    dTotEl.textContent = revealed ? String(total(dealer.cards)) : (total([dealer.cards[0]]) + ' + ?');
  }
  function hitTo(i) {
    var c = draw1();
    hands[i].cards.push(c);
    addCard(hands[i].el, c, false);
    updateTotals();
    renderChips();
  }
  function dHit(down) {
    var c = draw1();
    dealer.cards.push(c);
    dealer.els.push(addCard(dealerEl, c, down));
    renderChips();
  }

  // ---- betting phase ----
  function showBetUI() {
    phase = 'bet';
    topup();
    renderChips();
    updateActive();
    if (chips < 10) {
      ctrl.innerHTML = '<div style="color:' + C.muted + ';font:13px sans-serif;padding:10px">' +
        (RU ? 'Фишки кончились — бонус будет завтра' : 'Out of chips — top-up returns tomorrow') + '</div>';
      return;
    }
    bet = Math.max(10, Math.min(bet, chips));
    var maxB = Math.min(chips, 500);
    ctrl.innerHTML =
      '<div id="bj_bl" style="font:bold 16px sans-serif;padding:2px">' + (RU ? 'Ставка: ' : 'Bet: ') + bet + '</div>' +
      '<input type="range" id="bj_sl" min="10" max="' + maxB + '" step="10" value="' + Math.min(bet, maxB) + '" style="width:82%;margin:4px 0">' +
      '<div>' +
      '<button class="bj-chip" style="background:' + C.accent + '" data-v="10">10</button>' +
      '<button class="bj-chip" style="background:' + C.good + '" data-v="25">25</button>' +
      '<button class="bj-chip" style="background:' + C.bad + '" data-v="50">50</button>' +
      '<button class="bj-chip" style="background:' + C.panel2 + '" data-v="100">100</button>' +
      '</div>' +
      '<button class="bj-b acc" id="bj_deal" style="min-width:140px;font-size:16px">' + (RU ? 'РАЗДАТЬ' : 'DEAL') + '</button>';
    var sl = q('bj_sl'), bl = q('bj_bl');
    function setBet(v) {
      bet = Math.max(10, Math.min(maxB, Math.floor(v / 5) * 5));
      bl.textContent = (RU ? 'Ставка: ' : 'Bet: ') + bet;
      sl.value = bet;
    }
    sl.addEventListener('input', function () { setBet(+sl.value); });
    var chipsBtns = ctrl.querySelectorAll('.bj-chip');
    for (var i = 0; i < chipsBtns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { setBet(bet + (+b.getAttribute('data-v'))); api.haptic('light'); });
      })(chipsBtns[i]);
    }
    q('bj_deal').addEventListener('click', deal);
  }

  function deal() {
    if (phase !== 'bet' || chips < bet || bet < 10) return;
    if (shoe.length < 78) { newShoe(); msg(RU ? 'Тасуем колоду…' : 'Shuffling the shoe…'); } // reshuffle at 25%
    else msg('');
    chips -= bet;
    persist();
    dealerEl.innerHTML = '';
    dealer = { cards: [], els: [] };
    hands = [{ cards: [], bet: bet, done: false, bust: false }];
    act = 0; isSplit = false;
    buildHandEls();
    phase = 'play';
    ctrl.innerHTML = '';
    renderChips();
    var gap = LOW ? 120 : 260;
    setT(function () { hitTo(0); }, gap);
    setT(function () { dHit(false); updateDTot(false); }, gap * 2);
    setT(function () { hitTo(0); }, gap * 3);
    setT(function () { dHit(true); }, gap * 4);
    setT(afterDeal, gap * 4 + (LOW ? 100 : 250));
  }

  function afterDeal() {
    updateTotals();
    updateDTot(false);
    if (isBJ(hands[0].cards) || isBJ(dealer.cards)) {
      flipUp(dealer.els[1], dealer.cards[1]);
      setT(function () { updateDTot(true); settleAll(); }, LOW ? 250 : 500);
    } else showActions();
  }

  function btn(id, label, on) {
    return '<button class="bj-b" id="' + id + '"' + (on ? '' : ' disabled') + '>' + label + '</button>';
  }
  function showActions() {
    phase = 'play';
    var h = hands[act];
    updateActive();
    msg('');
    var two = h.cards.length === 2;
    var canD = two && chips >= h.bet;
    var canS = two && !isSplit && h.cards[0].r === h.cards[1].r && chips >= h.bet;
    ctrl.innerHTML =
      btn('bj_hit', RU ? 'Ещё' : 'Hit', true) +
      btn('bj_std', RU ? 'Хватит' : 'Stand', true) +
      btn('bj_dbl', RU ? 'Удвоить' : 'Double', canD) +
      btn('bj_spl', RU ? 'Сплит' : 'Split', canS);
    q('bj_hit').addEventListener('click', actHit);
    q('bj_std').addEventListener('click', actStand);
    if (canD) q('bj_dbl').addEventListener('click', actDbl);
    if (canS) q('bj_spl').addEventListener('click', actSplit);
  }
  function actHit() {
    if (phase !== 'play') return;
    var h = hands[act];
    hitTo(act);
    var t = total(h.cards);
    if (t > 21) {
      h.bust = true; h.done = true;
      updateTotals();
      msg(RU ? 'Перебор!' : 'Bust!');
      api.haptic('error');
      ctrl.innerHTML = '';
      setT(nextHand, LOW ? 350 : 650);
    } else if (t === 21) { h.done = true; nextHand(); }
    else showActions();
  }
  function actStand() {
    if (phase !== 'play') return;
    hands[act].done = true;
    nextHand();
  }
  function actDbl() {
    if (phase !== 'play') return;
    var h = hands[act];
    if (chips < h.bet) return;
    chips -= h.bet;
    h.bet *= 2;
    persist();
    hitTo(act);
    if (total(h.cards) > 21) { h.bust = true; msg(RU ? 'Перебор!' : 'Bust!'); api.haptic('error'); }
    h.done = true;
    ctrl.innerHTML = '';
    setT(nextHand, LOW ? 350 : 650);
  }
  function actSplit() { // one split max; split aces get one card
    if (phase !== 'play') return;
    var h = hands[0];
    if (chips < h.bet) return;
    chips -= h.bet;
    persist();
    var aces = h.cards[0].r === 1;
    hands = [
      { cards: [h.cards[0]], bet: h.bet, done: false, bust: false },
      { cards: [h.cards[1]], bet: h.bet, done: false, bust: false }
    ];
    isSplit = true;
    buildHandEls();
    updateTotals();
    renderChips();
    ctrl.innerHTML = '';
    var gap = LOW ? 150 : 300;
    setT(function () { hitTo(0); }, gap);
    setT(function () { hitTo(1); }, gap * 2);
    setT(function () {
      if (aces) { hands[0].done = hands[1].done = true; dealerPhase(); }
      else { act = 0; showActions(); }
    }, gap * 2 + 100);
  }
  function nextHand() {
    if (act < hands.length - 1) { act++; showActions(); }
    else dealerPhase();
  }

  function dealerPhase() {
    phase = 'dealer';
    ctrl.innerHTML = '';
    updateActive();
    flipUp(dealer.els[1], dealer.cards[1]);
    setT(function () {
      updateDTot(true);
      var allBust = true;
      for (var i = 0; i < hands.length; i++) if (!hands[i].bust) allBust = false;
      if (allBust) setT(settleAll, LOW ? 250 : 450);
      else dealerLoop();
    }, LOW ? 220 : 480);
  }
  function dealerLoop() {
    if (total(dealer.cards) < 17) { // dealer stands on all 17s (soft 17 stands)
      dHit(false);
      updateDTot(true);
      setT(dealerLoop, LOW ? 300 : 560);
    } else setT(settleAll, LOW ? 250 : 450);
  }

  function settleAll() {
    var winAmt = 0, stake = 0, i;
    for (i = 0; i < hands.length; i++) {
      stake += hands[i].bet;
      winAmt += handPayout(hands[i].cards, hands[i].bet, hands[i].bust, isSplit, dealer.cards);
    }
    chips += winAmt;
    persist();
    renderChips();
    var net = winAmt - stake;
    var pbj = !isSplit && isBJ(hands[0].cards) && !isBJ(dealer.cards);
    if (net > 0) {
      msg((pbj ? (RU ? '♠ Блэкджек 3:2! ' : '♠ Blackjack 3:2! ') : '') + api.t('you_win') + ' +' + net);
      api.haptic('success');
    } else if (net === 0) msg(api.t('draw'));
    else { msg(api.t('you_lose') + ' −' + (-net)); api.haptic('error'); }
    setT(showBetUI, 1500);
  }

  // ---- cash out ----
  q('bj_out').addEventListener('click', function () {
    if (phase !== 'bet') return;
    persist();
    api.gameOver(chips, { win: chips > 500 });
  });

  // init
  newShoe();
  topup();
  renderChips();
  showBetUI();
  msg(RU ? 'Сделайте ставку' : 'Place your bet');

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
