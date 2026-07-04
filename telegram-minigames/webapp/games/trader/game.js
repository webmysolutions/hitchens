/* Market Trader — buy low, sell high over 30 days. MG game 'trader'. */
(function () {
'use strict';
MG.register('trader', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var START = 1000, DAYS = 30;
  var HIST = api.lowEnd ? 6 : 10; // sparkline points
  var SC = api.lowEnd ? 1 : 2;    // sparkline canvas scale

  var A = [
    { e: '🌾', en: 'Wheat', ru: 'Пшеница', p0: 25, v: 0.12 },
    { e: '⛽', en: 'Oil', ru: 'Нефть', p0: 60, v: 0.18 },
    { e: '🪙', en: 'Gold', ru: 'Золото', p0: 180, v: 0.08 },
    { e: '📱', en: 'Tech', ru: 'Техно', p0: 320, v: 0.22 },
    { e: '🪵', en: 'Wood', ru: 'Дерево', p0: 15, v: 0.10 }
  ];
  var EV = [
    { a: 0, m: 0.35, en: '📰 Drought! Wheat +35%', ru: '📰 Засуха! Пшеница +35%' },
    { a: 0, m: -0.30, en: '📰 Record harvest! Wheat -30%', ru: '📰 Рекордный урожай! Пшеница -30%' },
    { a: 1, m: 0.40, en: '📰 Supply cuts! Oil +40%', ru: '📰 Сокращение добычи! Нефть +40%' },
    { a: 1, m: -0.25, en: '📰 Oil glut! Oil -25%', ru: '📰 Переизбыток! Нефть -25%' },
    { a: 2, m: 0.25, en: '📰 Market panic! Gold +25%', ru: '📰 Паника на рынках! Золото +25%' },
    { a: 2, m: -0.18, en: '📰 Markets calm. Gold -18%', ru: '📰 Рынки успокоились. Золото -18%' },
    { a: 3, m: 0.45, en: '📰 AI boom! Tech +45%', ru: '📰 Бум ИИ! Техно +45%' },
    { a: 3, m: -0.35, en: '📰 Tech bubble pops! Tech -35%', ru: '📰 Пузырь лопнул! Техно -35%' },
    { a: 4, m: 0.30, en: '📰 Building boom! Wood +30%', ru: '📰 Стройка века! Дерево +30%' },
    { a: 4, m: -0.25, en: '📰 Cheap imports! Wood -25%', ru: '📰 Дешёвый импорт! Дерево -25%' }
  ];

  var cash, day, hold, prices, hist, news, over = false;
  var sv = api.load();
  if (sv && sv.day && sv.prices) { // resume unfinished run
    cash = sv.cash;
    day = Math.min(DAYS, sv.day);
    hold = sv.hold || [0, 0, 0, 0, 0];
    prices = sv.prices;
    hist = (sv.hist || prices.map(function (p) { return [p]; })).map(function (h) { return h.slice(-HIST); });
    news = sv.news || '';
  } else {
    cash = START;
    day = 1;
    hold = [0, 0, 0, 0, 0];
    news = '';
    prices = A.map(function (a) { return a.p0; });
    hist = prices.map(function (p) { return [p]; });
  }

  // ---------- helpers ----------
  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }
  function dis(b, d) { b.disabled = d; b.style.opacity = d ? '0.4' : '1'; }
  function pf(p) { return p >= 1000 ? p.toFixed(0) : p >= 100 ? p.toFixed(1) : p.toFixed(2); }
  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function pv() {
    var t = cash;
    for (var i = 0; i < 5; i++) t += hold[i] * prices[i];
    return t;
  }
  function score() { return Math.max(0, Math.round(pv() - START)); }
  function mkBtn(txt, bg) {
    return el('button', 'flex:1;border:0;border-radius:8px;padding:6px 2px;font-size:11px;font-weight:bold;cursor:pointer;background:' + bg + ';color:' + C.bg + ';', txt);
  }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:10px;font-family:sans-serif;color:' + C.text + ';');
  container.appendChild(root);

  var head = el('div', 'background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:8px;');
  var h1 = el('div', 'display:flex;justify-content:space-between;align-items:baseline;');
  var cashEl = el('span', 'font-size:16px;font-weight:bold;');
  var pvEl = el('span', 'font-size:16px;font-weight:bold;color:' + C.accent + ';');
  h1.appendChild(cashEl);
  h1.appendChild(pvEl);
  var h2 = el('div', 'display:flex;justify-content:space-between;font-size:12px;color:' + C.muted + ';margin-top:2px;');
  var dayEl = el('span', '');
  var profEl = el('span', 'font-weight:bold;');
  h2.appendChild(dayEl);
  h2.appendChild(profEl);
  var tickEl = el('div', 'font-size:12px;margin-top:6px;min-height:15px;color:' + C.accent + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
  head.appendChild(h1);
  head.appendChild(h2);
  head.appendChild(tickEl);
  root.appendChild(head);

  var rows = [];
  A.forEach(function (a, i) {
    var row = el('div', 'background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:8px;');
    var l1 = el('div', 'display:flex;align-items:baseline;gap:6px;');
    l1.appendChild(el('span', 'font-size:18px;', a.e));
    l1.appendChild(el('span', 'font-weight:bold;font-size:14px;flex:1;', ru ? a.ru : a.en));
    var pr = el('span', 'font-size:14px;font-weight:bold;');
    var ch = el('span', 'font-size:11px;min-width:48px;text-align:right;');
    l1.appendChild(pr);
    l1.appendChild(ch);
    var l2 = el('div', 'display:flex;align-items:center;gap:8px;margin-top:4px;');
    var cv = document.createElement('canvas');
    cv.width = 64 * SC;
    cv.height = 26 * SC;
    cv.style.cssText = 'width:64px;height:26px;flex:none;';
    var q = el('span', 'font-size:12px;color:' + C.muted + ';flex:1;text-align:right;');
    l2.appendChild(cv);
    l2.appendChild(q);
    var l3 = el('div', 'display:flex;gap:6px;margin-top:6px;');
    var b1 = mkBtn(api.t('buy') + ' 1', C.good);
    var bm = mkBtn(ru ? 'макс' : 'max', C.good);
    var s1 = mkBtn(api.t('sell') + ' 1', C.bad);
    var sa = mkBtn(ru ? 'всё' : 'all', C.bad);
    l3.appendChild(b1); l3.appendChild(bm); l3.appendChild(s1); l3.appendChild(sa);
    row.appendChild(l1);
    row.appendChild(l2);
    row.appendChild(l3);
    root.appendChild(row);
    b1.addEventListener('click', function () { buy(i, 1); });
    bm.addEventListener('click', function () { buy(i, -1); });
    s1.addEventListener('click', function () { sell(i, 1); });
    sa.addEventListener('click', function () { sell(i, -1); });
    rows.push({ pr: pr, ch: ch, cv: cv, q: q, b1: b1, bm: bm, s1: s1, sa: sa });
  });

  var nextB = el('button', 'width:100%;border:0;border-radius:12px;padding:13px;font-size:16px;font-weight:bold;cursor:pointer;margin-bottom:16px;background:' + C.accent + ';color:' + C.bg + ';');
  root.appendChild(nextB);
  nextB.addEventListener('click', nextDay);

  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') { nextDay(); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);

  // ---------- trading ----------
  function buy(i, q) {
    if (over) return;
    var p = prices[i], max = Math.floor(cash / p);
    if (q < 0 || q > max) q = max;
    if (q <= 0) return;
    cash -= q * p;
    hold[i] += q;
    api.haptic('light');
    render();
  }
  function sell(i, q) {
    if (over) return;
    if (q < 0 || q > hold[i]) q = hold[i];
    if (q <= 0) return;
    cash += q * prices[i];
    hold[i] -= q;
    api.haptic('light');
    render();
  }

  function nextDay() {
    if (over) return;
    if (day >= DAYS) { end(); return; }
    day++;
    news = '';
    var i;
    for (i = 0; i < 5; i++) { // bounded random walk
      prices[i] = clamp(prices[i] * (1 + (Math.random() * 2 - 1) * A[i].v), A[i].p0 * 0.35, A[i].p0 * 4);
    }
    if (Math.random() < 0.35) { // news event
      var e = EV[(Math.random() * EV.length) | 0];
      prices[e.a] = clamp(prices[e.a] * (1 + e.m), A[e.a].p0 * 0.35, A[e.a].p0 * 4);
      news = ru ? e.ru : e.en;
      api.haptic('medium');
    } else {
      api.haptic('light');
    }
    for (i = 0; i < 5; i++) {
      hist[i].push(prices[i]);
      if (hist[i].length > HIST) hist[i].shift();
    }
    persist();
    render();
  }

  function end() {
    over = true;
    var p = pv(), s = score();
    api.save(null); // single-sitting game: clear mid-game save
    api.haptic(p > START ? 'success' : 'error');
    api.gameOver(s, { win: p > START });
  }

  // ---------- render ----------
  function spark(i) {
    var h = hist[i], cv = rows[i].cv, g = cv.getContext('2d');
    var w = cv.width, ht = cv.height;
    g.clearRect(0, 0, w, ht);
    if (h.length < 2) return;
    var mn = Math.min.apply(null, h), mx = Math.max.apply(null, h);
    var sp = (mx - mn) || 1;
    g.strokeStyle = h[h.length - 1] >= h[0] ? C.good : C.bad;
    g.lineWidth = 1.5 * SC;
    g.lineJoin = 'round';
    g.beginPath();
    for (var j = 0; j < h.length; j++) {
      var x = 2 * SC + j / (h.length - 1) * (w - 4 * SC);
      var y = ht - 3 * SC - (h[j] - mn) / sp * (ht - 6 * SC);
      if (j) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }

  function render() {
    var p = pv();
    cashEl.textContent = '💵 $' + pf(cash);
    pvEl.textContent = '💼 $' + pf(p);
    dayEl.textContent = '📅 ' + api.t('day') + ' ' + day + '/' + DAYS;
    var d = p - START;
    profEl.textContent = (d >= 0 ? '+$' : '-$') + pf(Math.abs(d));
    profEl.style.color = d >= 0 ? C.good : C.bad;
    tickEl.textContent = news || (ru ? '📈 Рынки открыты…' : '📈 Markets are open…');
    nextB.textContent = day >= DAYS ? '🏁 ' + (ru ? 'Подвести итоги' : 'Finish') : (ru ? 'Следующий день ▶' : 'Next day ▶');
    for (var i = 0; i < 5; i++) {
      var r = rows[i], h = hist[i];
      r.pr.textContent = '$' + pf(prices[i]);
      var prev = h.length > 1 ? h[h.length - 2] : prices[i];
      var chg = (prices[i] / prev - 1) * 100;
      r.ch.textContent = (chg >= 0 ? '▲' : '▼') + Math.abs(chg).toFixed(1) + '%';
      r.ch.style.color = chg >= 0 ? C.good : C.bad;
      r.q.textContent = '×' + hold[i] + (hold[i] > 0 ? ' = $' + pf(hold[i] * prices[i]) : '');
      dis(r.b1, cash < prices[i]);
      dis(r.bm, cash < prices[i]);
      dis(r.s1, hold[i] <= 0);
      dis(r.sa, hold[i] <= 0);
      spark(i);
    }
    api.score(score());
  }

  function persist() {
    if (over) return;
    api.save({ day: day, cash: cash, hold: hold, prices: prices, hist: hist, news: news });
  }

  persist();
  render();

  return {
    destroy: function () {
      window.removeEventListener('keydown', onKey);
      persist();
    },
    pause: function () { persist(); },
    resume: function () {}
  };
});
})();
