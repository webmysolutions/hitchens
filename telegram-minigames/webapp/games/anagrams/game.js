/* Anagrams — unscramble words against the clock. */
(function () {
'use strict';

var WORDS = {
  ru: ('РЕКА,ГОРА,ЛУНА,ОКНО,СТОЛ,СТУЛ,МОРЕ,НЕБО,СНЕГ,ЛИСТ,ГРИБ,РЫБА,НОГА,РУКА,ГОДА,СЛОН,ВОЛК,КРОТ,НОРА,СОВА,РОСА,ВЕСНА,ЗИМА,ЛЕТО,ОСЕНЬ,ТРАВА,ВОЛНА,ЗВЕЗДА,КНИГА,ШКОЛА,ДВЕРЬ,ГОРОД,УЛИЦА,ПАРК,МОСТ,ВРАЧ,ПОВАР,АКТЕР,ПЕСНЯ,ТАНЕЦ,СКАЗКА,ДРУЖБА,РАДОСТЬ,СОБАКА,КОШКА,БЕЛКА,ЛОШАДЬ,КОРОВА,КУРИЦА,УТКА,ГУСЬ,ХЛЕБ,СЫР,КАША,СУП,ЧАЙ,КОФЕ,ТОРТ,ПИРОГ,ЯБЛОКО,ГРУША,СЛИВА,ВИШНЯ,МАЛИНА,АРБУЗ,ДЫНЯ,ЛИМОН,БАНАН,ОГУРЕЦ,ПОМИДОР,КАРТОШКА,МАШИНА,ПОЕЗД,РАКЕТА,РОБОТ,ЛАМПА,ЧАЙНИК,ТЕЛЕФОН,ЭКРАН,МЫШКА,ПИСЬМО,МАРКА,ГАЗЕТА,ЖУРНАЛ,КАРТА,ГЛОБУС,МЕЛОК,ДОСКА,ПЕНАЛ,РУЧКА,ТЕТРАДЬ,ЗАДАЧА,ОТВЕТ,ВОПРОС,УРОК,КЛАСС,ЗВОНОК,ИГРА,МЯЧ,ВОРОТА,МЕДАЛЬ,ТРЕНЕР,СТАДИОН,ЛЫЖИ,КОНЬКИ,ШАЙБА,КЛЮШКА,РАКЕТКА,СЕТКА,ФИНИШ,СТАРТ,РЕКОРД,ГЕРОЙ,ДРАКОН,ЗАМОК,КОРОНА,ПРИНЦ,РЫЦАРЬ,МЕЧ,ЩИТ,СТРЕЛА,БАШНЯ,КЛАД,ПИРАТ,КОРАБЛЬ,ПАРУС,ЯКОРЬ,ВОЛШЕБНИК,ЗВЕРЬ,ПТИЦА,ГНЕЗДО,ПЕРО,КРЫЛО,ХВОСТ,ЛАПА,ГРИВА,РОГА,КОПЫТО').split(','),
  en: ('RIVER,MOUNT,MOON,TABLE,CHAIR,OCEAN,CLOUD,SNOW,LEAF,FISH,HAND,YEAR,WOLF,OWL,ROSE,SPRING,WINTER,SUMMER,GRASS,WAVE,STAR,BOOK,SCHOOL,DOOR,CITY,STREET,PARK,BRIDGE,DOCTOR,ACTOR,SONG,DANCE,STORY,FRIEND,DOG,CAT,HORSE,COW,DUCK,GOOSE,BREAD,CHEESE,SOUP,TEA,COFFEE,CAKE,PIE,APPLE,PEAR,PLUM,CHERRY,MELON,LEMON,BANANA,TOMATO,POTATO,CAR,TRAIN,ROCKET,ROBOT,LAMP,KETTLE,PHONE,SCREEN,MOUSE,LETTER,STAMP,PAPER,MAP,GLOBE,CHALK,BOARD,PENCIL,PEN,LESSON,CLASS,BELL,GAME,BALL,GOAL,MEDAL,COACH,STADIUM,SKATE,PUCK,STICK,RACKET,NET,FINISH,START,RECORD,HERO,DRAGON,CASTLE,CROWN,PRINCE,KNIGHT,SWORD,SHIELD,ARROW,TOWER,PIRATE,SHIP,SAIL,ANCHOR,WIZARD,BEAST,BIRD,NEST,FEATHER,WING,TAIL,PAW,MANE,HORN,HOOF,GARDEN,FLOWER,MARKET,PLANET,COMET,STORM,CANDLE,MIRROR,PILLOW,CARPET,GUITAR,VIOLIN,DRUM,FLUTE,PIANO,SINGER,PAINT,BRUSH,COLOR,MUSIC,MOVIE,TICKET').split(',')
};

if (typeof module !== 'undefined' && module.exports) module.exports = { WORDS: WORDS };
if (typeof MG === 'undefined') return;

MG.register('anagrams', function (container, api) {
  var C = api.colors;
  var lang = WORDS[api.lang] ? api.lang : 'en';
  var TIME = 90;

  // sorted-letters index: any valid anagram from the list is accepted
  var index = {};
  WORDS[lang].forEach(function (w) {
    var k = w.split('').sort().join('');
    (index[k] = index[k] || []).push(w);
  });

  var score = 0, streak = 0, over = false, paused = false;
  var word, shuffled, answer = [], startWord = 0;
  var timeLeft = TIME, timerId = 0, timers = [];
  var minLen = 4;

  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;padding:12px;color:' + C.text + ';';
  container.appendChild(root);

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;color:' + C.muted + ';';
  root.appendChild(head);

  var barWrap = document.createElement('div');
  barWrap.style.cssText = 'height:6px;border-radius:3px;background:' + C.panel + ';margin:8px 0 0;overflow:hidden;';
  var bar = document.createElement('div');
  bar.style.cssText = 'height:100%;width:100%;background:' + C.accent + ';';
  barWrap.appendChild(bar);
  root.appendChild(barWrap);

  var slots = document.createElement('div');
  slots.style.cssText = 'display:flex;gap:6px;justify-content:center;margin:auto 0 14px;flex-wrap:wrap;';
  var tiles = document.createElement('div');
  tiles.style.cssText = 'display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;';
  var mid = document.createElement('div');
  mid.style.cssText = 'display:flex;flex-direction:column;justify-content:center;flex:1;';
  mid.appendChild(slots);
  mid.appendChild(tiles);
  root.appendChild(mid);

  var controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:8px;padding-bottom:8px;';
  root.appendChild(controls);
  function btn(label, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;padding:12px;border:0;border-radius:10px;background:' + C.panel2 + ';color:' + C.text + ';font-size:15px;font-weight:700;cursor:pointer;';
    b.onclick = fn;
    controls.appendChild(b);
    return b;
  }
  btn('⌫', function () {
    if (!answer.length) return;
    var t = answer.pop();
    t.el.style.visibility = 'visible';
    renderAnswer();
  });
  var skipBtn = btn(api.lang === 'ru' ? 'Пропустить (-5)' : 'Skip (-5)', function () {
    score = Math.max(0, score - 5);
    streak = 0;
    api.score(score);
    newWord();
  });
  skipBtn.style.flex = '2';

  function head2() {
    head.innerHTML = '';
    var a = document.createElement('span');
    a.textContent = api.t('score') + ': ' + score + (streak >= 3 ? ' 🔥x' + streak : '');
    var b = document.createElement('span');
    b.textContent = '⏱ ' + timeLeft;
    head.appendChild(a); head.appendChild(b);
  }

  function pickWord() {
    var pool = WORDS[lang].filter(function (w) { return w.length >= minLen && w.length <= minLen + 1; });
    if (!pool.length) pool = WORDS[lang];
    return pool[(Math.random() * pool.length) | 0];
  }

  function shuffleWord(w) {
    var a = w.split(''), s;
    do {
      for (var i = a.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0;
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      s = a.join('');
    } while (s === w && w.length > 2);
    return s;
  }

  function newWord() {
    word = pickWord();
    shuffled = shuffleWord(word);
    answer = [];
    startWord = Date.now();
    tiles.innerHTML = '';
    shuffled.split('').forEach(function (ch) {
      var t = document.createElement('button');
      t.textContent = ch;
      t.style.cssText = 'width:44px;height:50px;border:0;border-radius:8px;background:' + C.panel +
        ';color:' + C.text + ';font-size:22px;font-weight:700;cursor:pointer;';
      t.onclick = function () {
        if (t.style.visibility === 'hidden' || over) return;
        t.style.visibility = 'hidden';
        answer.push({ ch: ch, el: t });
        renderAnswer();
        if (answer.length === word.length) checkAnswer();
      };
      tiles.appendChild(t);
    });
    renderAnswer();
    head2();
  }

  function renderAnswer() {
    slots.innerHTML = '';
    for (var i = 0; i < word.length; i++) {
      var s = document.createElement('div');
      s.style.cssText = 'width:44px;height:50px;border-radius:8px;background:' + C.panel2 +
        ';display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;cursor:pointer;';
      if (answer[i]) {
        s.textContent = answer[i].ch;
        (function (idx) {
          s.onclick = function () {
            var t = answer.splice(idx, 1)[0];
            t.el.style.visibility = 'visible';
            renderAnswer();
          };
        })(i);
      }
      slots.appendChild(s);
    }
  }

  function checkAnswer() {
    var guess = answer.map(function (a) { return a.ch; }).join('');
    var k = guess.split('').sort().join('');
    var valid = (index[k] || []).indexOf(guess) >= 0;
    if (valid) {
      streak++;
      var speed = Math.max(0, 10 - (((Date.now() - startWord) / 1000) | 0));
      var gained = word.length * 10 + speed + (streak >= 3 ? 5 : 0);
      score += gained;
      api.score(score);
      api.haptic('light');
      flash(C.good);
      if (minLen < 6 && streak % 3 === 0) minLen++;
      timers.push(setTimeout(function () { if (!over) newWord(); }, 350));
    } else {
      api.haptic('error');
      streak = 0;
      flash(C.bad);
      // return all letters
      answer.forEach(function (a) { a.el.style.visibility = 'visible'; });
      answer = [];
      timers.push(setTimeout(renderAnswer, 250));
    }
    head2();
  }

  function flash(color) {
    slots.childNodes.forEach(function (s) { s.style.background = color; });
    timers.push(setTimeout(function () {
      slots.childNodes.forEach(function (s) { s.style.background = C.panel2; });
    }, 250));
  }

  timerId = setInterval(function () {
    if (paused || over) return;
    timeLeft--;
    bar.style.width = (100 * timeLeft / TIME) + '%';
    head2();
    if (timeLeft <= 0) {
      over = true;
      clearInterval(timerId);
      api.gameOver(score);
    }
  }, 1000);

  api.score(0);
  newWord();

  return {
    destroy: function () {
      over = true;
      clearInterval(timerId);
      timers.forEach(clearTimeout);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
