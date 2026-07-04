/* Flag Quiz — guess the country by its flag. 20 questions. DOM UI. */
(function () {
'use strict';
MG.register('quizflags', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var QN = 20, QTIME = 15000;

  /* [iso2, nameEN, nameRU] grouped by continent:
     0 Europe, 1 Asia, 2 Africa, 3 N.America, 4 S.America, 5 Oceania */
  var D = [[
    ['AL','Albania','Албания'],['AT','Austria','Австрия'],['BY','Belarus','Беларусь'],['BE','Belgium','Бельгия'],
    ['BA','Bosnia and Herzegovina','Босния и Герцеговина'],['BG','Bulgaria','Болгария'],['HR','Croatia','Хорватия'],['CZ','Czechia','Чехия'],
    ['DK','Denmark','Дания'],['EE','Estonia','Эстония'],['FI','Finland','Финляндия'],['FR','France','Франция'],
    ['DE','Germany','Германия'],['GR','Greece','Греция'],['HU','Hungary','Венгрия'],['IS','Iceland','Исландия'],
    ['IE','Ireland','Ирландия'],['IT','Italy','Италия'],['LV','Latvia','Латвия'],['LT','Lithuania','Литва'],
    ['LU','Luxembourg','Люксембург'],['MT','Malta','Мальта'],['MD','Moldova','Молдова'],['MC','Monaco','Монако'],
    ['ME','Montenegro','Черногория'],['NL','Netherlands','Нидерланды'],['MK','North Macedonia','Северная Македония'],['NO','Norway','Норвегия'],
    ['PL','Poland','Польша'],['PT','Portugal','Португалия'],['RO','Romania','Румыния'],['RU','Russia','Россия'],
    ['RS','Serbia','Сербия'],['SK','Slovakia','Словакия'],['SI','Slovenia','Словения'],['ES','Spain','Испания'],
    ['SE','Sweden','Швеция'],['CH','Switzerland','Швейцария'],['UA','Ukraine','Украина'],['GB','United Kingdom','Великобритания']
  ],[
    ['AF','Afghanistan','Афганистан'],['AM','Armenia','Армения'],['AZ','Azerbaijan','Азербайджан'],['BD','Bangladesh','Бангладеш'],
    ['KH','Cambodia','Камбоджа'],['CN','China','Китай'],['GE','Georgia','Грузия'],['IN','India','Индия'],
    ['ID','Indonesia','Индонезия'],['IR','Iran','Иран'],['IQ','Iraq','Ирак'],['IL','Israel','Израиль'],
    ['JP','Japan','Япония'],['JO','Jordan','Иордания'],['KZ','Kazakhstan','Казахстан'],['KW','Kuwait','Кувейт'],
    ['KG','Kyrgyzstan','Киргизия'],['LB','Lebanon','Ливан'],['MY','Malaysia','Малайзия'],['MN','Mongolia','Монголия'],
    ['MM','Myanmar','Мьянма'],['NP','Nepal','Непал'],['KP','North Korea','Северная Корея'],['OM','Oman','Оман'],
    ['PK','Pakistan','Пакистан'],['PH','Philippines','Филиппины'],['QA','Qatar','Катар'],['SA','Saudi Arabia','Саудовская Аравия'],
    ['SG','Singapore','Сингапур'],['KR','South Korea','Южная Корея'],['LK','Sri Lanka','Шри-Ланка'],['SY','Syria','Сирия'],
    ['TW','Taiwan','Тайвань'],['TJ','Tajikistan','Таджикистан'],['TH','Thailand','Таиланд'],['TR','Turkey','Турция'],
    ['TM','Turkmenistan','Туркменистан'],['AE','UAE','ОАЭ'],['UZ','Uzbekistan','Узбекистан'],['VN','Vietnam','Вьетнам']
  ],[
    ['DZ','Algeria','Алжир'],['AO','Angola','Ангола'],['CM','Cameroon','Камерун'],['TD','Chad','Чад'],
    ['CD','DR Congo','ДР Конго'],['EG','Egypt','Египет'],['ET','Ethiopia','Эфиопия'],['GH','Ghana','Гана'],
    ['KE','Kenya','Кения'],['LY','Libya','Ливия'],['MG','Madagascar','Мадагаскар'],['ML','Mali','Мали'],
    ['MA','Morocco','Марокко'],['MZ','Mozambique','Мозамбик'],['NA','Namibia','Намибия'],['NG','Nigeria','Нигерия'],
    ['SN','Senegal','Сенегал'],['SO','Somalia','Сомали'],['ZA','South Africa','ЮАР'],['SD','Sudan','Судан'],
    ['TZ','Tanzania','Танзания'],['TN','Tunisia','Тунис'],['UG','Uganda','Уганда'],['ZM','Zambia','Замбия'],
    ['ZW','Zimbabwe','Зимбабве']
  ],[
    ['CA','Canada','Канада'],['CR','Costa Rica','Коста-Рика'],['CU','Cuba','Куба'],['DO','Dominican Republic','Доминиканская Республика'],
    ['SV','El Salvador','Сальвадор'],['GT','Guatemala','Гватемала'],['HT','Haiti','Гаити'],['HN','Honduras','Гондурас'],
    ['JM','Jamaica','Ямайка'],['MX','Mexico','Мексика'],['NI','Nicaragua','Никарагуа'],['PA','Panama','Панама'],
    ['US','USA','США']
  ],[
    ['AR','Argentina','Аргентина'],['BO','Bolivia','Боливия'],['BR','Brazil','Бразилия'],['CL','Chile','Чили'],
    ['CO','Colombia','Колумбия'],['EC','Ecuador','Эквадор'],['GY','Guyana','Гайана'],['PY','Paraguay','Парагвай'],
    ['PE','Peru','Перу'],['SR','Suriname','Суринам'],['UY','Uruguay','Уругвай'],['VE','Venezuela','Венесуэла']
  ],[
    ['AU','Australia','Австралия'],['FJ','Fiji','Фиджи'],['NZ','New Zealand','Новая Зеландия'],['PG','Papua New Guinea','Папуа — Новая Гвинея'],
    ['WS','Samoa','Самоа'],['TO','Tonga','Тонга']
  ]];

  var ALL = [];
  (function () {
    for (var c = 0; c < D.length; c++)
      for (var i = 0; i < D[c].length; i++) ALL.push([c, D[c][i]]);
  })();

  /* regional-indicator pair from a 2-letter code (manual surrogates for old engines) */
  function ri(ch) {
    var n = 0x1F1E6 + ch.charCodeAt(0) - 65 - 0x10000;
    return String.fromCharCode(0xD800 + (n >> 10), 0xDC00 + (n & 1023));
  }
  function flagOf(code) { return ri(code.charAt(0)) + ri(code.charAt(1)); }

  /* detect flag-emoji support: measure rendered width of 🇧🇷 vs 'BR' on a canvas;
     unsupported devices draw two letter glyphs (much wider). Color check as backup. */
  var flagsOK = (function () {
    try {
      var cv = document.createElement('canvas');
      cv.width = 80; cv.height = 40;
      var g = cv.getContext('2d');
      if (!g) return true;
      g.font = '28px sans-serif';
      var f = flagOf('BR');
      if (g.measureText(f).width < g.measureText('BR').width * 1.25) return true;
      g.textBaseline = 'top';
      g.fillText(f, 0, 0);
      var d = g.getImageData(0, 0, 80, 40).data;
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 40 && (Math.abs(d[i] - d[i + 1]) > 24 || Math.abs(d[i + 1] - d[i + 2]) > 24)) return true;
      }
      return false;
    } catch (e) { return true; }
  })();

  var score = 0, streak = 0, correct = 0, qi = 0;
  var curIdx = -1, opts = [], timeLeft = QTIME;
  var running = false, paused = false, locked = true;
  var iv = 0, timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function rnd(n) { return (Math.random() * n) | 0; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var order = (function () {
    var idxs = [];
    for (var i = 0; i < ALL.length; i++) idxs.push(i);
    return shuffle(idxs).slice(0, QN);
  })();

  /* ---- DOM ---- */
  container.style.background = C.bg;
  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;max-width:480px;margin:0 auto;' +
    'display:flex;flex-direction:column;padding:14px;box-sizing:border-box;font-family:sans-serif;';

  var hud = document.createElement('div');
  hud.style.cssText = 'display:flex;justify-content:space-between;align-items:center;min-height:24px;margin-bottom:6px;';
  var qTxt = document.createElement('div');
  qTxt.style.cssText = 'color:' + C.muted + ';font-weight:600;font-size:15px;';
  var flame = document.createElement('div');
  flame.style.cssText = 'color:' + C.accent + ';font-weight:700;font-size:16px;';
  hud.appendChild(qTxt);
  hud.appendChild(flame);

  var barOuter = document.createElement('div');
  barOuter.style.cssText = 'height:8px;border-radius:5px;background:' + C.panel + ';overflow:hidden;';
  var bar = document.createElement('div');
  bar.style.cssText = 'height:100%;width:100%;background:' + C.accent + ';border-radius:5px;' +
    (api.lowEnd ? '' : 'transition:width .1s linear;');
  barOuter.appendChild(bar);

  var mid = document.createElement('div');
  mid.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;';
  var label = document.createElement('div');
  label.style.cssText = 'color:' + C.muted + ';font-size:14px;margin-bottom:8px;text-align:center;';
  label.textContent = flagsOK ? (ru ? 'Чей это флаг?' : 'Whose flag is this?')
                              : (ru ? 'Страна с этим кодом?' : 'Which country has this code?');
  var flagEl = document.createElement('div');
  flagEl.style.cssText = 'line-height:1.1;text-align:center;user-select:none;';
  if (!flagsOK) {
    flagEl.style.cssText += 'background:' + C.panel + ';color:' + C.accent + ';border:2px solid ' + C.panel2 +
      ';border-radius:18px;padding:14px 26px;font-weight:800;letter-spacing:8px;text-indent:8px;';
  }
  mid.appendChild(label);
  mid.appendChild(flagEl);

  var list = document.createElement('div');
  list.style.cssText = 'display:grid;grid-template-columns:1fr;gap:9px;padding-bottom:6px;';
  var btns = [];
  var btnBase = 'padding:13px 10px;border-radius:12px;text-align:center;font-weight:700;font-size:16px;' +
    'background:' + C.panel + ';color:' + C.text + ';border:1px solid ' + C.panel2 + ';' +
    'touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;';
  for (var bi = 0; bi < 4; bi++) (function (i) {
    var b = document.createElement('div');
    b.style.cssText = btnBase;
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); pick(i); });
    btns.push(b);
    list.appendChild(b);
  })(bi);

  wrap.appendChild(hud);
  wrap.appendChild(barOuter);
  wrap.appendChild(mid);
  wrap.appendChild(list);
  container.appendChild(wrap);

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,.45);color:' + C.text + ';font:700 20px sans-serif;';
  overlay.textContent = api.t('tap_to_start');
  container.appendChild(overlay);

  function fit() {
    var w = Math.min(480, container.clientWidth || 320);
    flagEl.style.fontSize = (flagsOK ? Math.max(64, Math.min(120, (w * 0.3) | 0))
                                     : Math.max(36, Math.min(60, (w * 0.16) | 0))) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  function updateHud() {
    qTxt.textContent = Math.min(qi + 1, QN) + '/' + QN;
    flame.textContent = streak >= 2 ? '🔥x' + streak : '';
  }

  function genQ() {
    curIdx = order[qi];
    var cont = ALL[curIdx][0], e = ALL[curIdx][1], i;
    var pool = [];
    for (i = 0; i < ALL.length; i++) if (i !== curIdx && ALL[i][0] === cont) pool.push(i);
    if (pool.length < 3) for (i = 0; i < ALL.length; i++) if (i !== curIdx && ALL[i][0] !== cont) pool.push(i);
    shuffle(pool);
    opts = shuffle([curIdx, pool[0], pool[1], pool[2]]);
    flagEl.textContent = flagsOK ? flagOf(e[0]) : e[0];
    for (i = 0; i < 4; i++) {
      var oe = ALL[opts[i]][1];
      btns[i].textContent = ru ? oe[2] : oe[1];
      btns[i].style.background = C.panel;
      btns[i].style.color = C.text;
    }
    timeLeft = QTIME;
    bar.style.width = '100%';
    bar.style.background = C.accent;
    updateHud();
    locked = false;
  }

  function markCorrect() {
    for (var k = 0; k < 4; k++) if (opts[k] === curIdx) {
      btns[k].style.background = C.good;
      btns[k].style.color = C.bg;
    }
  }

  function pick(i) {
    if (!running || locked || paused) return;
    locked = true;
    if (opts[i] === curIdx) {
      score += 10 + 2 * streak;
      streak++; correct++;
      api.score(score);
      api.haptic(streak % 5 === 0 ? 'success' : 'light');
      btns[i].style.background = C.good;
      btns[i].style.color = C.bg;
    } else {
      streak = 0;
      api.haptic('error');
      btns[i].style.background = C.bad;
      btns[i].style.color = C.bg;
      markCorrect();
    }
    updateHud();
    later(next, 700);
  }

  function timeoutQ() {
    locked = true;
    streak = 0;
    api.haptic('error');
    markCorrect();
    updateHud();
    later(next, 700);
  }

  function next() {
    if (!running) return;
    qi++;
    if (qi >= QN) {
      running = false;
      clearInterval(iv);
      api.gameOver(score, { win: correct >= 14 });
      return;
    }
    genQ();
  }

  function tick() {
    if (!running || paused || locked) return;
    timeLeft -= 100;
    bar.style.width = Math.max(0, timeLeft / QTIME * 100) + '%';
    if (timeLeft <= 3000) bar.style.background = C.bad;
    if (timeLeft <= 0) timeoutQ();
  }

  function start() {
    if (running) return;
    overlay.style.display = 'none';
    running = true;
    api.score(0);
    genQ();
    iv = setInterval(tick, 100);
  }
  overlay.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });

  function onKey(e) {
    if (!running && (e.key === ' ' || e.key === 'Enter')) { start(); e.preventDefault(); return; }
    var n = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (n !== undefined) { pick(n); e.preventDefault(); }
  }
  window.addEventListener('keydown', onKey);
  updateHud();

  return {
    destroy: function () {
      clearInterval(iv);
      for (var k = 0; k < timers.length; k++) clearTimeout(timers[k]);
      timers.length = 0;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fit);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
