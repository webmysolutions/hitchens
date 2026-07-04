/* Capitals Quiz — 20 questions alternating country→capital / capital→country. DOM UI. */
(function () {
'use strict';
MG.register('quizcapitals', function (container, api) {
  var C = api.colors;
  var ru = api.lang === 'ru';
  var QN = 20, QTIME = 15000;

  /* [countryEN, countryRU, capitalEN, capitalRU] grouped by continent:
     0 Europe, 1 Asia, 2 Africa, 3 N.America, 4 S.America, 5 Oceania */
  var D = [[
    ['Albania','Албания','Tirana','Тирана'],['Austria','Австрия','Vienna','Вена'],
    ['Belarus','Беларусь','Minsk','Минск'],['Belgium','Бельгия','Brussels','Брюссель'],
    ['Bosnia and Herzegovina','Босния и Герцеговина','Sarajevo','Сараево'],['Bulgaria','Болгария','Sofia','София'],
    ['Croatia','Хорватия','Zagreb','Загреб'],['Cyprus','Кипр','Nicosia','Никосия'],
    ['Czechia','Чехия','Prague','Прага'],['Denmark','Дания','Copenhagen','Копенгаген'],
    ['Estonia','Эстония','Tallinn','Таллин'],['Finland','Финляндия','Helsinki','Хельсинки'],
    ['France','Франция','Paris','Париж'],['Germany','Германия','Berlin','Берлин'],
    ['Greece','Греция','Athens','Афины'],['Hungary','Венгрия','Budapest','Будапешт'],
    ['Iceland','Исландия','Reykjavik','Рейкьявик'],['Ireland','Ирландия','Dublin','Дублин'],
    ['Italy','Италия','Rome','Рим'],['Latvia','Латвия','Riga','Рига'],
    ['Lithuania','Литва','Vilnius','Вильнюс'],['Malta','Мальта','Valletta','Валлетта'],
    ['Moldova','Молдова','Chisinau','Кишинёв'],['Montenegro','Черногория','Podgorica','Подгорица'],
    ['Netherlands','Нидерланды','Amsterdam','Амстердам'],['North Macedonia','Северная Македония','Skopje','Скопье'],
    ['Norway','Норвегия','Oslo','Осло'],['Poland','Польша','Warsaw','Варшава'],
    ['Portugal','Португалия','Lisbon','Лиссабон'],['Romania','Румыния','Bucharest','Бухарест'],
    ['Russia','Россия','Moscow','Москва'],['Serbia','Сербия','Belgrade','Белград'],
    ['Slovakia','Словакия','Bratislava','Братислава'],['Slovenia','Словения','Ljubljana','Любляна'],
    ['Spain','Испания','Madrid','Мадрид'],['Sweden','Швеция','Stockholm','Стокгольм'],
    ['Switzerland','Швейцария','Bern','Берн'],['Ukraine','Украина','Kyiv','Киев'],
    ['United Kingdom','Великобритания','London','Лондон']
  ],[
    ['Afghanistan','Афганистан','Kabul','Кабул'],['Armenia','Армения','Yerevan','Ереван'],
    ['Azerbaijan','Азербайджан','Baku','Баку'],['Bahrain','Бахрейн','Manama','Манама'],
    ['Bangladesh','Бангладеш','Dhaka','Дакка'],['Cambodia','Камбоджа','Phnom Penh','Пномпень'],
    ['China','Китай','Beijing','Пекин'],['Georgia','Грузия','Tbilisi','Тбилиси'],
    ['India','Индия','New Delhi','Нью-Дели'],['Indonesia','Индонезия','Jakarta','Джакарта'],
    ['Iran','Иран','Tehran','Тегеран'],['Iraq','Ирак','Baghdad','Багдад'],
    ['Israel','Израиль','Jerusalem','Иерусалим'],['Japan','Япония','Tokyo','Токио'],
    ['Jordan','Иордания','Amman','Амман'],['Kazakhstan','Казахстан','Astana','Астана'],
    ['Kuwait','Кувейт','Kuwait City','Эль-Кувейт'],['Kyrgyzstan','Киргизия','Bishkek','Бишкек'],
    ['Laos','Лаос','Vientiane','Вьентьян'],['Lebanon','Ливан','Beirut','Бейрут'],
    ['Malaysia','Малайзия','Kuala Lumpur','Куала-Лумпур'],['Mongolia','Монголия','Ulaanbaatar','Улан-Батор'],
    ['Myanmar','Мьянма','Naypyidaw','Нейпьидо'],['Nepal','Непал','Kathmandu','Катманду'],
    ['North Korea','Северная Корея','Pyongyang','Пхеньян'],['Oman','Оман','Muscat','Маскат'],
    ['Pakistan','Пакистан','Islamabad','Исламабад'],['Philippines','Филиппины','Manila','Манила'],
    ['Qatar','Катар','Doha','Доха'],['Saudi Arabia','Саудовская Аравия','Riyadh','Эр-Рияд'],
    ['South Korea','Южная Корея','Seoul','Сеул'],['Syria','Сирия','Damascus','Дамаск'],
    ['Taiwan','Тайвань','Taipei','Тайбэй'],['Tajikistan','Таджикистан','Dushanbe','Душанбе'],
    ['Thailand','Таиланд','Bangkok','Бангкок'],['Turkey','Турция','Ankara','Анкара'],
    ['Turkmenistan','Туркменистан','Ashgabat','Ашхабад'],['UAE','ОАЭ','Abu Dhabi','Абу-Даби'],
    ['Uzbekistan','Узбекистан','Tashkent','Ташкент'],['Vietnam','Вьетнам','Hanoi','Ханой']
  ],[
    ['Angola','Ангола','Luanda','Луанда'],['Botswana','Ботсвана','Gaborone','Габороне'],
    ['Cameroon','Камерун','Yaounde','Яунде'],['Chad','Чад','N\'Djamena','Нджамена'],
    ['DR Congo','ДР Конго','Kinshasa','Киншаса'],['Egypt','Египет','Cairo','Каир'],
    ['Ethiopia','Эфиопия','Addis Ababa','Аддис-Абеба'],['Ghana','Гана','Accra','Аккра'],
    ['Kenya','Кения','Nairobi','Найроби'],['Libya','Ливия','Tripoli','Триполи'],
    ['Madagascar','Мадагаскар','Antananarivo','Антананариву'],['Mali','Мали','Bamako','Бамако'],
    ['Morocco','Марокко','Rabat','Рабат'],['Mozambique','Мозамбик','Maputo','Мапуту'],
    ['Namibia','Намибия','Windhoek','Виндхук'],['Nigeria','Нигерия','Abuja','Абуджа'],
    ['Rwanda','Руанда','Kigali','Кигали'],['Senegal','Сенегал','Dakar','Дакар'],
    ['Somalia','Сомали','Mogadishu','Могадишо'],['South Africa','ЮАР','Pretoria','Претория'],
    ['Sudan','Судан','Khartoum','Хартум'],['Tanzania','Танзания','Dodoma','Додома'],
    ['Uganda','Уганда','Kampala','Кампала'],['Zambia','Замбия','Lusaka','Лусака'],
    ['Zimbabwe','Зимбабве','Harare','Хараре']
  ],[
    ['Canada','Канада','Ottawa','Оттава'],['Costa Rica','Коста-Рика','San Jose','Сан-Хосе'],
    ['Cuba','Куба','Havana','Гавана'],['Dominican Republic','Доминиканская Республика','Santo Domingo','Санто-Доминго'],
    ['El Salvador','Сальвадор','San Salvador','Сан-Сальвадор'],['Haiti','Гаити','Port-au-Prince','Порт-о-Пренс'],
    ['Honduras','Гондурас','Tegucigalpa','Тегусигальпа'],['Jamaica','Ямайка','Kingston','Кингстон'],
    ['Mexico','Мексика','Mexico City','Мехико'],['Nicaragua','Никарагуа','Managua','Манагуа'],
    ['USA','США','Washington','Вашингтон']
  ],[
    ['Argentina','Аргентина','Buenos Aires','Буэнос-Айрес'],['Brazil','Бразилия','Brasilia','Бразилиа'],
    ['Chile','Чили','Santiago','Сантьяго'],['Colombia','Колумбия','Bogota','Богота'],
    ['Ecuador','Эквадор','Quito','Кито'],['Guyana','Гайана','Georgetown','Джорджтаун'],
    ['Paraguay','Парагвай','Asuncion','Асунсьон'],['Peru','Перу','Lima','Лима'],
    ['Suriname','Суринам','Paramaribo','Парамарибо'],['Uruguay','Уругвай','Montevideo','Монтевидео'],
    ['Venezuela','Венесуэла','Caracas','Каракас']
  ],[
    ['Australia','Австралия','Canberra','Канберра'],['Fiji','Фиджи','Suva','Сува'],
    ['New Zealand','Новая Зеландия','Wellington','Веллингтон'],['Papua New Guinea','Папуа — Новая Гвинея','Port Moresby','Порт-Морсби'],
    ['Samoa','Самоа','Apia','Апиа'],['Tonga','Тонга','Nuku\'alofa','Нукуалофа']
  ]];

  var ALL = [];
  (function () {
    for (var c = 0; c < D.length; c++)
      for (var i = 0; i < D[c].length; i++) ALL.push([c, D[c][i]]);
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
  mid.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0;padding:6px 0;';
  var label = document.createElement('div');
  label.style.cssText = 'color:' + C.muted + ';font-size:14px;margin-bottom:10px;text-align:center;';
  var bigEl = document.createElement('div');
  bigEl.style.cssText = 'color:' + C.text + ';font-weight:800;font-size:28px;line-height:1.2;text-align:center;' +
    'background:' + C.panel + ';border:1px solid ' + C.panel2 + ';border-radius:16px;padding:18px 16px;' +
    'align-self:stretch;user-select:none;word-break:break-word;';
  mid.appendChild(label);
  mid.appendChild(bigEl);

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

  function updateHud() {
    qTxt.textContent = Math.min(qi + 1, QN) + '/' + QN;
    flame.textContent = streak >= 2 ? '🔥x' + streak : '';
  }

  function genQ() {
    curIdx = order[qi];
    var cont = ALL[curIdx][0], e = ALL[curIdx][1], i;
    var dir = qi % 2; // 0: country→capital, 1: capital→country
    var pool = [];
    for (i = 0; i < ALL.length; i++) if (i !== curIdx && ALL[i][0] === cont) pool.push(i);
    if (pool.length < 3) for (i = 0; i < ALL.length; i++) if (i !== curIdx && ALL[i][0] !== cont) pool.push(i);
    shuffle(pool);
    opts = shuffle([curIdx, pool[0], pool[1], pool[2]]);
    if (dir === 0) {
      label.textContent = ru ? 'Столица этой страны?' : 'What is the capital of…';
      bigEl.textContent = ru ? e[1] : e[0];
    } else {
      label.textContent = ru ? 'Это столица какой страны?' : 'This city is the capital of…';
      bigEl.textContent = ru ? e[3] : e[2];
    }
    for (i = 0; i < 4; i++) {
      var oe = ALL[opts[i]][1];
      btns[i].textContent = dir === 0 ? (ru ? oe[3] : oe[2]) : (ru ? oe[1] : oe[0]);
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
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
