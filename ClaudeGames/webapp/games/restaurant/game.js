/* Burger Rush — time-management cooking. MG game 'restaurant'. */
(function () {
'use strict';
MG.register('restaurant', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var DAY_MS = 90000, MAXQ = 4, LAST_DAY = 5;

  var ING = [
    { k: 'patty',  e: '🥩', en: 'Patty',  ru: 'Котлета', day: 1 },
    { k: 'cheese', e: '🧀', en: 'Cheese', ru: 'Сыр',     day: 1 },
    { k: 'salad',  e: '🥬', en: 'Salad',  ru: 'Салат',   day: 1 },
    { k: 'tomato', e: '🍅', en: 'Tomato', ru: 'Томат',   day: 2 },
    { k: 'egg',    e: '🍳', en: 'Egg',    ru: 'Яйцо',    day: 3 },
    { k: 'bacon',  e: '🥓', en: 'Bacon',  ru: 'Бекон',   day: 4 }
  ];
  var BUN = { k: 'bun', e: '🍞', en: 'Bun', ru: 'Булка' };
  var EMO = { bun: '🍞', patty: '🥩', cheese: '🧀', salad: '🥬', tomato: '🍅', egg: '🍳', bacon: '🥓' };
  var FACES = ['🙂', '😃', '🧔', '👩', '👨‍🦰', '👵', '🧑‍🎤', '👮'];

  var day = 1, hearts = 3, total = 0, dayEarned = 0, quota = 40;
  var timeLeft = DAY_MS, running = false, over = false;
  var queue = [], stack = [], spawnIn = 1500;
  var timeouts = [];
  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timeouts.indexOf(id);
      if (k >= 0) timeouts.splice(k, 1);
      fn();
    }, ms);
    timeouts.push(id);
  }

  function unlocked() { return ING.filter(function (i) { return i.day <= day; }); }
  function patMs() { return Math.max(11000, 24000 - day * 2500); }
  function arriveMs() { return Math.max(3500, 10000 - day * 1300) + Math.random() * 2500; }

  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }
  function btnCss(bg, fg) {
    return 'border:0;border-radius:10px;font-weight:bold;cursor:pointer;background:' + bg + ';color:' + (fg || C.bg) + ';';
  }

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;box-sizing:border-box;padding:8px;font-family:sans-serif;color:' + C.text + ';overflow:hidden;');
  container.appendChild(root);

  var head = el('div', 'display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:bold;margin-bottom:6px;');
  var dayEl = el('div', '');
  var timeEl = el('div', 'color:' + C.accent + ';');
  var lifeEl = el('div', '');
  var cashEl = el('div', 'color:' + C.good + ';');
  head.appendChild(dayEl);
  head.appendChild(timeEl);
  head.appendChild(lifeEl);
  head.appendChild(cashEl);
  root.appendChild(head);

  var quotaEl = el('div', 'font-size:11px;color:' + C.muted + ';margin-bottom:6px;');
  root.appendChild(quotaEl);

  // customer queue
  var qRow = el('div', 'display:flex;gap:6px;height:118px;margin-bottom:6px;');
  root.appendChild(qRow);

  // build zone: burger stack
  var buildO = el('div', 'flex:1;min-height:0;background:' + C.panel + ';border-radius:14px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;overflow:hidden;padding-bottom:6px;');
  var stackEl = el('div', 'display:flex;flex-direction:column-reverse;align-items:center;');
  var plate = el('div', 'font-size:30px;line-height:20px;', '🍽️');
  buildO.appendChild(stackEl);
  buildO.appendChild(plate);
  var buildHint = el('div', 'position:absolute;top:6px;left:0;width:100%;text-align:center;font-size:11px;color:' + C.muted + ';',
    ru ? 'Собирай бургер снизу вверх — подача сама!' : 'Build bottom-up — serves itself on match!');
  buildO.appendChild(buildHint);
  root.appendChild(buildO);

  // ingredient buttons
  var btnRow = el('div', 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;');
  root.appendChild(btnRow);
  var ingBtns = [];
  function buildButtons() {
    btnRow.textContent = '';
    ingBtns = [];
    var list = [BUN].concat(unlocked());
    list.forEach(function (ing) {
      var b = el('button', btnCss(C.panel2, C.text) + 'flex:1;min-width:56px;padding:8px 2px;font-size:24px;line-height:1;');
      b.appendChild(el('div', '', ing.e));
      b.appendChild(el('div', 'font-size:9px;color:' + C.muted + ';margin-top:2px;', ru ? ing.ru : ing.en));
      b.addEventListener('click', function () { addIng(ing.k); });
      btnRow.appendChild(b);
      ingBtns.push(b);
    });
    var tr = el('button', btnCss(C.bad, C.text) + 'flex:1;min-width:56px;padding:8px 2px;font-size:24px;line-height:1;');
    tr.appendChild(el('div', '', '🗑️'));
    tr.appendChild(el('div', 'font-size:9px;margin-top:2px;', '-$2'));
    tr.addEventListener('click', trash);
    btnRow.appendChild(tr);
  }

  // ---------- customers ----------
  function makeOrder() {
    var pool = unlocked();
    var n = 1 + ((Math.random() * Math.min(pool.length, 1 + Math.ceil(day / 2))) | 0);
    var mid = [];
    for (var i = 0; i < n; i++) mid.push(pool[(Math.random() * pool.length) | 0].k);
    return ['bun'].concat(mid, ['bun']);
  }
  function spawnCustomer() {
    if (queue.length >= MAXQ) return;
    var cst = { order: makeOrder(), pat: patMs(), max: patMs() };
    var box = el('div', 'flex:1;background:' + C.panel + ';border-radius:12px;padding:4px 2px;display:flex;flex-direction:column;align-items:center;overflow:hidden;');
    var face = el('div', 'font-size:22px;line-height:1.1;', FACES[(Math.random() * FACES.length) | 0]);
    var bub = el('div', 'display:flex;flex-direction:column-reverse;align-items:center;font-size:13px;line-height:0.95;margin:2px 0;flex:1;justify-content:center;');
    for (var i = 0; i < cst.order.length; i++) bub.appendChild(el('div', '', EMO[cst.order[i]]));
    var pO = el('div', 'width:86%;height:5px;border-radius:3px;background:' + C.panel2 + ';overflow:hidden;');
    var pB = el('div', 'height:100%;width:100%;background:' + C.good + ';');
    pO.appendChild(pB);
    box.appendChild(face);
    box.appendChild(bub);
    box.appendChild(pO);
    qRow.appendChild(box);
    cst.box = box; cst.face = face; cst.bar = pB;
    queue.push(cst);
  }
  function removeCustomer(cst) {
    var i = queue.indexOf(cst);
    if (i >= 0) queue.splice(i, 1);
    if (cst.box.parentNode) cst.box.parentNode.removeChild(cst.box);
  }

  // ---------- burger building ----------
  function addIng(k) {
    if (!running || over) return;
    stack.push(k);
    var d = el('div', 'font-size:26px;line-height:0.85;transform:scale(1.6);transition:transform .15s;', EMO[k]);
    stackEl.appendChild(d);
    later(function () { d.style.transform = 'scale(1)'; }, 16);
    api.haptic('light');
    buildHint.style.display = 'none';
    checkServe();
  }
  function trash() {
    if (!running || over || stack.length === 0) return;
    stack = [];
    stackEl.textContent = '';
    total = Math.max(0, total - 2);
    dayEarned = Math.max(0, dayEarned - 2);
    api.haptic('error');
    api.score(total);
    refresh();
  }
  function eq(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function checkServe() {
    for (var i = 0; i < queue.length; i++) {
      if (eq(stack, queue[i].order)) { serve(queue[i]); return; }
    }
  }
  function serve(cst) {
    var tip = Math.round(cst.pat / cst.max * 6);
    var pay = 6 + 3 * cst.order.length + tip;
    total += pay;
    dayEarned += pay;
    api.score(total);
    api.haptic('success');
    cst.face.textContent = '😋';
    var c2 = cst;
    later(function () { removeCustomer(c2); }, 350);
    var i = queue.indexOf(cst);
    if (i >= 0) queue.splice(i, 1); // stop patience ticking; box removed by timeout
    stack = [];
    stackEl.textContent = '';
    if (!api.lowEnd) {
      var f = el('div', 'position:absolute;top:30%;left:0;width:100%;text-align:center;font-size:20px;font-weight:bold;color:' + C.good + ';pointer-events:none;transition:transform .7s,opacity .7s;', '+$' + pay + (tip > 2 ? ' 💝' : ''));
      buildO.appendChild(f);
      later(function () { f.style.transform = 'translateY(-30px)'; f.style.opacity = '0'; }, 16);
      later(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 750);
    }
    refresh();
  }
  function angryLeave(cst) {
    cst.face.textContent = '😡';
    hearts--;
    api.haptic('error');
    var c2 = cst;
    later(function () { removeCustomer(c2); }, 400);
    var i = queue.indexOf(cst);
    if (i >= 0) queue.splice(i, 1);
    refresh();
    if (hearts <= 0) {
      over = true;
      running = false;
      later(function () { api.gameOver(total); }, 500);
    }
  }

  // ---------- day flow ----------
  var panel = null;
  function startDay() {
    quota = 40 + (day - 1) * 35;
    dayEarned = 0;
    timeLeft = DAY_MS;
    hearts = Math.min(3, hearts + (day > 1 ? 1 : 0));
    spawnIn = 1200;
    queue.forEach(function (c2) { if (c2.box.parentNode) c2.box.parentNode.removeChild(c2.box); });
    queue = [];
    stack = [];
    stackEl.textContent = '';
    buildButtons();
    if (panel) { if (panel.parentNode) panel.parentNode.removeChild(panel); panel = null; }
    running = true;
    refresh();
  }
  function endDay() {
    running = false;
    queue.forEach(function (c2) { if (c2.box.parentNode) c2.box.parentNode.removeChild(c2.box); });
    queue = [];
    var ok = dayEarned >= quota;
    if (!ok) {
      over = true;
      later(function () { api.gameOver(total); }, 400);
      return;
    }
    if (day >= LAST_DAY) {
      over = true;
      api.haptic('success');
      later(function () { api.gameOver(total, { win: true }); }, 400);
      return;
    }
    panel = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:5;');
    var card = el('div', 'background:' + C.panel + ';border-radius:16px;padding:18px 22px;text-align:center;max-width:260px;');
    card.appendChild(el('div', 'font-size:34px;', '🎉'));
    card.appendChild(el('div', 'font-size:16px;font-weight:bold;margin:6px 0;', api.t('day') + ' ' + day + ' ✓'));
    card.appendChild(el('div', 'font-size:13px;color:' + C.good + ';', '+$' + dayEarned + ' / $' + quota));
    card.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';margin:6px 0 10px;',
      ru ? 'Дальше сложнее: новые начинки, клиенты спешат!' : 'Harder ahead: new toppings, faster customers!'));
    var nb = el('button', btnCss(C.accent) + 'padding:10px 18px;font-size:14px;', '▶ ' + (ru ? 'День ' : 'Day ') + (day + 1));
    nb.addEventListener('click', function () { day++; api.haptic('medium'); startDay(); });
    card.appendChild(nb);
    panel.appendChild(card);
    root.appendChild(panel);
    api.haptic('success');
  }

  function refresh() {
    dayEl.textContent = '📅 ' + api.t('day') + ' ' + day + '/' + LAST_DAY;
    timeEl.textContent = '⏱ ' + Math.ceil(timeLeft / 1000) + (ru ? 'с' : 's');
    var h = '';
    for (var i = 0; i < 3; i++) h += i < hearts ? '❤️' : '🖤';
    lifeEl.textContent = h;
    cashEl.textContent = '$' + total;
    quotaEl.textContent = '🎯 ' + (ru ? 'План дня: ' : 'Day quota: ') + '$' + dayEarned + ' / $' + quota;
    quotaEl.style.color = dayEarned >= quota ? C.good : C.muted;
  }

  // ---------- loop ----------
  var paused = false, lastT = Date.now();
  var iv = setInterval(function () {
    if (paused || !running || over) { lastT = Date.now(); return; }
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    timeLeft -= dt;
    spawnIn -= dt;
    if (spawnIn <= 0 && timeLeft > 6000) {
      spawnCustomer();
      spawnIn = arriveMs();
    }
    for (var i = queue.length - 1; i >= 0; i--) {
      var c2 = queue[i];
      c2.pat -= dt;
      var f = Math.max(0, c2.pat / c2.max);
      c2.bar.style.width = (f * 100).toFixed(1) + '%';
      c2.bar.style.background = f > 0.5 ? C.good : (f > 0.25 ? C.accent : C.bad);
      if (c2.pat <= 0) angryLeave(c2);
    }
    if (timeLeft <= 0) { timeLeft = 0; endDay(); }
    refresh();
  }, api.lowEnd ? 200 : 100);

  api.score(0);
  buildButtons();
  startDay();

  return {
    destroy: function () {
      clearInterval(iv);
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      timeouts.length = 0;
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
