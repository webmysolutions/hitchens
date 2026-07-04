/* My Pet — tamagotchi care sim. MG game 'petcare'. */
(function () {
'use strict';
MG.register('petcare', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var STAGES = ['🥚', '🐣', '🐥', '🦚'];
  var EVOLVE = [100, 300, 600]; // total care points thresholds
  var FLOOR = 15;
  // decay per minute
  var DEC = { h: 3, f: 4, e: 2, c: 1.5 };

  var st = { h: 80, f: 80, e: 80, c: 80 }; // hunger, fun, energy, clean (fullness)
  var cp = 0, sessCp = 0, sleep = false;
  var timeouts = [];
  function later(fn, ms) {
    var id = setTimeout(function () {
      var k = timeouts.indexOf(id);
      if (k >= 0) timeouts.splice(k, 1);
      fn();
    }, ms);
    timeouts.push(id);
  }
  function clamp(v) { return Math.max(0, Math.min(100, v)); }
  function stage() {
    var s = 0;
    for (var i = 0; i < EVOLVE.length; i++) if (cp >= EVOLVE[i]) s = i + 1;
    return s;
  }

  // ---------- load + offline decay (never deadly: floors at 15) ----------
  var sv = api.load();
  if (sv && sv.st) {
    st.h = clamp(+sv.st.h || 0); st.f = clamp(+sv.st.f || 0);
    st.e = clamp(+sv.st.e || 0); st.c = clamp(+sv.st.c || 0);
    cp = sv.cp | 0;
    sleep = !!sv.sleep;
    var mins = Math.max(0, (Date.now() - (sv.ts || Date.now())) / 60000);
    st.h = Math.max(Math.min(st.h, FLOOR), st.h - DEC.h * mins);
    st.f = Math.max(Math.min(st.f, FLOOR), st.f - DEC.f * mins);
    st.c = Math.max(Math.min(st.c, FLOOR), st.c - DEC.c * mins);
    if (sleep) st.e = clamp(st.e + 25 * Math.min(mins, 480));
    else st.e = Math.max(Math.min(st.e, FLOOR), st.e - DEC.e * mins);
  }

  function el(tag, css, txt) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (txt != null) d.textContent = txt;
    return d;
  }
  function btnCss(bg, fg) {
    return 'border:0;border-radius:12px;font-weight:bold;cursor:pointer;background:' + bg + ';color:' + (fg || C.bg) + ';';
  }

  // idle bounce keyframes
  var styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes mgpet-b{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}' +
    '@keyframes mgpet-p{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.8);opacity:0}}';
  document.head.appendChild(styleEl);

  // ---------- UI ----------
  var root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;box-sizing:border-box;padding:10px;font-family:sans-serif;color:' + C.text + ';');
  container.appendChild(root);

  var head = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;');
  var hleft = el('div', '');
  var cpEl = el('div', 'font-size:24px;font-weight:bold;color:' + C.good + ';');
  hleft.appendChild(cpEl);
  hleft.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';', ru ? 'очки заботы' : 'care points'));
  var outBtn = el('button', btnCss(C.accent) + 'font-size:12px;padding:8px 10px;', '🏁 ' + (ru ? 'Готово' : 'Done'));
  head.appendChild(hleft);
  head.appendChild(outBtn);
  root.appendChild(head);

  // pet stage panel
  var pen = el('div', 'position:relative;background:' + C.panel + ';border-radius:16px;height:180px;margin-bottom:8px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;');
  var petEl = el('div', 'font-size:76px;line-height:1;animation:mgpet-b 2.2s ease-in-out infinite;transition:transform .3s;');
  var moodEl = el('div', 'font-size:24px;margin-top:4px;');
  pen.appendChild(petEl);
  pen.appendChild(moodEl);
  var dim = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,10,.55);opacity:0;transition:opacity .5s;pointer-events:none;display:flex;align-items:flex-start;justify-content:flex-end;padding:8px;box-sizing:border-box;font-size:22px;');
  dim.textContent = '🌙💤';
  pen.appendChild(dim);
  var evoEl = el('div', 'position:absolute;left:0;bottom:6px;width:100%;text-align:center;font-size:11px;color:' + C.muted + ';');
  pen.appendChild(evoEl);
  root.appendChild(pen);

  // stat bars
  var BARS = [
    { k: 'h', e: '🍗', en: 'Food',   ru: 'Сытость' },
    { k: 'f', e: '🎈', en: 'Fun',    ru: 'Веселье' },
    { k: 'e', e: '⚡', en: 'Energy', ru: 'Энергия' },
    { k: 'c', e: '🧼', en: 'Clean',  ru: 'Чистота' }
  ];
  var barPan = el('div', 'background:' + C.panel + ';border-radius:12px;padding:8px 10px;margin-bottom:8px;');
  var bars = {};
  BARS.forEach(function (b) {
    var row = el('div', 'display:flex;align-items:center;margin:4px 0;font-size:12px;');
    row.appendChild(el('div', 'width:66px;', b.e + ' ' + (ru ? b.ru : b.en)));
    var o = el('div', 'flex:1;height:8px;border-radius:4px;background:' + C.panel2 + ';overflow:hidden;');
    var f = el('div', 'height:100%;width:50%;background:' + C.good + ';transition:width .3s;');
    o.appendChild(f);
    row.appendChild(o);
    var v = el('div', 'width:30px;text-align:right;color:' + C.muted + ';');
    row.appendChild(v);
    barPan.appendChild(row);
    bars[b.k] = { f: f, v: v };
  });
  root.appendChild(barPan);
  root.appendChild(el('div', 'font-size:11px;color:' + C.muted + ';text-align:center;margin-bottom:8px;',
    ru ? 'Держи все шкалы выше 60 — получай очки заботы!' : 'Keep all bars above 60 to earn care points!'));

  // action buttons
  var actRow = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;');
  root.appendChild(actRow);
  function actBtn(emo, label) {
    var b = el('button', btnCss(C.panel2, C.text) + 'padding:12px 4px;font-size:15px;');
    b.textContent = emo + ' ' + label;
    actRow.appendChild(b);
    return b;
  }
  var feedB = actBtn('🍔', ru ? 'Кормить' : 'Feed');
  var playB = actBtn('🎾', ru ? 'Играть' : 'Play');
  var sleepB = actBtn('😴', ru ? 'Спать' : 'Sleep');
  var washB = actBtn('🛁', ru ? 'Мыть' : 'Wash');

  var overlay = null;
  function closeOverlay() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  function bonus(n) {
    cp += n; sessCp += n;
    api.score(sessCp);
    checkEvolve();
  }
  function checkEvolve() {
    var s = stage();
    if (STAGES[s] !== petEl.textContent) {
      petEl.textContent = STAGES[s];
      petEl.style.transform = 'scale(1.5)';
      later(function () { petEl.style.transform = 'scale(1)'; }, 400);
      api.haptic('success');
      if (!api.lowEnd) {
        for (var i = 0; i < 8; i++) {
          (function () {
            var sp = el('div', 'position:absolute;left:' + (10 + Math.random() * 80) + '%;top:' + (15 + Math.random() * 60) + '%;font-size:20px;animation:mgpet-p 1s ease-out forwards;pointer-events:none;', ['🎉', '✨', '⭐'][(Math.random() * 3) | 0]);
            pen.appendChild(sp);
            later(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 1100);
          })();
        }
      }
    }
  }

  // ----- feed -----
  var FOODS = [
    { e: '🍎', en: 'Apple',  ru: 'Яблоко', h: 15, c: 0,  eB: 0 },
    { e: '🍔', en: 'Burger', ru: 'Бургер', h: 35, c: -6, eB: 0 },
    { e: '🥦', en: 'Veggie', ru: 'Овощи',  h: 22, c: 0,  eB: 6 }
  ];
  function openFeed() {
    if (overlay || sleep) return;
    overlay = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:5;');
    var card = el('div', 'background:' + C.panel + ';border-radius:16px;padding:14px;display:flex;gap:10px;');
    FOODS.forEach(function (fd) {
      var b = el('button', btnCss(C.panel2, C.text) + 'padding:10px;font-size:26px;line-height:1;');
      b.appendChild(el('div', '', fd.e));
      b.appendChild(el('div', 'font-size:10px;color:' + C.muted + ';margin-top:3px;', (ru ? fd.ru : fd.en) + ' +' + fd.h));
      b.addEventListener('click', function () {
        st.h = clamp(st.h + fd.h);
        st.c = clamp(st.c + fd.c);
        st.e = clamp(st.e + fd.eB);
        api.haptic('light');
        bonus(2);
        closeOverlay();
        refresh();
        persist();
      });
      card.appendChild(b);
    });
    overlay.appendChild(card);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    root.appendChild(overlay);
  }

  // ----- play: 10s tap-the-ball -----
  var playIv = 0, playTo = 0;
  function openPlay() {
    if (overlay || sleep || st.e < 10) return;
    var taps = 0, left = 10;
    overlay = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.6);z-index:5;');
    var tEl = el('div', 'position:absolute;top:10px;left:0;width:100%;text-align:center;font-size:15px;font-weight:bold;color:' + C.text + ';', '⏱ 10 · 🎾 0');
    overlay.appendChild(tEl);
    var ball = el('button', 'position:absolute;border:0;background:none;font-size:44px;cursor:pointer;left:45%;top:45%;padding:6px;', '🎾');
    overlay.appendChild(ball);
    function move() {
      ball.style.left = (8 + Math.random() * 70) + '%';
      ball.style.top = (12 + Math.random() * 70) + '%';
    }
    ball.addEventListener('click', function () {
      taps++;
      api.haptic('light');
      tEl.textContent = '⏱ ' + left + ' · 🎾 ' + taps;
      move();
    });
    playIv = setInterval(function () {
      if (paused) return;
      left--;
      tEl.textContent = '⏱ ' + left + ' · 🎾 ' + taps;
      if (left <= 0) {
        clearInterval(playIv); playIv = 0;
        st.f = clamp(st.f + taps * 3);
        st.e = clamp(st.e - 10);
        closeOverlay();
        api.haptic('success');
        bonus(2 + Math.min(3, (taps / 8) | 0));
        refresh();
        persist();
      }
    }, 1000);
    root.appendChild(overlay);
    move();
  }

  // ----- sleep -----
  function toggleSleep() {
    if (overlay) return;
    sleep = !sleep;
    dim.style.opacity = sleep ? '1' : '0';
    sleepB.textContent = sleep ? ('🌞 ' + (ru ? 'Будить' : 'Wake')) : ('😴 ' + (ru ? 'Спать' : 'Sleep'));
    petEl.style.animationPlayState = sleep ? 'paused' : 'running';
    api.haptic('light');
    if (sleep) bonus(2);
    refresh();
    persist();
  }

  // ----- wash -----
  function wash() {
    if (overlay || sleep) return;
    st.c = 100;
    api.haptic('light');
    bonus(2);
    if (!api.lowEnd) {
      for (var i = 0; i < 7; i++) {
        (function () {
          var b = el('div', 'position:absolute;left:' + (20 + Math.random() * 60) + '%;top:' + (25 + Math.random() * 50) + '%;font-size:' + (14 + Math.random() * 14) + 'px;animation:mgpet-p 1.1s ease-out forwards;pointer-events:none;', '🫧');
          pen.appendChild(b);
          later(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 1200);
        })();
      }
    }
    refresh();
    persist();
  }

  feedB.addEventListener('click', openFeed);
  playB.addEventListener('click', openPlay);
  sleepB.addEventListener('click', toggleSleep);
  washB.addEventListener('click', wash);

  // ---------- refresh ----------
  function barColor(v) { return v > 60 ? C.good : (v > 30 ? C.accent : C.bad); }
  function refresh() {
    cpEl.textContent = '💖 ' + cp + (sessCp > 0 ? '  (+' + sessCp + ')' : '');
    var low = Math.min(st.h, st.f, st.e, st.c);
    moodEl.textContent = sleep ? '💤' : (low > 75 ? '😄' : low > 50 ? '🙂' : low > 30 ? '😐' : '😢');
    BARS.forEach(function (b) {
      var v = Math.round(st[b.k]);
      bars[b.k].f.style.width = v + '%';
      bars[b.k].f.style.background = barColor(v);
      bars[b.k].v.textContent = v;
    });
    var s = stage();
    evoEl.textContent = s < 3
      ? (ru ? 'До эволюции: ' : 'Next evolution: ') + cp + ' / ' + EVOLVE[s]
      : (ru ? 'Максимальная форма!' : 'Final form!');
    var dimmed = sleep;
    feedB.style.opacity = dimmed ? '0.4' : '1';
    playB.style.opacity = dimmed || st.e < 10 ? '0.4' : '1';
    washB.style.opacity = dimmed ? '0.4' : '1';
  }

  // ---------- loop ----------
  var paused = false, lastT = Date.now(), cpAcc = 0, saveAcc = 0;
  var iv = setInterval(function () {
    if (paused) { lastT = Date.now(); return; }
    var now = Date.now(), dt = now - lastT;
    lastT = now;
    var m = dt / 60000;
    st.h = Math.max(0, st.h - DEC.h * m);
    st.f = Math.max(0, st.f - DEC.f * m);
    st.c = Math.max(0, st.c - DEC.c * m);
    if (sleep) st.e = clamp(st.e + 25 * m);
    else st.e = Math.max(0, st.e - DEC.e * m);
    if (st.h > 60 && st.f > 60 && st.e > 60 && st.c > 60) {
      cpAcc += m; // 1 care point per active minute
      if (cpAcc >= 1) {
        cpAcc -= 1;
        api.haptic('light');
        bonus(1);
      }
    }
    saveAcc += dt;
    if (saveAcc > 10000) { saveAcc = 0; persist(); }
    refresh();
  }, 1000);

  function persist() {
    api.save({
      st: { h: Math.round(st.h), f: Math.round(st.f), e: Math.round(st.e), c: Math.round(st.c) },
      cp: cp, sleep: sleep, ts: Date.now()
    });
  }

  outBtn.addEventListener('click', function () {
    persist();
    api.haptic('success');
    api.gameOver(sessCp);
  });

  api.score(0);
  petEl.textContent = STAGES[stage()];
  if (sleep) {
    dim.style.opacity = '1';
    sleepB.textContent = '🌞 ' + (ru ? 'Будить' : 'Wake');
    petEl.style.animationPlayState = 'paused';
  }
  refresh();

  return {
    destroy: function () {
      clearInterval(iv);
      if (playIv) clearInterval(playIv);
      if (playTo) clearTimeout(playTo);
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      timeouts.length = 0;
      if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
      persist();
    },
    pause: function () { paused = true; persist(); },
    resume: function () { paused = false; lastT = Date.now(); }
  };
});
})();
