/* Idle Miner — dig deep, get rich. MG game 'mining'. */
(function () {
'use strict';
MG.register('mining', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var CAP = 8 * 3600 * 1000; // offline cap 8h

  // depth layers: up-to depth, emoji, names, ore value
  var LAYERS = [
    { to: 10,  e: '🟫', en: 'Dirt',    ru: 'Земля',  v: 1 },
    { to: 25,  e: '🪨', en: 'Stone',   ru: 'Камень', v: 3 },
    { to: 60,  e: '⚙️', en: 'Iron',    ru: 'Железо', v: 8 },
    { to: 120, e: '🥇', en: 'Gold',    ru: 'Золото', v: 20 },
    { to: 250, e: '💎', en: 'Diamond', ru: 'Алмаз',  v: 55 },
    { to: 1e9, e: '🔮', en: 'Mythril', ru: 'Мифрил', v: 140 }
  ];
  function layerAt(d) {
    for (var i = 0; i < LAYERS.length; i++) if (d < LAYERS[i].to) return LAYERS[i];
    return LAYERS[LAYERS.length - 1];
  }

  var money = 0, earned = 0, depth = 0, prog = 0;
  var pick = 1, auto = 0, elev = 0, dyn = 0; // levels / purchases
  var timeouts = [];
  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timeouts.indexOf(id);
      if (k >= 0) timeouts.splice(k, 1);
      fn();
    }, ms);
    timeouts.push(id);
    return id;
  }

  // ---------- load + offline earnings ----------
  var welcome = 0;
  var sv = api.load();
  if (sv && typeof sv.money === 'number') {
    money = sv.money || 0;
    depth = sv.depth | 0;
    prog = sv.prog | 0;
    pick = Math.max(1, sv.pick | 0);
    auto = sv.auto | 0;
    elev = sv.elev | 0;
    dyn = sv.dyn | 0;
    if (auto > 0) {
      var away = Math.min(CAP, Math.max(0, Date.now() - (sv.ts || Date.now())));
      welcome = Math.floor(auto * (away / 1000) * layerAt(depth).v * elevMult());
      money += welcome;
    }
  }

  function elevMult() { return 1 + elev * 0.25; }
  function tapGain() { return Math.max(1, Math.floor(layerAt(depth).v * pick * elevMult())); }
  function tapsNeed() { return 10 + depth; }
  function fm(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.floor(n));
  }
  function dol(n) { return '$' + fm(n); }
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
  var moneyEl = el('div', 'font-size:28px;font-weight:bold;color:' + C.good + ';', dol(money));
  hleft.appendChild(moneyEl);
  hleft.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';', api.t('money')));
  var outBtn = el('button', btnCss(C.accent) + 'font-size:12px;', '🏁 ' + (ru ? 'Забрать' : 'Cash out'));
  head.appendChild(hleft);
  head.appendChild(outBtn);
  root.appendChild(head);

  if (welcome > 0) {
    var ban = el('div', 'background:' + C.panel2 + ';border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:13px;color:' + C.good + ';',
      '👋 ' + (ru ? 'С возвращением! Шахтёры добыли: ' : 'Welcome back! Miners dug up: ') + '+' + dol(welcome));
    root.appendChild(ban);
    later(function () { if (ban.parentNode) ban.parentNode.removeChild(ban); }, 8000);
  }

  // depth panel
  var dPan = el('div', 'background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:8px;');
  var dRow = el('div', 'display:flex;justify-content:space-between;font-size:13px;font-weight:bold;');
  var depthEl = el('div', '');
  var layerEl = el('div', 'color:' + C.muted + ';');
  dRow.appendChild(depthEl);
  dRow.appendChild(layerEl);
  dPan.appendChild(dRow);
  var barO = el('div', 'height:8px;border-radius:4px;background:' + C.panel2 + ';margin-top:6px;overflow:hidden;');
  var bar = el('div', 'height:100%;width:0%;background:' + C.accent + ';');
  barO.appendChild(bar);
  dPan.appendChild(barO);
  root.appendChild(dPan);

  // mine wall
  var wall = el('div', 'position:relative;background:' + C.panel2 + ';border-radius:14px;height:170px;margin-bottom:8px;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;');
  var ores = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;font-size:26px;line-height:44px;letter-spacing:14px;text-align:center;opacity:0.75;overflow:hidden;pointer-events:none;');
  wall.appendChild(ores);
  var pickEl = el('div', 'position:absolute;left:50%;top:50%;margin-left:-22px;margin-top:-26px;font-size:44px;transition:transform 90ms;pointer-events:none;transform:rotate(0deg);', '⛏️');
  wall.appendChild(pickEl);
  var hint = el('div', 'position:absolute;left:0;bottom:6px;width:100%;text-align:center;font-size:11px;color:' + C.muted + ';pointer-events:none;',
    ru ? 'Тапай по стене, чтобы копать' : 'Tap the wall to dig');
  wall.appendChild(hint);
  root.appendChild(wall);

  function wallSkin() {
    var L = layerAt(depth), s = '';
    for (var i = 0; i < 20; i++) s += L.e;
    ores.textContent = s;
  }

  var crumbN = 0;
  function crumbs(x, y) {
    if (api.lowEnd || crumbN > 12) return;
    for (var i = 0; i < 4; i++) {
      (function () {
        var c = el('div', 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:5px;height:5px;border-radius:2px;background:' + C.muted + ';pointer-events:none;transition:transform .45s ease-out,opacity .45s;');
        wall.appendChild(c);
        crumbN++;
        var dx = (Math.random() - 0.5) * 70, dy = 30 + Math.random() * 50;
        later(function () { c.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; c.style.opacity = '0'; }, 16);
        later(function () { if (c.parentNode) c.parentNode.removeChild(c); crumbN--; }, 500);
      })();
    }
  }
  function floatText(x, y, txt) {
    if (api.lowEnd) return;
    var f = el('div', 'position:absolute;left:' + (x - 20) + 'px;top:' + (y - 10) + 'px;font-size:13px;font-weight:bold;color:' + C.good + ';pointer-events:none;transition:transform .6s ease-out,opacity .6s;', txt);
    wall.appendChild(f);
    later(function () { f.style.transform = 'translateY(-36px)'; f.style.opacity = '0'; }, 16);
    later(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 650);
  }

  function advance(digs) { // depth progress from digs
    prog += digs;
    var changed = false;
    while (prog >= tapsNeed()) {
      prog -= tapsNeed();
      var was = layerAt(depth);
      depth++;
      changed = true;
      if (layerAt(depth) !== was) api.haptic('success');
    }
    if (changed) wallSkin();
  }

  function gain(n) {
    money += n;
    earned += n;
    api.score(Math.floor(earned));
  }

  function dig(ev) {
    var g = tapGain();
    gain(g);
    advance(1);
    pickEl.style.transform = 'rotate(-55deg)';
    later(function () { pickEl.style.transform = 'rotate(0deg)'; }, 100);
    var r = wall.getBoundingClientRect();
    var x = ev && ev.touches ? ev.touches[0].clientX - r.left : (ev ? ev.clientX - r.left : r.width / 2);
    var y = ev && ev.touches ? ev.touches[0].clientY - r.top : (ev ? ev.clientY - r.top : r.height / 2);
    crumbs(x, y);
    floatText(x, y, '+' + fm(g));
    refresh();
  }
  function onWallDown(ev) { ev.preventDefault(); dig(ev); }
  wall.addEventListener('pointerdown', onWallDown);
  function onKey(e) { if (e.key === ' ' || e.key === 'Enter') { dig(null); e.preventDefault(); } }
  window.addEventListener('keydown', onKey);

  // ---------- shop ----------
  root.appendChild(el('div', 'font-size:12px;font-weight:bold;color:' + C.muted + ';margin:4px 0 6px;', '🛒 ' + (ru ? 'Магазин' : 'Shop')));
  var SHOP = [
    { e: '⛏️', en: 'Pickaxe', ru: 'Кирка', den: 'tap power', dru: 'сила тапа', base: 25,
      lv: function () { return pick; }, act: function () { pick++; } },
    { e: '🤖', en: 'Auto-miner', ru: 'Автошахтёр', den: 'digs/sec', dru: 'ударов/сек', base: 120,
      lv: function () { return auto; }, act: function () { auto++; } },
    { e: '🛗', en: 'Elevator', ru: 'Лифт', den: '+25% income', dru: '+25% дохода', base: 400,
      lv: function () { return elev; }, act: function () { elev++; } },
    { e: '🧨', en: 'Dynamite', ru: 'Динамит', den: '+5 depth now', dru: '+5 глубины сразу', base: 100,
      lv: function () { return dyn; }, act: function () { dyn++; depth += 5; prog = 0; wallSkin(); } }
  ];
  function cost(it) { return Math.ceil(it.base * Math.pow(1.18, it.lv())); }
  var rows = [];
  SHOP.forEach(function (it) {
    var row = el('div', 'display:flex;align-items:center;background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:6px;');
    row.appendChild(el('div', 'font-size:24px;margin-right:8px;', it.e));
    var mid = el('div', 'flex:1;min-width:0;');
    var nm = el('div', 'font-size:13px;font-weight:bold;');
    var ds = el('div', 'font-size:11px;color:' + C.muted + ';', ru ? it.dru : it.den);
    mid.appendChild(nm);
    mid.appendChild(ds);
    row.appendChild(mid);
    var b = el('button', btnCss(C.accent) + 'font-size:12px;min-width:86px;');
    row.appendChild(b);
    root.appendChild(row);
    b.addEventListener('click', function () {
      var c2 = cost(it);
      if (money < c2) return;
      money -= c2;
      it.act();
      api.haptic(it.e === '🧨' ? 'medium' : 'success');
      persist();
      refresh();
    });
    rows.push({ it: it, nm: nm, b: b });
  });

  var statEl = el('div', 'font-size:11px;color:' + C.muted + ';margin:2px 0 12px;text-align:center;');
  root.appendChild(statEl);

  function refresh() {
    moneyEl.textContent = dol(money);
    var L = layerAt(depth);
    depthEl.textContent = '⬇ ' + depth + (ru ? ' м' : ' m');
    layerEl.textContent = L.e + ' ' + (ru ? L.ru : L.en) + ' · ' + dol(L.v) + (ru ? '/руда' : '/ore');
    bar.style.width = Math.min(100, prog / tapsNeed() * 100).toFixed(1) + '%';
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k], c2 = cost(r.it);
      r.nm.textContent = (ru ? r.it.ru : r.it.en) + (r.it.e === '🧨' ? '' : ' ' + (ru ? 'ур.' : 'lv.') + r.it.lv());
      r.b.textContent = api.t('buy') + ' ' + dol(c2);
      dis(r.b, money < c2);
    }
    statEl.textContent = '⛏️ +' + dol(tapGain()) + (ru ? '/тап · ' : '/tap · ') +
      '🤖 ' + fm(auto) + (ru ? '/сек · ' : '/sec · ') + '🛗 ×' + elevMult().toFixed(2);
  }

  // ---------- loop ----------
  var paused = false, lastT = Date.now(), saveAcc = 0, autoAcc = 0;
  var iv = setInterval(function () {
    if (paused) return;
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    if (auto > 0) {
      autoAcc += auto * dt / 1000;
      var digs = Math.floor(autoAcc);
      if (digs > 0) {
        autoAcc -= digs;
        gain(Math.max(digs, Math.floor(digs * layerAt(depth).v * elevMult())));
        advance(digs);
      }
    }
    refresh();
    saveAcc += dt;
    if (saveAcc > 10000) { saveAcc = 0; persist(); }
  }, api.lowEnd ? 400 : 200);

  function persist() {
    api.save({ money: money, depth: depth, prog: prog, pick: pick, auto: auto, elev: elev, dyn: dyn, ts: Date.now() });
  }

  outBtn.addEventListener('click', function () {
    persist();
    api.haptic('success');
    api.gameOver(Math.floor(earned));
  });

  api.score(0);
  wallSkin();
  refresh();

  return {
    destroy: function () {
      clearInterval(iv);
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      timeouts.length = 0;
      window.removeEventListener('keydown', onKey);
      wall.removeEventListener('pointerdown', onWallDown);
      persist();
    },
    pause: function () { paused = true; persist(); },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
