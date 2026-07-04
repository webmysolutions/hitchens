/* Little Farm — plant, grow, harvest, sell. MG game 'farm'. */
(function () {
'use strict';
MG.register('farm', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var CAP = 8 * 3600 * 1000; // crops keep growing offline, capped at 8h
  var MAXP = 12;
  var PLOTP = [100, 250, 600, 1500, 3500, 8000]; // price of plot 7..12

  // crop: emoji, names, seed cost, sell price (~2.2-3x), grow seconds
  var CROPS = [
    { e: '🥕', en: 'Carrot', ru: 'Морковь', seed: 5, sell: 12, t: 15 },
    { e: '🌽', en: 'Corn', ru: 'Кукуруза', seed: 12, sell: 30, t: 30 },
    { e: '🍅', en: 'Tomato', ru: 'Томат', seed: 30, sell: 80, t: 60 },
    { e: '🍓', en: 'Strawberry', ru: 'Клубника', seed: 80, sell: 240, t: 120 }
  ];

  var money = 15, pc = 6, daySec = 0, earned = 0;
  var plots = []; // null | {c: crop idx, rem: ms left, t: total ms}
  var inv = [0, 0, 0, 0];

  // ---------- load ----------
  var sv = api.load();
  if (sv && sv.pc) {
    money = sv.m || 0;
    pc = Math.min(MAXP, Math.max(6, sv.pc | 0));
    daySec = sv.ds || 0;
    inv = (sv.inv && sv.inv.length === 4) ? sv.inv : [0, 0, 0, 0];
    var away = Math.min(CAP, Math.max(0, Date.now() - (sv.ts || Date.now())));
    daySec += away / 1000;
    for (var i = 0; i < pc; i++) {
      var p = sv.plots && sv.plots[i];
      plots.push(p ? { c: p.c, rem: Math.max(0, (p.rem || 0) - away), t: CROPS[p.c].t * 1000 } : null);
    }
  } else {
    for (var j = 0; j < pc; j++) plots.push(null);
  }

  // ---------- helpers ----------
  function fm(n) {
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
  function dis(b, d) { b.disabled = d; b.style.opacity = d ? '0.45' : '1'; }
  function tstr(ms) {
    var s = Math.ceil(ms / 1000);
    if (s < 60) return s + (ru ? 'с' : 's');
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:10px;font-family:sans-serif;color:' + C.text + ';');
  container.appendChild(root);

  var head = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;');
  var hleft = el('div', '');
  var moneyEl = el('div', 'font-size:28px;font-weight:bold;color:' + C.good + ';');
  var dayEl = el('div', 'font-size:12px;color:' + C.muted + ';');
  hleft.appendChild(moneyEl);
  hleft.appendChild(dayEl);
  var outBtn = el('button', 'border:0;border-radius:10px;padding:8px 10px;font-weight:bold;cursor:pointer;font-size:12px;background:' + C.accent + ';color:' + C.bg + ';', '🏁 ' + (ru ? 'Забрать выручку' : 'Cash out'));
  head.appendChild(hleft);
  head.appendChild(outBtn);
  root.appendChild(head);

  var invRow = el('div', 'display:flex;align-items:center;gap:8px;background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:8px;');
  var invEl = el('div', 'flex:1;font-size:13px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
  var sellB = el('button', 'border:0;border-radius:10px;padding:8px 12px;font-weight:bold;cursor:pointer;font-size:13px;background:' + C.good + ';color:' + C.bg + ';');
  invRow.appendChild(invEl);
  invRow.appendChild(sellB);
  root.appendChild(invRow);

  var grid = el('div', 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-bottom:16px;');
  root.appendChild(grid);

  var tiles = [];
  function buildGrid() {
    grid.innerHTML = '';
    tiles = [];
    for (var i = 0; i < pc; i++) (function (idx) {
      var t = el('div', 'background:' + C.panel + ';border-radius:12px;height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;');
      var em = el('div', 'font-size:26px;line-height:1.2;');
      var tm = el('div', 'font-size:11px;color:' + C.muted + ';');
      var barO = el('div', 'width:70%;height:5px;border-radius:3px;background:' + C.panel2 + ';margin-top:4px;overflow:hidden;');
      var bar = el('div', 'height:100%;width:0%;background:' + C.accent + ';');
      barO.appendChild(bar);
      t.appendChild(em);
      t.appendChild(tm);
      t.appendChild(barO);
      t.addEventListener('click', function () { tapPlot(idx); });
      grid.appendChild(t);
      tiles.push({ em: em, tm: tm, bar: bar, barO: barO });
    })(i);
    if (pc < MAXP) {
      var price = PLOTP[pc - 6];
      var bt = el('div', 'border:2px dashed ' + C.muted + ';border-radius:12px;height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;color:' + C.muted + ';box-sizing:border-box;');
      bt.appendChild(el('div', 'font-size:22px;', '➕'));
      bt.appendChild(el('div', 'font-size:12px;font-weight:bold;', api.t('buy') + ' $' + price));
      bt.addEventListener('click', function () {
        if (money < price) { api.haptic('error'); return; }
        money -= price;
        pc++;
        plots.push(null);
        api.haptic('success');
        buildGrid();
        render();
      });
      grid.appendChild(bt);
    }
  }

  function tapPlot(i) {
    var p = plots[i];
    if (!p) { openSheet(i); return; }
    if (p.rem <= 0) { // harvest
      inv[p.c]++;
      plots[i] = null;
      api.haptic('light');
      render();
    }
    // growing plot: time ring/bar is already shown on the tile
  }

  // ---------- crop picker sheet ----------
  var target = -1;
  var shade = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.45);display:none;z-index:4;');
  var sheet = el('div', 'position:absolute;left:0;right:0;bottom:0;background:' + C.panel + ';border-radius:16px 16px 0 0;padding:12px;display:none;z-index:5;color:' + C.text + ';font-family:sans-serif;');
  sheet.appendChild(el('div', 'font-weight:bold;font-size:15px;margin-bottom:8px;', '🌱 ' + (ru ? 'Что посадить?' : 'Plant what?')));
  var pickBtns = [];
  CROPS.forEach(function (cr, ci) {
    var b = el('button', 'display:flex;width:100%;align-items:center;gap:8px;border:0;border-radius:10px;padding:9px;margin-bottom:6px;background:' + C.panel2 + ';color:' + C.text + ';cursor:pointer;font-size:13px;text-align:left;box-sizing:border-box;');
    b.appendChild(el('span', 'font-size:20px;', cr.e));
    b.appendChild(el('span', 'flex:1;', (ru ? cr.ru : cr.en) + ' · ' + tstr(cr.t * 1000)));
    b.appendChild(el('span', 'color:' + C.muted + ';font-size:12px;', '-$' + cr.seed + ' → +$' + cr.sell));
    b.addEventListener('click', function () {
      if (target < 0 || money < cr.seed || plots[target]) return;
      money -= cr.seed;
      plots[target] = { c: ci, rem: cr.t * 1000, t: cr.t * 1000 };
      api.haptic('light');
      closeSheet();
      render();
    });
    sheet.appendChild(b);
    pickBtns.push({ b: b, ci: ci });
  });
  var cancelB = el('button', 'width:100%;border:0;border-radius:10px;padding:9px;background:transparent;color:' + C.muted + ';cursor:pointer;font-size:13px;', ru ? 'Отмена' : 'Cancel');
  cancelB.addEventListener('click', closeSheet);
  sheet.appendChild(cancelB);
  shade.addEventListener('click', closeSheet);
  container.appendChild(shade);
  container.appendChild(sheet);

  function openSheet(i) {
    target = i;
    for (var k = 0; k < pickBtns.length; k++) dis(pickBtns[k].b, money < CROPS[pickBtns[k].ci].seed);
    shade.style.display = 'block';
    sheet.style.display = 'block';
  }
  function closeSheet() {
    target = -1;
    shade.style.display = 'none';
    sheet.style.display = 'none';
  }

  // ---------- render ----------
  function render() {
    moneyEl.textContent = '$' + fm(money);
    dayEl.textContent = '☀️ ' + api.t('day') + ' ' + (Math.floor(daySec / 60) + 1);
    var tot = 0, txt = '🧺';
    for (var i = 0; i < 4; i++) {
      if (inv[i] > 0) { tot += inv[i] * CROPS[i].sell; txt += ' ' + CROPS[i].e + '×' + inv[i]; }
    }
    if (tot === 0) txt += ' ' + (ru ? 'пусто' : 'empty');
    invEl.textContent = txt;
    sellB.textContent = api.t('sell') + ' +$' + fm(tot);
    dis(sellB, tot === 0);
    for (var k = 0; k < pc; k++) {
      var p = plots[k], t = tiles[k];
      if (!t) continue;
      if (!p) {
        t.em.textContent = '🟫';
        t.tm.textContent = ru ? 'посадить' : 'plant';
        t.tm.style.color = C.muted;
        t.barO.style.visibility = 'hidden';
      } else if (p.rem <= 0) {
        t.em.textContent = CROPS[p.c].e + '✨';
        t.tm.textContent = ru ? 'собрать!' : 'harvest!';
        t.tm.style.color = C.good;
        t.barO.style.visibility = 'hidden';
      } else {
        var done = 1 - p.rem / p.t;
        t.em.textContent = done < 0.5 ? '🌱' : CROPS[p.c].e;
        t.tm.textContent = tstr(p.rem);
        t.tm.style.color = C.muted;
        t.barO.style.visibility = 'visible';
        t.bar.style.width = (done * 100).toFixed(1) + '%';
      }
    }
  }

  sellB.addEventListener('click', function () {
    var tot = 0;
    for (var i = 0; i < 4; i++) { tot += inv[i] * CROPS[i].sell; inv[i] = 0; }
    if (tot <= 0) return;
    money += tot;
    earned += tot;
    api.score(Math.floor(earned));
    api.haptic('success');
    render();
  });

  outBtn.addEventListener('click', function () {
    persist();
    api.haptic('success');
    api.gameOver(Math.floor(earned));
  });

  // ---------- loop ----------
  var paused = false, lastT = Date.now(), saveAcc = 0;
  var iv = setInterval(function () {
    if (paused) return;
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    daySec += dt / 1000;
    for (var i = 0; i < pc; i++) {
      var p = plots[i];
      if (p && p.rem > 0) {
        p.rem -= dt;
        if (p.rem <= 0) { p.rem = 0; api.haptic('light'); } // ripe!
      }
    }
    render();
    saveAcc += dt;
    if (saveAcc > 10000) { saveAcc = 0; persist(); }
  }, api.lowEnd ? 500 : 250);

  function persist() {
    api.save({
      m: money, pc: pc, inv: inv, ds: daySec, ts: Date.now(),
      plots: plots.map(function (p) { return p ? { c: p.c, rem: p.rem } : 0; })
    });
  }

  api.score(0);
  buildGrid();
  render();

  return {
    destroy: function () { clearInterval(iv); persist(); },
    pause: function () { paused = true; persist(); },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
