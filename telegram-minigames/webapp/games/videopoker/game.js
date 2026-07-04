/* Video Poker — Jacks or Better, persistent chips, bet 1-5. */
(function () {
'use strict';
MG.register('videopoker', function (container, api) {
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

  // ---- paytable (× bet × 10 chips) ----
  var PAY = { royal: 250, sflush: 50, quads: 25, full: 9, flush: 6, straight: 4, trips: 3, twopair: 2, job: 1 };
  var ORDER = ['royal', 'sflush', 'quads', 'full', 'flush', 'straight', 'trips', 'twopair', 'job'];
  var NAMES = {
    royal: RU ? 'Роял-флеш' : 'Royal Flush',
    sflush: RU ? 'Стрит-флеш' : 'Straight Flush',
    quads: RU ? 'Каре' : 'Four of a Kind',
    full: RU ? 'Фулл-хаус' : 'Full House',
    flush: RU ? 'Флеш' : 'Flush',
    straight: RU ? 'Стрит' : 'Straight',
    trips: RU ? 'Тройка' : 'Three of a Kind',
    twopair: RU ? 'Две пары' : 'Two Pair',
    job: RU ? 'Валеты или выше' : 'Jacks or Better'
  };

  // hand evaluator: cards are {r: 2..14 (14 = ace), s: 0..3}
  function evalHand(cs) {
    var rs = [], flush = true, cnt = {}, i;
    for (i = 0; i < 5; i++) {
      rs.push(cs[i].r);
      if (cs[i].s !== cs[0].s) flush = false;
      cnt[cs[i].r] = (cnt[cs[i].r] || 0) + 1;
    }
    rs.sort(function (a, b) { return a - b; });
    var distinct = 0, four = false, three = false, pairs = [];
    for (var k in cnt) {
      distinct++;
      if (cnt[k] === 4) four = true;
      else if (cnt[k] === 3) three = true;
      else if (cnt[k] === 2) pairs.push(+k);
    }
    var straight = false;
    if (distinct === 5) {
      if (rs[4] - rs[0] === 4) straight = true;
      else if (rs[0] === 2 && rs[1] === 3 && rs[2] === 4 && rs[3] === 5 && rs[4] === 14) straight = true; // wheel A-2-3-4-5
    }
    if (straight && flush) return rs[0] === 10 ? 'royal' : 'sflush';
    if (four) return 'quads';
    if (three && pairs.length) return 'full';
    if (flush) return 'flush';
    if (straight) return 'straight';
    if (three) return 'trips';
    if (pairs.length === 2) return 'twopair';
    if (pairs.length === 1 && (pairs[0] >= 11 || pairs[0] === 14)) return 'job';
    return null;
  }

  // ---- persistent chips (daily top-up to 200 if broke) ----
  var st = api.load() || {};
  var chips = (typeof st.chips === 'number' && st.chips >= 0) ? Math.floor(st.chips) : 500;
  var bet = (typeof st.bet === 'number') ? Math.max(1, Math.min(5, st.bet)) : 1;
  function persist() { st.chips = chips; st.bet = bet; api.save(st); }
  function topup() {
    var today = new Date().toDateString();
    if (chips < 10 && st.day !== today) {
      chips = 200; st.day = today; persist();
      msg(RU ? 'Ежедневный бонус: 200 💰' : 'Daily top-up: 200 💰', C.good);
    }
  }

  // ---- UI ----
  container.style.background = 'radial-gradient(ellipse at 50% 22%, ' + C.panel2 + ', ' + C.bg + ' 82%)';
  var style = document.createElement('style');
  style.textContent =
    '.vp-wrap{position:absolute;inset:0;display:flex;flex-direction:column;font-family:sans-serif;color:' + C.text + ';overflow:hidden}' +
    '.vp-top{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;font-weight:bold}' +
    '.vp-pay{margin:2px 10px;border-radius:10px;background:' + C.panel + ';padding:5px 10px;font:12px/1.55 sans-serif}' +
    '.vp-row{display:flex;justify-content:space-between;border-radius:5px;padding:0 6px;color:' + C.muted + '}' +
    '.vp-row b{color:' + C.text + '}' +
    '.vp-row.hit{background:' + C.accent + ';color:#fff;animation:vpF .5s ease 3}' +
    '.vp-row.hit b{color:#fff}' +
    '@keyframes vpF{50%{opacity:.35}}' +
    '.vp-cards{display:flex;justify-content:center;padding:6px 2px}' +
    '.vp-slot{margin:0 3px;text-align:center}' +
    '.vp-hold{font:bold 11px sans-serif;color:' + C.accent + ';height:16px;visibility:hidden}' +
    '.vp-slot.held .vp-hold{visibility:visible}' +
    '.vp-card{width:58px;height:82px;border-radius:8px;background:#fff;color:#23252b;position:relative;box-shadow:0 2px 5px rgba(0,0,0,.4);transition:transform .15s ease,opacity .15s ease}' +
    '.vp-card.red{color:#d0342c}' +
    '.vp-card.in{transform:translateY(-20px);opacity:0}' +
    '.vp-slot.held .vp-card{outline:2px solid ' + C.accent + '}' +
    '.vp-card .r{position:absolute;top:4px;left:5px;font:bold 14px/1.05 sans-serif;text-align:center}' +
    '.vp-card .r2{top:auto;left:auto;bottom:4px;right:5px;transform:rotate(180deg)}' +
    '.vp-card .m{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:30px}' +
    '.vp-card.back{background:linear-gradient(135deg,' + C.accent + ' 20%,' + C.panel2 + ')}' +
    '.vp-msg{text-align:center;font:bold 16px sans-serif;min-height:24px;padding:2px}' +
    '.vp-b{padding:11px 14px;border-radius:10px;border:0;background:' + C.panel + ';color:' + C.text + ';font:bold 15px sans-serif;margin:3px;min-width:52px}' +
    '.vp-b:disabled{opacity:.35}' +
    '.vp-b.acc{background:' + C.accent + ';color:#fff;min-width:120px}';
  container.appendChild(style);

  var wrap = document.createElement('div');
  wrap.className = 'vp-wrap';
  var payHtml = '';
  for (var pi = 0; pi < ORDER.length; pi++)
    payHtml += '<div class="vp-row" id="vp_r_' + ORDER[pi] + '"><span>' + NAMES[ORDER[pi]] + '</span><b id="vp_p_' + ORDER[pi] + '"></b></div>';
  wrap.innerHTML =
    '<div class="vp-top"><div id="vp_chips"></div><button class="vp-b" id="vp_out">🏁</button></div>' +
    '<div class="vp-pay">' + payHtml + '</div>' +
    '<div style="flex:1"></div>' +
    '<div class="vp-cards" id="vp_cards"></div>' +
    '<div class="vp-msg" id="vp_msg"></div>' +
    '<div style="text-align:center;padding:2px 8px 12px">' +
    '<button class="vp-b" id="vp_bm">−</button>' +
    '<span id="vp_bet" style="font:bold 15px sans-serif;margin:0 6px"></span>' +
    '<button class="vp-b" id="vp_bp">+</button>' +
    '<button class="vp-b acc" id="vp_deal"></button>' +
    '</div>';
  container.appendChild(wrap);
  function q(id) { return wrap.querySelector('#' + id); }
  var cardsEl = q('vp_cards'), msgEl = q('vp_msg'), dealBtn = q('vp_deal');

  var slots = [], phase = 'ready', cards = [], held = [false, false, false, false, false], deck = [];
  for (var si = 0; si < 5; si++) {
    (function (i) {
      var s = document.createElement('div');
      s.className = 'vp-slot';
      s.innerHTML = '<div class="vp-hold">' + (RU ? 'ДЕРЖУ' : 'HOLD') + '</div><div class="vp-card back"></div>';
      s.addEventListener('click', function () {
        if (phase !== 'held') return;
        held[i] = !held[i];
        s.className = 'vp-slot' + (held[i] ? ' held' : '');
        api.haptic('light');
      });
      cardsEl.appendChild(s);
      slots.push(s);
    })(si);
  }

  function isRed(c) { return c.s === 1 || c.s === 2; }
  function setCard(i, c, animate) {
    var el = slots[i].querySelector('.vp-card');
    var apply = function () {
      el.className = 'vp-card' + (isRed(c) ? ' red' : '');
      el.innerHTML = '<div class="r">' + rkName(c.r) + '<br>' + SU[c.s] + '</div>' +
        '<div class="r r2">' + rkName(c.r) + '<br>' + SU[c.s] + '</div><div class="m">' + SU[c.s] + '</div>';
    };
    if (animate && !LOW) {
      el.classList.add('in');
      setT(function () { apply(); el.classList.remove('in'); }, 60 + i * 70);
    } else apply();
  }
  function msg(s, col) {
    msgEl.textContent = s || '';
    msgEl.style.color = col || C.text;
  }
  function renderChips() {
    q('vp_chips').textContent = '💰 ' + chips;
    api.score(chips);
  }
  var flashRow = null;
  function updatePay() {
    q('vp_bet').textContent = (RU ? 'Ставка ' : 'Bet ') + bet + ' (' + bet * 10 + ')';
    for (var i = 0; i < ORDER.length; i++) q('vp_p_' + ORDER[i]).textContent = PAY[ORDER[i]] * bet * 10;
  }
  function clearFlash() {
    if (flashRow) { flashRow.className = 'vp-row'; flashRow = null; }
  }

  function updateButtons() {
    dealBtn.textContent = phase === 'held' ? (RU ? 'ЗАМЕНА' : 'DRAW') : (RU ? 'СДАТЬ' : 'DEAL');
    q('vp_bm').disabled = q('vp_bp').disabled = phase === 'held';
    dealBtn.disabled = phase === 'ready' && chips < 10;
  }

  function doDeal() {
    topup();
    if (chips < bet * 10) bet = Math.max(1, Math.floor(chips / 10));
    var cost = bet * 10;
    if (chips < cost) {
      msg(RU ? 'Фишки кончились — бонус завтра' : 'Out of chips — top-up tomorrow', C.muted);
      return;
    }
    clearFlash();
    chips -= cost;
    persist();
    renderChips();
    updatePay();
    deck = [];
    for (var s = 0; s < 4; s++) for (var r = 2; r <= 14; r++) deck.push({ r: r, s: s });
    shuffle(deck);
    cards = deck.splice(0, 5);
    held = [false, false, false, false, false];
    for (var i = 0; i < 5; i++) {
      slots[i].className = 'vp-slot';
      setCard(i, cards[i], true);
    }
    phase = 'held';
    msg(RU ? 'Отметь карты и жми ЗАМЕНА' : 'Tap cards to HOLD, then DRAW', C.muted);
    updateButtons();
  }

  function doDraw() {
    for (var i = 0; i < 5; i++) {
      if (!held[i]) {
        cards[i] = deck.pop();
        setCard(i, cards[i], true);
      }
      slots[i].className = 'vp-slot';
    }
    phase = 'ready';
    var key = evalHand(cards);
    var payout = key ? PAY[key] * bet * 10 : 0;
    if (payout > 0) {
      chips += payout;
      msg(NAMES[key] + '  +' + payout, C.good);
      flashRow = q('vp_r_' + key);
      flashRow.className = 'vp-row hit';
      api.haptic(key === 'royal' || key === 'sflush' || key === 'quads' ? 'success' : 'medium');
    } else {
      msg(RU ? 'Нет комбинации' : 'No win', C.muted);
    }
    persist();
    renderChips();
    updateButtons();
  }

  dealBtn.addEventListener('click', function () {
    if (dead || paused) return;
    if (phase === 'ready') doDeal();
    else doDraw();
  });
  q('vp_bm').addEventListener('click', function () { if (phase === 'ready' && bet > 1) { bet--; updatePay(); persist(); } });
  q('vp_bp').addEventListener('click', function () { if (phase === 'ready' && bet < 5) { bet++; updatePay(); persist(); } });
  q('vp_out').addEventListener('click', function () {
    if (phase !== 'ready') return;
    persist();
    api.gameOver(chips, { win: chips > 500 });
  });

  // init
  topup();
  renderChips();
  updatePay();
  updateButtons();
  msg(RU ? 'Сделай ставку и жми СДАТЬ' : 'Set your bet and press DEAL', C.muted);

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
