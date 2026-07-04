/* Word Search — drag a straight line over letters; 5 rounds, growing grids. */
(function () {
'use strict';

var WORDS = {
  ru: 'СОБАКА,КОШКА,МЕДВЕДЬ,ЗАЯЦ,ВОЛК,ЛОШАДЬ,ТИГР,СЛОН,БЕЛКА,ПИНГВИН,ХЛЕБ,МОЛОКО,ЯБЛОКО,БОРЩ,ПИРОГ,ОГУРЕЦ,МОРКОВЬ,КАПУСТА,БЛИНЫ,СЫР,РЕКА,ГОРА,ОЗЕРО,ЛЕС,ПОЛЕ,ДОЖДЬ,РАДУГА,ЗВЕЗДА,ЛУНА,ВЕТЕР,СНЕГ,ЦВЕТОК,ДЕРЕВО,ТРАВА,КАМЕНЬ,ПЕСОК,ВОЛНА,ОСТРОВ,ТЕЛЕФОН,МАШИНА,ПОЕЗД,РАКЕТА,РОБОТ,ЛАМПА,ЧАЙНИК,ЛИФТ,ФУТБОЛ,ХОККЕЙ,ТЕННИС,БОКС,ЛЫЖИ,КОНЬКИ,МЕДАЛЬ,ТРЕНЕР,КОМАНДА,ШКОЛА,КНИГА,ОКНО,СТОЛ,СТУЛ,ДВЕРЬ,ГОРОД,УЛИЦА,МОСТ,ПАРК,ТЕАТР,МУЗЕЙ,ВРАЧ,ПОВАР,АРТИСТ,ЗИМА,ВЕСНА,ЛЕТО,ОСЕНЬ,УТРО,ВЕЧЕР,НОЧЬ'.split(','),
  en: 'MONKEY,TIGER,RABBIT,TURTLE,EAGLE,WHALE,SPIDER,CAMEL,PARROT,DOLPHIN,BREAD,CHEESE,POTATO,ORANGE,BANANA,PIZZA,COOKIE,HONEY,SALAD,MANGO,RIVER,FOREST,ISLAND,OCEAN,DESERT,FLOWER,VALLEY,SUNSET,BREEZE,JUNGLE,LAPTOP,CAMERA,ROCKET,ENGINE,DRONE,ROUTER,FRIDGE,SOCCER,HOCKEY,TENNIS,BOXING,MEDAL,TROPHY,COACH,SPRINT,SCHOOL,WINDOW,BRIDGE,STREET,MUSEUM,THEATER,DOCTOR,ARTIST,WINTER,SPRING,SUMMER,AUTUMN,MORNING,EVENING,NIGHT,GARDEN,CASTLE,MARKET,VILLAGE,PLANET,COMET,CLOUD,STORM,CANDLE,MIRROR,PILLOW,CARPET,GUITAR,VIOLIN,TRUMPET'.split(',')
};
var ALPHA = {
  ru: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЫЬЭЮЯ',
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
};

if (typeof module !== 'undefined' && module.exports) module.exports = { WORDS: WORDS };
if (typeof MG === 'undefined') return;

MG.register('wordsearch', function (container, api) {
  var C = api.colors;
  var cv = api.createCanvas();
  var g = cv.g;
  var lang = WORDS[api.lang] ? api.lang : 'en';
  var DIRS = [[1,0],[0,1],[1,1],[1,-1],[-1,0],[0,-1],[-1,-1],[-1,1]];
  var HUES = ['#4ea1ff','#4caf7d','#e0a94e','#b678e0','#e05a8a','#53c4c9','#8fb84e','#e0704e','#7d8fe0','#c9a353'];

  var round = 0, ROUNDS = 5;
  var N, grid, placed, foundCnt, score = 0, over = false, startTs;
  var drag = null, raf = 0, paused = false, banner = null, timers = [];
  var cell, ox, oy, listY;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function gen() {
    N = 8 + round;
    var count = 6 + Math.min(2, round);
    var pool = WORDS[lang].filter(function (w) { return w.length <= N; });
    grid = [];
    for (var i = 0; i < N * N; i++) grid.push('');
    placed = [];
    var guard = 0;
    while (placed.length < count && guard++ < 4000) {
      var w = pool[(Math.random() * pool.length) | 0];
      if (placed.some(function (p) { return p.w === w; })) continue;
      var d = DIRS[(Math.random() * DIRS.length) | 0];
      var maxR = d[1] > 0 ? N - w.length : (d[1] < 0 ? w.length - 1 : N - 1);
      var minR = d[1] < 0 ? w.length - 1 : 0;
      var maxC = d[0] > 0 ? N - w.length : (d[0] < 0 ? w.length - 1 : N - 1);
      var minC = d[0] < 0 ? w.length - 1 : 0;
      if (maxR < minR || maxC < minC) continue;
      var r0 = minR + ((Math.random() * (maxR - minR + 1)) | 0);
      var c0 = minC + ((Math.random() * (maxC - minC + 1)) | 0);
      var ok = true;
      for (i = 0; i < w.length; i++) {
        var ch = grid[(r0 + d[1] * i) * N + (c0 + d[0] * i)];
        if (ch && ch !== w[i]) { ok = false; break; }
      }
      if (!ok) continue;
      for (i = 0; i < w.length; i++) grid[(r0 + d[1] * i) * N + (c0 + d[0] * i)] = w[i];
      placed.push({ w: w, r: r0, c: c0, d: d, found: false, hue: HUES[placed.length % HUES.length] });
    }
    var A = ALPHA[lang];
    for (i = 0; i < N * N; i++) if (!grid[i]) grid[i] = A[(Math.random() * A.length) | 0];
    foundCnt = 0;
    startTs = Date.now();
    layout();
  }

  function layout() {
    var top = 40;
    var listH = Math.max(64, cv.H * 0.16);
    cell = Math.floor(Math.min((cv.W - 12) / N, (cv.H - top - listH) / N));
    ox = ((cv.W - cell * N) / 2) | 0;
    oy = top;
    listY = oy + cell * N + 8;
  }
  cv.onResize = layout;

  function cellAt(x, y) {
    var c = ((x - ox) / cell) | 0, r = ((y - oy) / cell) | 0;
    if (c < 0 || r < 0 || c >= N || r >= N) return null;
    return { r: r, c: c };
  }
  function snapLine(a, b) {
    var dr = b.r - a.r, dc = b.c - a.c;
    if (dr === 0 && dc === 0) return [a];
    var adr = Math.abs(dr), adc = Math.abs(dc);
    var len, sr, sc;
    if (adr === 0) { len = adc; sr = 0; sc = dc > 0 ? 1 : -1; }
    else if (adc === 0) { len = adr; sr = dr > 0 ? 1 : -1; sc = 0; }
    else { len = Math.min(adr, adc); sr = dr > 0 ? 1 : -1; sc = dc > 0 ? 1 : -1; }
    var out = [];
    for (var i = 0; i <= len; i++) out.push({ r: a.r + sr * i, c: a.c + sc * i });
    return out;
  }

  function pt(e) {
    var p = e.touches && e.touches.length ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    var r = cv.canvas.getBoundingClientRect();
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function down(e) {
    if (over || banner) return;
    var q = pt(e), c = cellAt(q.x, q.y);
    if (c) { drag = { a: c, b: c }; e.preventDefault(); }
  }
  function move(e) {
    if (!drag) return;
    var q = pt(e), c = cellAt(q.x, q.y);
    if (c) drag.b = c;
    e.preventDefault();
  }
  function up() {
    if (!drag) return;
    var line = snapLine(drag.a, drag.b);
    drag = null;
    var s = line.map(function (p) { return grid[p.r * N + p.c]; }).join('');
    var rs = s.split('').reverse().join('');
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (p.found || (p.w !== s && p.w !== rs)) continue;
      p.found = true;
      foundCnt++;
      score += 15;
      api.score(score);
      api.haptic('light');
      if (foundCnt === placed.length) roundDone();
      return;
    }
  }
  cv.canvas.addEventListener('touchstart', down, { passive: false });
  cv.canvas.addEventListener('touchmove', move, { passive: false });
  cv.canvas.addEventListener('touchend', up);
  cv.canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);

  function roundDone() {
    var secs = ((Date.now() - startTs) / 1000) | 0;
    var bonus = Math.max(0, 120 - secs);
    score += bonus;
    api.score(score);
    api.haptic('success');
    banner = '+' + (15 * placed.length + bonus);
    later(function () {
      if (over) return;
      banner = null;
      round++;
      if (round >= ROUNDS) { over = true; api.gameOver(score, { win: true }); }
      else gen();
    }, 1300);
  }

  function wordCells(p) {
    var out = [];
    for (var i = 0; i < p.w.length; i++) out.push((p.r + p.d[1] * i) * N + (p.c + p.d[0] * i));
    return out;
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText((api.lang === 'ru' ? 'Раунд ' : 'Round ') + (round + 1) + '/' + ROUNDS, 12, 22);
    g.textAlign = 'right';
    g.fillText(foundCnt + '/' + placed.length, cv.W - 12, 22);

    // found word overlays
    for (var i = 0; i < placed.length; i++) {
      if (!placed[i].found) continue;
      g.fillStyle = placed[i].hue + '44';
      wordCells(placed[i]).forEach(function (idx) {
        g.fillRect(ox + (idx % N) * cell, oy + ((idx / N) | 0) * cell, cell, cell);
      });
    }
    // drag highlight
    if (drag) {
      g.fillStyle = 'rgba(255,255,255,.14)';
      snapLine(drag.a, drag.b).forEach(function (p) {
        g.fillRect(ox + p.c * cell, oy + p.r * cell, cell, cell);
      });
    }
    // letters
    g.font = 'bold ' + (cell * 0.55 | 0) + 'px sans-serif';
    g.textAlign = 'center';
    g.fillStyle = C.text;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      g.fillText(grid[r * N + c], ox + c * cell + cell / 2, oy + r * cell + cell / 2 + 1);
    }
    // word list
    g.font = '13px sans-serif';
    var x = 12, y = listY + 10, maxW = cv.W - 24;
    for (i = 0; i < placed.length; i++) {
      var p = placed[i];
      var w = g.measureText(p.w).width + 14;
      if (x + w > maxW) { x = 12; y += 22; }
      g.fillStyle = p.found ? p.hue : C.muted;
      g.textAlign = 'left';
      g.fillText(p.w, x, y);
      if (p.found) {
        g.strokeStyle = p.hue;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x - 2, y);
        g.lineTo(x + w - 12, y);
        g.stroke();
      }
      x += w;
    }
    if (banner) {
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(0, cv.H / 2 - 40, cv.W, 80);
      g.fillStyle = C.good;
      g.font = 'bold 26px sans-serif';
      g.textAlign = 'center';
      g.fillText(banner, cv.W / 2, cv.H / 2);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!paused) draw();
  }

  api.score(0);
  gen();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      over = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      cv.canvas.removeEventListener('touchstart', down);
      cv.canvas.removeEventListener('touchmove', move);
      cv.canvas.removeEventListener('touchend', up);
      cv.canvas.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
