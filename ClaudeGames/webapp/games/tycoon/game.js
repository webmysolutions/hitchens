/* Idle Tycoon — build a business empire. MG game 'tycoon'. */
(function () {
'use strict';
MG.register('tycoon', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var CAP = 8 * 3600 * 1000; // offline cap: 8 hours

  // tier: emoji, names, base cost, income/cycle (per unit), cycle ms, manager cost
  var BIZ = [
    { e: '🍋', en: 'Lemonade', ru: 'Лимонад', c: 4, inc: 1, t: 1000, mg: 100 },
    { e: '🌭', en: 'Hotdog stand', ru: 'Хот-доги', c: 60, inc: 12, t: 3000, mg: 1200 },
    { e: '☕', en: 'Coffee shop', ru: 'Кофейня', c: 720, inc: 100, t: 6000, mg: 12000 },
    { e: '🍕', en: 'Pizzeria', ru: 'Пиццерия', c: 8640, inc: 800, t: 12000, mg: 120000 },
    { e: '🏪', en: 'Supermarket', ru: 'Супермаркет', c: 103680, inc: 6000, t: 24000, mg: 1200000 },
    { e: '🏭', en: 'Factory', ru: 'Завод', c: 1244160, inc: 48000, t: 48000, mg: 12000000 },
    { e: '🚀', en: 'Space corp', ru: 'Космо-корп', c: 15000000, inc: 400000, t: 96000, mg: 120000000 }
  ];

  var money = 10, earned = 0, i;
  var st = []; // per tier: n owned, m manager, r running, p progress ms
  for (i = 0; i < BIZ.length; i++) st.push({ n: 0, m: false, r: false, p: 0 });

  // ---------- load + offline earnings ----------
  var welcome = 0;
  var sv = api.load();
  if (sv && sv.b) {
    money = sv.money || 0;
    var away = Math.min(CAP, Math.max(0, Date.now() - (sv.ts || Date.now())));
    for (i = 0; i < BIZ.length; i++) {
      var b = sv.b[i];
      if (!b) continue;
      var s = st[i];
      s.n = b.n | 0; s.m = !!b.m; s.r = !!b.r; s.p = b.p || 0;
      if (s.n > 0 && s.m) { // automated: full offline income
        s.r = true;
        var tot = s.p + away;
        welcome += Math.floor(tot / BIZ[i].t) * BIZ[i].inc * s.n;
        s.p = tot % BIZ[i].t;
      } else if (s.r) { // manual cycle in flight: at most finishes once
        s.p += away;
        if (s.p >= BIZ[i].t) { welcome += BIZ[i].inc * s.n; s.p = 0; s.r = false; }
      }
    }
    money += welcome;
  }

  // ---------- helpers ----------
  function fm(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.floor(n));
  }
  function dol(n) { return '$' + fm(n); }
  function cost(k) { return Math.ceil(BIZ[k].c * Math.pow(1.15, st[k].n)); }
  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }
  function btnCss(bg, fg) {
    return 'border:0;border-radius:10px;padding:8px 10px;font-weight:bold;cursor:pointer;background:' + bg + ';color:' + (fg || C.bg) + ';';
  }
  function dis(b, d) { b.disabled = d; b.style.opacity = d ? '0.45' : '1'; }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:10px;font-family:sans-serif;color:' + C.text + ';');
  container.appendChild(root);

  var head = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;');
  var hleft = el('div', '');
  var moneyEl = el('div', 'font-size:30px;font-weight:bold;color:' + C.good + ';', dol(money));
  hleft.appendChild(moneyEl);
  hleft.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';', api.t('money')));
  var outBtn = el('button', btnCss(C.accent) + 'font-size:12px;', '🏁 ' + (ru ? 'Забрать выручку' : 'Cash out'));
  head.appendChild(hleft);
  head.appendChild(outBtn);
  root.appendChild(head);

  var wt = 0;
  if (welcome > 0) {
    var ban = el('div', 'background:' + C.panel2 + ';border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:13px;color:' + C.good + ';',
      '👋 ' + (ru ? 'С возвращением! Заработано офлайн: ' : 'Welcome back! Earned while away: ') + '+' + dol(welcome));
    root.appendChild(ban);
    wt = setTimeout(function () { if (ban.parentNode) ban.parentNode.removeChild(ban); }, 8000);
  }

  root.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';margin-bottom:8px;',
    ru ? 'Нажми на бизнес — запустишь цикл. 👔 менеджер работает сам.' : 'Tap a business to run a cycle. 👔 manager automates it.'));

  var rows = [];
  BIZ.forEach(function (bz, idx) {
    var row = el('div', 'background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:8px;');
    var top = el('div', 'display:flex;align-items:center;cursor:pointer;');
    top.appendChild(el('div', 'font-size:26px;margin-right:8px;', bz.e));
    var mid = el('div', 'flex:1;min-width:0;');
    var nameEl = el('div', 'font-size:14px;font-weight:bold;');
    var incEl = el('div', 'font-size:11px;color:' + C.muted + ';');
    mid.appendChild(nameEl);
    mid.appendChild(incEl);
    top.appendChild(mid);
    var barO = el('div', 'height:6px;border-radius:3px;background:' + C.panel2 + ';margin:6px 0;overflow:hidden;');
    var bar = el('div', 'height:100%;width:0%;background:' + C.accent + ';');
    barO.appendChild(bar);
    var btns = el('div', 'display:flex;gap:6px;');
    var buyB = el('button', btnCss(C.accent) + 'flex:1.4;font-size:12px;');
    var mgrB = el('button', btnCss(C.panel2, C.text) + 'flex:1;font-size:12px;');
    btns.appendChild(buyB);
    btns.appendChild(mgrB);
    row.appendChild(top);
    row.appendChild(barO);
    row.appendChild(btns);
    root.appendChild(row);

    top.addEventListener('click', function () {
      var s = st[idx];
      if (s.n > 0 && !s.r) { s.r = true; s.p = 0; api.haptic('light'); refresh(); }
    });
    buyB.addEventListener('click', function () {
      var c2 = cost(idx);
      if (money < c2) return;
      money -= c2;
      st[idx].n++;
      if (st[idx].m) st[idx].r = true;
      api.haptic(st[idx].n === 1 ? 'success' : 'light');
      stat(idx);
      refresh();
    });
    mgrB.addEventListener('click', function () {
      var s = st[idx];
      if (s.m || money < bz.mg) return;
      money -= bz.mg;
      s.m = true;
      if (s.n > 0) { s.r = true; }
      api.haptic('success');
      stat(idx);
      refresh();
    });
    rows.push({ nameEl: nameEl, incEl: incEl, bar: bar, buyB: buyB, mgrB: mgrB });
    stat(idx);
  });

  function stat(idx) { // texts that change only on purchases
    var bz = BIZ[idx], s = st[idx], r = rows[idx];
    r.nameEl.textContent = (ru ? bz.ru : bz.en) + ' ×' + s.n;
    r.incEl.textContent = dol(bz.inc * Math.max(1, s.n)) + ' / ' + (bz.t / 1000) + (ru ? 'с' : 's') + (s.m ? ' · 👔' : '');
    r.buyB.textContent = api.t('buy') + ' ' + dol(cost(idx));
    r.mgrB.textContent = s.m ? '👔 ✓' : '👔 ' + dol(bz.mg);
  }

  function refresh() {
    moneyEl.textContent = dol(money);
    for (var k = 0; k < BIZ.length; k++) {
      var s = st[k], r = rows[k];
      r.bar.style.width = s.r ? Math.min(100, s.p / BIZ[k].t * 100).toFixed(1) + '%' : '0%';
      dis(r.buyB, money < cost(k));
      dis(r.mgrB, s.m || money < BIZ[k].mg);
    }
  }

  // ---------- loop ----------
  var paused = false, lastT = Date.now(), saveAcc = 0;
  var iv = setInterval(function () {
    if (paused) return;
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    var gain = 0;
    for (var k = 0; k < BIZ.length; k++) {
      var s = st[k];
      if (!s.r || s.n <= 0) continue;
      s.p += dt;
      while (s.p >= BIZ[k].t) {
        gain += BIZ[k].inc * s.n;
        if (s.m) { s.p -= BIZ[k].t; }
        else { s.p = 0; s.r = false; }
      }
    }
    if (gain > 0) {
      money += gain;
      earned += gain;
      api.score(Math.floor(earned));
    }
    refresh();
    saveAcc += dt;
    if (saveAcc > 10000) { saveAcc = 0; persist(); }
  }, api.lowEnd ? 200 : 100);

  function persist() {
    api.save({
      money: money,
      ts: Date.now(),
      b: st.map(function (s) { return { n: s.n, m: s.m ? 1 : 0, r: s.r ? 1 : 0, p: s.p }; })
    });
  }

  outBtn.addEventListener('click', function () {
    persist();
    api.haptic('success');
    api.gameOver(Math.floor(earned));
  });

  api.score(0);
  refresh();

  return {
    destroy: function () {
      clearInterval(iv);
      if (wt) clearTimeout(wt);
      persist();
    },
    pause: function () { paused = true; persist(); },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
