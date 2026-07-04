/* Cookie Empire — cookie-style clicker. MG game 'clicker'. */
(function () {
'use strict';
MG.register('clicker', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var LOW = api.lowEnd;
  var CAP = 8 * 3600 * 1000; // offline cap 8h
  var THR = [10, 25, 50];    // upgrade unlock thresholds (building count)

  var BLD = [
    { e: '👆', en: 'Helper', ru: 'Помощник', c: 15, cps: 0.5 },
    { e: '🥣', en: 'Bakery', ru: 'Пекарня', c: 100, cps: 3 },
    { e: '🏭', en: 'Factory', ru: 'Завод', c: 1100, cps: 20 },
    { e: '🚚', en: 'Delivery', ru: 'Доставка', c: 12000, cps: 120 },
    { e: '🏦', en: 'Bank', ru: 'Банк', c: 130000, cps: 850 },
    { e: '🛸', en: 'Lab', ru: 'Лаборатория', c: 1400000, cps: 6000 }
  ];

  var st = [], i;
  for (i = 0; i < BLD.length; i++) st.push({ n: 0, u: 0 });
  var cookies = 0, earned = 0, frenzy = 0;
  var goldWait = 60000 + Math.random() * 60000, goldLife = 0;
  var milestone = 1000;

  function bcps(k) { return BLD[k].cps * st[k].n * Math.pow(2, st[k].u); }
  function totalCps() { var s = 0; for (var k = 0; k < BLD.length; k++) s += bcps(k); return s; }
  function cost(k) { return Math.ceil(BLD[k].c * Math.pow(1.15, st[k].n)); }
  function upCost(k) { return Math.ceil(BLD[k].c * 40 * Math.pow(12, st[k].u)); }
  function clickPow() { return Math.max(1, Math.floor(1 + totalCps() * 0.05)) * (frenzy > 0 ? 7 : 1); }

  // ---------- load + offline earnings ----------
  var welcome = 0;
  var sv = api.load();
  if (sv && sv.b) {
    cookies = sv.c || 0;
    for (i = 0; i < BLD.length && i < sv.b.length; i++) {
      st[i].n = sv.b[i][0] | 0;
      st[i].u = sv.b[i][1] | 0;
    }
    var away = Math.min(CAP, Math.max(0, Date.now() - (sv.ts || Date.now())));
    welcome = Math.floor(totalCps() * away / 1000);
    cookies += welcome;
  }

  // ---------- helpers ----------
  function fm(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.floor(n));
  }
  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }
  function dis(b, d) { b.disabled = d; b.style.opacity = d ? '0.4' : '1'; }
  var btnCss = 'border:0;border-radius:10px;padding:7px 9px;font-weight:bold;cursor:pointer;font-size:12px;';

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:10px;font-family:sans-serif;color:' + C.text + ';');
  container.appendChild(root);
  if (!LOW) {
    var styleTag = document.createElement('style');
    styleTag.textContent = '@keyframes ckgold{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}';
    container.appendChild(styleTag);
  }

  var head = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;');
  var hleft = el('div', 'min-width:0;');
  var moneyEl = el('div', 'font-size:28px;font-weight:bold;color:' + C.accent + ';', '🍪 0');
  var cpsEl = el('div', 'font-size:12px;color:' + C.muted + ';', '');
  hleft.appendChild(moneyEl);
  hleft.appendChild(cpsEl);
  var outBtn = el('button', btnCss + 'background:' + C.accent + ';color:' + C.bg + ';', '🏁 ' + (ru ? 'Завершить' : 'Cash out'));
  head.appendChild(hleft);
  head.appendChild(outBtn);
  root.appendChild(head);

  var frenzyEl = el('div', 'display:none;background:' + C.panel2 + ';border-radius:10px;padding:6px 10px;margin-bottom:6px;font-size:13px;font-weight:bold;color:' + C.accent + ';');
  root.appendChild(frenzyEl);

  var banT = 0;
  if (welcome > 0) {
    var ban = el('div', 'background:' + C.panel2 + ';border-radius:10px;padding:8px 10px;margin-bottom:6px;font-size:13px;color:' + C.good + ';',
      '👋 ' + (ru ? 'С возвращением! Испечено офлайн: ' : 'Welcome back! Baked while away: ') + '+' + fm(welcome) + ' 🍪');
    root.appendChild(ban);
    banT = setTimeout(function () { if (ban.parentNode) ban.parentNode.removeChild(ban); }, 8000);
  }

  // big cookie area
  var area = el('div', 'position:relative;height:180px;display:flex;align-items:center;justify-content:center;margin-bottom:8px;overflow:hidden;border-radius:14px;background:' + C.panel + ';');
  var cookie = el('div', 'font-size:96px;line-height:1;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;transition:transform .1s;will-change:transform;', '🍪');
  area.appendChild(cookie);
  var gold = el('div', 'display:none;position:absolute;font-size:44px;cursor:pointer;user-select:none;-webkit-user-select:none;z-index:3;' + (LOW ? '' : 'animation:ckgold 1s infinite;'), '🌟');
  area.appendChild(gold);
  root.appendChild(area);

  // pooled floating "+N" labels
  var pool = [], pi = 0;
  for (i = 0; i < (LOW ? 4 : 10); i++) {
    var fl = el('div', 'position:absolute;left:0;top:0;font-weight:bold;font-size:20px;color:' + C.good + ';pointer-events:none;opacity:0;z-index:2;will-change:transform,opacity;');
    area.appendChild(fl);
    pool.push(fl);
  }
  function floatUp(x, y, txt) {
    var f = pool[pi++ % pool.length];
    f.textContent = txt;
    f.style.transition = 'none';
    f.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = LOW ? 'opacity .5s linear' : 'transform .7s ease-out,opacity .7s linear';
    if (!LOW) f.style.transform = 'translate(' + x + 'px,' + (y - 70) + 'px)';
    f.style.opacity = '0';
  }

  root.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';margin-bottom:6px;',
    ru ? 'Жми на печеньку! Здания пекут сами. Лови 🌟 — производство ×7!' : 'Tap the cookie! Buildings bake for you. Catch 🌟 for ×7 production!'));

  // building rows
  var rows = [];
  BLD.forEach(function (bz, idx) {
    var row = el('div', 'display:flex;align-items:center;background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:6px;');
    row.appendChild(el('div', 'font-size:24px;margin-right:8px;', bz.e));
    var mid = el('div', 'flex:1;min-width:0;');
    var nameEl = el('div', 'font-size:13px;font-weight:bold;');
    var subEl = el('div', 'font-size:11px;color:' + C.muted + ';');
    mid.appendChild(nameEl);
    mid.appendChild(subEl);
    row.appendChild(mid);
    var upB = el('button', btnCss + 'background:' + C.good + ';color:' + C.bg + ';margin-right:6px;display:none;');
    var buyB = el('button', btnCss + 'background:' + C.accent + ';color:' + C.bg + ';');
    row.appendChild(upB);
    row.appendChild(buyB);
    root.appendChild(row);

    buyB.addEventListener('click', function () {
      var c2 = cost(idx);
      if (cookies < c2) return;
      cookies -= c2;
      st[idx].n++;
      api.haptic(st[idx].n === 1 ? 'success' : 'light');
      stat(idx);
    });
    upB.addEventListener('click', function () {
      var s = st[idx];
      if (s.u >= THR.length || s.n < THR[s.u] || cookies < upCost(idx)) return;
      cookies -= upCost(idx);
      s.u++;
      api.haptic('success');
      stat(idx);
    });
    rows.push({ nameEl: nameEl, subEl: subEl, buyB: buyB, upB: upB });
    stat(idx);
  });

  function stat(idx) { // texts that only change on purchase
    var bz = BLD[idx], s = st[idx], r = rows[idx];
    r.nameEl.textContent = (ru ? bz.ru : bz.en) + ' ×' + s.n;
    r.subEl.textContent = '+' + fm(bcps(idx)) + '/' + (ru ? 'с' : 's') + (s.u > 0 ? ' · ⬆' + s.u : '');
    r.buyB.textContent = api.t('buy') + ' ' + fm(cost(idx)) + '🍪';
    if (s.u < THR.length && s.n >= THR[s.u]) {
      r.upB.style.display = 'block';
      r.upB.textContent = '×2 ' + fm(upCost(idx)) + '🍪';
    } else {
      r.upB.style.display = 'none';
    }
    cpsEl.textContent = '+' + fm(totalCps()) + ' ' + (ru ? 'в сек' : 'per sec') + (frenzy > 0 ? ' ×7' : '');
  }

  function refresh() {
    moneyEl.textContent = '🍪 ' + fm(cookies);
    for (var k = 0; k < BLD.length; k++) {
      var s = st[k], r = rows[k];
      dis(r.buyB, cookies < cost(k));
      if (s.u < THR.length && s.n >= THR[s.u]) dis(r.upB, cookies < upCost(k));
    }
  }

  // ---------- cookie tap ----------
  var sqT = 0;
  cookie.addEventListener('pointerdown', function (e) {
    var gain = clickPow();
    cookies += gain;
    earned += gain;
    api.score(Math.floor(earned));
    if (earned >= milestone) { api.haptic('success'); milestone *= 10; }
    var rc = area.getBoundingClientRect();
    floatUp((e.clientX || rc.left + rc.width / 2) - rc.left - 10, (e.clientY || rc.top + 60) - rc.top - 20, '+' + fm(gain));
    cookie.style.transform = 'scale(1.18,0.82)';
    clearTimeout(sqT);
    sqT = setTimeout(function () { cookie.style.transform = 'scale(1)'; }, 90);
    e.preventDefault();
  });

  // ---------- golden cookie ----------
  gold.addEventListener('pointerdown', function (e) {
    if (goldLife <= 0) return;
    goldLife = 0;
    gold.style.display = 'none';
    frenzy = 20000;
    goldWait = 60000 + Math.random() * 60000;
    api.haptic('success');
    var rc = area.getBoundingClientRect();
    floatUp(rc.width / 2 - 20, rc.height / 2, '×7!');
    e.preventDefault();
    e.stopPropagation();
  });
  function spawnGold() {
    goldLife = 10000;
    gold.style.left = (8 + Math.random() * 74) + '%';
    gold.style.top = (8 + Math.random() * 55) + '%';
    gold.style.display = 'block';
  }

  // ---------- loop ----------
  var paused = false, lastT = Date.now(), saveAcc = 0;
  var iv = setInterval(function () {
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    if (paused) return;
    var gain = totalCps() * (frenzy > 0 ? 7 : 1) * dt / 1000;
    if (gain > 0) {
      cookies += gain;
      earned += gain;
      api.score(Math.floor(earned));
      if (earned >= milestone) { api.haptic('success'); milestone *= 10; }
    }
    if (frenzy > 0) {
      frenzy -= dt;
      frenzyEl.style.display = 'block';
      frenzyEl.textContent = '🌟 ×7! ' + Math.max(0, Math.ceil(frenzy / 1000)) + (ru ? 'с' : 's');
      if (frenzy <= 0) { frenzyEl.style.display = 'none'; cpsEl.textContent = '+' + fm(totalCps()) + ' ' + (ru ? 'в сек' : 'per sec'); }
    } else if (goldLife > 0) {
      goldLife -= dt;
      if (goldLife <= 0) { gold.style.display = 'none'; goldWait = 60000 + Math.random() * 60000; }
    } else {
      goldWait -= dt;
      if (goldWait <= 0) spawnGold();
    }
    refresh();
    saveAcc += dt;
    if (saveAcc > 10000) { saveAcc = 0; persist(); }
  }, LOW ? 200 : 100);

  function persist() {
    api.save({
      c: cookies,
      ts: Date.now(),
      b: st.map(function (s) { return [s.n, s.u]; })
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
      if (banT) clearTimeout(banT);
      if (sqT) clearTimeout(sqT);
      persist();
    },
    pause: function () { paused = true; persist(); },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
