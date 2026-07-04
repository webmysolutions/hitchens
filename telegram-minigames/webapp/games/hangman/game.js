/* Hangman — guess the word, 8 rounds, RU/EN keyboards, animated gallows. */
(function () {
'use strict';

var DATA = {
  ru: {
    cats: { a: 'Животные', f: 'Еда', n: 'Природа', t: 'Техника', s: 'Спорт' },
    words: [
      ['СОБАКА','a'],['КОШКА','a'],['МЕДВЕДЬ','a'],['ЛИСИЦА','a'],['ЗАЯЦ','a'],['ВОЛК','a'],['ЛОШАДЬ','a'],['КОРОВА','a'],['ТИГР','a'],['СЛОН','a'],
      ['ЖИРАФ','a'],['ОБЕЗЬЯНА','a'],['ПИНГВИН','a'],['ДЕЛЬФИН','a'],['ЧЕРЕПАХА','a'],['ПОПУГАЙ','a'],['ХОМЯК','a'],['ВЕРБЛЮД','a'],['КРОКОДИЛ','a'],['БЕЛКА','a'],
      ['ХЛЕБ','f'],['МОЛОКО','f'],['КАРТОШКА','f'],['ЯБЛОКО','f'],['КОЛБАСА','f'],['ПЕЛЬМЕНИ','f'],['БОРЩ','f'],['КОТЛЕТА','f'],['ПИРОГ','f'],['ВАРЕНЬЕ','f'],
      ['АПЕЛЬСИН','f'],['ОГУРЕЦ','f'],['ПОМИДОР','f'],['МОРКОВЬ','f'],['КАПУСТА','f'],['ПЕЧЕНЬЕ','f'],['ШОКОЛАД','f'],['МОРОЖЕНОЕ','f'],['БЛИНЫ','f'],['СМЕТАНА','f'],
      ['РЕКА','n'],['ГОРА','n'],['ОЗЕРО','n'],['ЛЕС','n'],['ПОЛЕ','n'],['ОБЛАКО','n'],['ДОЖДЬ','n'],['РАДУГА','n'],['ЗВЕЗДА','n'],['ЛУНА','n'],
      ['СОЛНЦЕ','n'],['ВЕТЕР','n'],['СНЕГ','n'],['ЦВЕТОК','n'],['ДЕРЕВО','n'],['ТРАВА','n'],['КАМЕНЬ','n'],['ПЕСОК','n'],['ВОЛНА','n'],['ОСТРОВ','n'],
      ['ТЕЛЕФОН','t'],['КОМПЬЮТЕР','t'],['МАШИНА','t'],['САМОЛЕТ','t'],['ПОЕЗД','t'],['РАКЕТА','t'],['ХОЛОДИЛЬНИК','t'],['ТЕЛЕВИЗОР','t'],['ВЕЛОСИПЕД','t'],['КАМЕРА','t'],
      ['ПРИНТЕР','t'],['РОБОТ','t'],['ЛАМПОЧКА','t'],['БАТАРЕЯ','t'],['НОУТБУК','t'],['НАУШНИКИ','t'],['ЧАЙНИК','t'],['ПЫЛЕСОС','t'],['ЛИФТ','t'],['ТРАКТОР','t'],
      ['ФУТБОЛ','s'],['ХОККЕЙ','s'],['ТЕННИС','s'],['БОКС','s'],['ШАХМАТЫ','s'],['ПЛАВАНИЕ','s'],['БАСКЕТБОЛ','s'],['ВОЛЕЙБОЛ','s'],['ЛЫЖИ','s'],['КОНЬКИ','s'],
      ['МАРАФОН','s'],['БОРЬБА','s'],['ГИМНАСТИКА','s'],['ВОРОТА','s'],['МЕДАЛЬ','s'],['ТРЕНЕР','s'],['СТАДИОН','s'],['РАКЕТКА','s'],['КОМАНДА','s'],['РЕКОРД','s']
    ],
    rows: ['ЙЦУКЕНГШЩЗХЪ', 'ФЫВАПРОЛДЖЭ', 'ЯЧСМИТЬБЮ']
  },
  en: {
    cats: { a: 'Animals', f: 'Food', n: 'Nature', t: 'Tech', s: 'Sport' },
    words: [
      ['MONKEY','a'],['ELEPHANT','a'],['GIRAFFE','a'],['PENGUIN','a'],['DOLPHIN','a'],['TURTLE','a'],['RABBIT','a'],['TIGER','a'],['CAMEL','a'],['EAGLE','a'],
      ['SQUIRREL','a'],['CROCODILE','a'],['PARROT','a'],['HAMSTER','a'],['DONKEY','a'],['KANGAROO','a'],['LEOPARD','a'],['OCTOPUS','a'],['SPIDER','a'],['WHALE','a'],
      ['BREAD','f'],['CHEESE','f'],['POTATO','f'],['ORANGE','f'],['BANANA','f'],['BURGER','f'],['PIZZA','f'],['COOKIE','f'],['CHOCOLATE','f'],['PANCAKE','f'],
      ['TOMATO','f'],['CARROT','f'],['CABBAGE','f'],['SAUSAGE','f'],['NOODLES','f'],['YOGURT','f'],['HONEY','f'],['BUTTER','f'],['SALAD','f'],['MANGO','f'],
      ['RIVER','n'],['MOUNTAIN','n'],['FOREST','n'],['ISLAND','n'],['RAINBOW','n'],['THUNDER','n'],['FLOWER','n'],['DESERT','n'],['OCEAN','n'],['VALLEY','n'],
      ['SUNSET','n'],['BREEZE','n'],['GLACIER','n'],['MEADOW','n'],['PEBBLE','n'],['VOLCANO','n'],['CANYON','n'],['JUNGLE','n'],['LAGOON','n'],['AURORA','n'],
      ['LAPTOP','t'],['CAMERA','t'],['ROCKET','t'],['ENGINE','t'],['PRINTER','t'],['BATTERY','t'],['MONITOR','t'],['KEYBOARD','t'],['TRACTOR','t'],['ELEVATOR','t'],
      ['BICYCLE','t'],['AIRPLANE','t'],['SATELLITE','t'],['TELESCOPE','t'],['SPEAKER','t'],['CHARGER','t'],['DRONE','t'],['ROUTER','t'],['SCOOTER','t'],['FRIDGE','t'],
      ['SOCCER','s'],['HOCKEY','s'],['TENNIS','s'],['BOXING','s'],['MARATHON','s'],['SWIMMING','s'],['CRICKET','s'],['ARCHERY','s'],['BOWLING','s'],['SKATING','s'],
      ['MEDAL','s'],['STADIUM','s'],['RACKET','s'],['GOALKEEPER','s'],['REFEREE','s'],['TROPHY','s'],['SPRINT','s'],['JERSEY','s'],['COACH','s'],['RECORD','s']
    ],
    rows: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { DATA: DATA };
if (typeof MG === 'undefined') return;

MG.register('hangman', function (container, api) {
  var C = api.colors;
  var L = DATA[api.lang] || DATA.en;
  var MAXMISS = 7;

  var round = 0, ROUNDS = 8, wins = 0, score = 0, over = false;
  var word, cat, guessed, misses, used, timers = [];

  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;padding:10px;color:' + C.text + ';font-family:inherit;';
  container.appendChild(root);

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;color:' + C.muted + ';padding:2px 4px 8px;';
  root.appendChild(head);

  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;margin:0 auto;';
  root.appendChild(canvas);
  var g = canvas.getContext('2d');

  var catEl = document.createElement('div');
  catEl.style.cssText = 'text-align:center;color:' + C.muted + ';font-size:13px;padding:6px 0 2px;';
  root.appendChild(catEl);

  var wordEl = document.createElement('div');
  wordEl.style.cssText = 'text-align:center;font-size:26px;font-weight:700;letter-spacing:6px;padding:8px 0 14px;min-height:44px;';
  root.appendChild(wordEl);

  var kb = document.createElement('div');
  kb.style.cssText = 'margin-top:auto;display:flex;flex-direction:column;gap:5px;padding-bottom:6px;';
  root.appendChild(kb);

  var keyEls = {};
  L.rows.forEach(function (row) {
    var r = document.createElement('div');
    r.style.cssText = 'display:flex;gap:4px;justify-content:center;';
    row.split('').forEach(function (ch) {
      var b = document.createElement('button');
      b.textContent = ch;
      b.style.cssText = 'flex:1;max-width:34px;padding:9px 0;border:0;border-radius:6px;background:' + C.panel +
        ';color:' + C.text + ';font-size:14px;font-weight:600;cursor:pointer;';
      b.onclick = function () { guess(ch); };
      keyEls[ch] = b;
      r.appendChild(b);
    });
    kb.appendChild(r);
  });

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function newRound() {
    var pick = L.words[(Math.random() * L.words.length) | 0];
    word = pick[0];
    cat = L.cats[pick[1]];
    guessed = {};
    misses = 0;
    used = {};
    for (var k in keyEls) {
      keyEls[k].style.background = C.panel;
      keyEls[k].style.color = C.text;
      keyEls[k].disabled = false;
    }
    render();
  }

  function render() {
    head.innerHTML = '';
    var l = document.createElement('span');
    l.textContent = (api.lang === 'ru' ? 'Раунд ' : 'Round ') + (round + 1) + '/' + ROUNDS;
    var rr = document.createElement('span');
    rr.textContent = api.t('score') + ': ' + score;
    head.appendChild(l); head.appendChild(rr);
    catEl.textContent = '📁 ' + cat;
    wordEl.textContent = word.split('').map(function (ch) { return guessed[ch] ? ch : '_'; }).join(' ');
    drawGallows();
  }

  function drawGallows() {
    var w = Math.min(200, container.clientWidth * 0.5);
    var dpr = api.lowEnd ? 1 : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = w * 0.9 * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = w * 0.9 + 'px';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, w);
    g.strokeStyle = C.muted;
    g.lineWidth = 3;
    g.lineCap = 'round';
    var h = w * 0.9;
    // gallows frame
    line(w * 0.1, h * 0.95, w * 0.7, h * 0.95);
    line(w * 0.25, h * 0.95, w * 0.25, h * 0.08);
    line(w * 0.25, h * 0.08, w * 0.62, h * 0.08);
    line(w * 0.62, h * 0.08, w * 0.62, h * 0.2);
    g.strokeStyle = C.bad;
    var cx = w * 0.62;
    if (misses > 0) { g.beginPath(); g.arc(cx, h * 0.28, w * 0.08, 0, 6.2832); g.stroke(); }
    if (misses > 1) line(cx, h * 0.36, cx, h * 0.6);
    if (misses > 2) line(cx, h * 0.42, cx - w * 0.1, h * 0.52);
    if (misses > 3) line(cx, h * 0.42, cx + w * 0.1, h * 0.52);
    if (misses > 4) line(cx, h * 0.6, cx - w * 0.09, h * 0.75);
    if (misses > 5) line(cx, h * 0.6, cx + w * 0.09, h * 0.75);
    if (misses > 6) { // face X eyes
      g.font = (w * 0.07 | 0) + 'px sans-serif';
      g.fillStyle = C.bad;
      g.textAlign = 'center';
      g.fillText('✖ ✖', cx, h * 0.28);
    }
    function line(a, b, c, d) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
  }

  function guess(ch) {
    if (over || used[ch]) return;
    used[ch] = true;
    var el = keyEls[ch];
    el.disabled = true;
    if (word.indexOf(ch) >= 0) {
      guessed[ch] = true;
      el.style.background = C.good;
      el.style.color = '#fff';
      api.haptic('light');
      var done = word.split('').every(function (c) { return guessed[c]; });
      render();
      if (done) {
        wins++;
        var gained = 50 + 10 * (MAXMISS - misses);
        score += gained;
        api.score(score);
        api.haptic('success');
        wordEl.style.color = C.good;
        later(nextRound, 1100);
      }
    } else {
      misses++;
      el.style.background = C.bad;
      el.style.color = '#fff';
      api.haptic('error');
      render();
      if (misses >= MAXMISS) {
        wordEl.textContent = word.split('').join(' ');
        wordEl.style.color = C.bad;
        later(nextRound, 1400);
      }
    }
  }

  function nextRound() {
    if (over) return;
    wordEl.style.color = C.text;
    round++;
    if (round >= ROUNDS) {
      over = true;
      api.gameOver(score, { win: wins >= 5 });
    } else newRound();
  }

  function onKey(e) {
    var ch = e.key.toUpperCase();
    if (ch === 'Ё') ch = 'Е';
    if (keyEls[ch]) guess(ch);
  }
  window.addEventListener('keydown', onKey);

  api.score(0);
  newRound();

  return {
    destroy: function () {
      over = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    },
    pause: function () {},
    resume: function () {}
  };
});
})();
