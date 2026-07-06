/* Word Circle — build words from a letter wheel; targets fill a crossword grid.
   Levels are generated from an embedded RU/EN dictionary: a 6-7 letter base word is
   chosen so that at least 4 dictionary sub-words exist → always solvable. */
(function () {
'use strict';

var DICT = {
  ru: ('КОТ,ТОК,КИТ,РОТ,СОК,НОС,СОН,ОСА,ЛЕС,СЕЛО,ЛЕТО,ТЕЛО,ДОМ,МОДА,КОМ,МАК,РАК,ИКРА,РИС,СЫР,СЫН,НОРА,РАНО,ГОРА,РОГА,НОГА,ГОН,ЛУНА,ВОЛНА,СЛОВО,ВОЛОС,ЛОВ,ВОЛ,СОВА,ОВАЛ,ЗОЛА,КОЗА,ЗАКОН,ОКНО,КИНО,ИОН,ПОЛЕ,ПОЛ,ЛЕВ,ПЕНАЛ,ПЛЕН,ЛЕН,СИЛА,ЛИСА,САЛО,ЛИПА,ПИЛА,ЛАМПА,МАЛО,ЛОМ,СМОЛА,МАСЛО,КОЛОС,СОКОЛ,КОЛ,ЛОСЬ,СОЛЬ,ЛИСТ,СТИЛЬ,ЛИТР,ТИР,ТРИ,РИТМ,МИР,РИМ,МИГ,ИГРА,РАГУ,РУКА,УРА,РУДА,ДАР,ДРАКА,КАДР,АРКА,КАРТА,ТАРА,АКТ,ТАКСИ,АИСТ,СТАЯ,ЖЕСТ,СЕТЬ,ТЕНЬ,СТЕНА,СЕНАТ,' +
    'НОТА,ТОН,САНКИ,КИСА,МИСКА,МАСКА,КАСКА,СУМКА,МУКА,КУМА,СУК,СУД,ДУША,ШУБА,ШУМ,МУЖ,ЛУЖА,ЖАЛО,ЖИЛА,НОЖ,НОЖИК,КОЖА,ЖУК,ЛУК,КУЛАК,КУКЛА,ЛАК,КЛАД,ЛАД,ДЕЛО,ДАТА,ВОДА,ДИВО,ВИД,ДИВАН,ВИНА,НИВА,ВАЗА,ЗАЛ,ЗУБ,БАЗА,БАК,КРАБ,БРАК,БАРАН,РАНА,БАНК,КАБАН,БАНКА,НЕБО,БЕТОН,НОТЫ,ТЫЛ,БЫЛЬ,БЫК,КЛЫК,МЫЛО,МОЛОТ,ТОМ,МОТОР,ТРОН,НОРМА,РОМАН,НАРОД,РАДОН,ДОНОР,ГОРОД,ДОРОГА,ГОД,РОД,ГРАД,ГОРН,ОГОНЬ,ГОСТЬ,ТРОС,СОРТ,РОСТ,ТОРС,ОСТРОВ,ВОРС,ТОВАР,ВАТА,ТРАВА,ОТВАР,АВТОР,ВОРОТА,ВОРОН,ВАГОН,' +
    'ВЕТКА,ВЕКА,ТКАНЬ,КАНАТ,НАКАТ,ТАНК,КАНТ,НИТКА,АНТИК,ТИНА,НИТЬ,КАТОК,ТОЧКА,КОЧКА,ПОЧКА,ПАКЕТ,ПОЕЗД,' +
    'КАРЕТА,РАКЕТА,АКТЕР,КАТЕР,РЕКА,ТЕАТР,ТЕРКА,АРЕНА,КРАН,ЭКРАН,НЕКТАР,АНКЕТА,' +
    'МАШИНА,ШИНА,НИША,МИНА,КАРТИНА,РАНКА,ТИТАН,ТИРАН,ГРАНИТ,ГИТАРА,ТАЙГА,ГАЙКА,ЧАЙКА,МАЙКА,ЗАЙКА,ЛЕЙКА,КЛЕЙ,ЮЛА,ЯМА,МАЯК,' +
    'СТОЛИЦА,СТОЛ,ЛИЦО,СЛОТ,ЦИТАТА,САЛАТ,АТЛАС,СКЛАД,СКАЛА,ЛАСКА,КЛАСС,ВЕСНА,НАВЕС,СЕНО,ВЕС,ВЕНА,СЕВ,АВАНС,СВАН,КВАС,ЗАПАД,ПАРАД,ПАРА,РАДА,ПАР,ДРАП,КАРАНДАШ,ШАРАДА,ДАЧА,ЧАША,ШАНС,НАШ,ШРАМ,МАРШ,ШАР,АРШИН,МИРАЖ,ЖИРАФ,ФАРШ,ШКАФ,ФАРА,ЖАРА,АЖУР,АБАЖУР,БУРА,БУРАН,УРАН,РУБКА,БУКВА,ВЕРБА,БЕРЕГ,ГЕРБ,БЕГ,ВЕТЕР,ВЕЕР,ТЕРЕМ,МЕТР,ТЕМА,МЕТА,АТОМ,ТОМАТ,МОСТ,СОМ,СТОГ,ГОЛОС,ЛОГОВО,ГОЛ,ОЛОВО,ВОЛОКНО,ОКНО,КЛОН,ЛОСК,СЛОН,НОЛЬ,СЛОВО'
  ).split(',').filter(function (w) { return /^[А-Я]{3,7}$/.test(w); }),
  en: ('CAT,ACT,RAT,TAR,ART,CAR,ARC,STAR,RATS,ARTS,CART,SCAR,CARTS,DOG,GOD,TEN,NET,TEA,EAT,ATE,SEAT,EAST,SET,SEA,TEAS,NEAT,ANT,TAN,NEST,SENT,TENS,ONE,NOTE,TONE,NOT,TON,STONE,ONSET,NOTES,PIN,NIP,PINE,NINE,SPIN,PINS,SNIPE,SPINE,PEN,PENS,DEN,END,SEND,ENDS,DENS,RED,HER,HERD,SHED,SHE,HENS,HEN,RENT,TERN,TREE,RENTS,STERN,EARN,NEAR,EAR,ERA,ARE,EARS,SEAR,SNARE,EARNS,NEARS,LEARN,RENAL,LANE,LEAN,REAL,EARL,LATER,ALERT,ALTER,RATE,TEAR,LATE,TALE,TEAL,LEAST,STEAL,TALES,STALE,SLATE,RAIN,' +
    'MAIN,AIM,MAN,NAME,MEAN,AMEN,MANE,MINE,MEN,TIME,ITEM,MITE,EMIT,TIMES,ITEMS,SMITE,LIME,MILE,SLIM,MILES,SLIME,SMILE,LIMES,RICE,ICE,NICE,PRICE,RIPE,PIER,PIE,RIP,EPIC,' +
    'STORE,SORT,ROSE,SORE,ROTS,REST,ROTE,TORE,' +
    'HEART,EARTH,HEAT,HATE,HEAR,HARE,HAT,THE,HATER,HEARS,SHARE,SHEAR,HEARTS,EARTHS,BREAD,BEAR,BARE,BEAD,DEAR,READ,DARE,BAR,BED,BAD,BEARD,' +
    'PLANET,PLANE,PLANT,PLAN,PLEA,LEAP,PALE,PEAL,PLATE,PETAL,LEAPT,PANEL,PENAL,PLANTS,PLANES,LAP,PAL,PAN,NAP,PEA,APE,PET,TAP,PAT,' +
    'MASTER,STREAM,SMART,MATES,STEAM,MEATS,TEAMS,TAMES,MARES,SMEAR,MATE,TEAM,MEAT,TAME,MARE,REAM,ARMS,MARS,RAMS,MAST,MATS,ARM,RAM,MAT,SAT,GARDEN,DANGER,GRAND,RANGE,ANGER,GRADE,RAGED,DRAG,RAGE,GEAR,DARN,RANG,GRAN,AGE,RAG,' +
    'SILVER,LIVES,EVILS,VEILS,LIVER,LIVE,EVIL,VEIL,VILE,ISLE,LIES,RILE,RISE,SIRE,VISE,LIE,VIE,SIR,ORANGE,GROAN,ORGAN,' +
    'WINTER,TWINE,WRITE,WINE,TWIN,WIRE,RITE,TIER,TIRE,WIT,WIN,TIN,NIT,FLOWER,FOWL,WOLF,FLOW,FLEW,LOWER,FORE,WORE,ROLE,LORE,FOE,LOW,OWL,ROW,FEW,' +
    'CANDLE,LANCE,CLEAN,LACED,DANCE,CANED,DECAL,LAND,LEAD,DEAL,LADE,DALE,CLAN,LACE,CANE,ACNE,AND,LAD,CAN,ACE,LISTEN,SILENT,TINSEL,ENLIST,INLETS,LIST,SILT,SLIT,TILE,LITE,TIES,SITE,' +
    'LINE,LENS,LIT,SIN,TIE,LET,BOTTLE,BOLT,BELT,LOBE,BET,LOB,LOT'
  ).split(',').filter(function (w) { return /^[A-Z]{3,7}$/.test(w); })
};

if (typeof module !== 'undefined' && module.exports) module.exports = { DICT: DICT };
if (typeof MG === 'undefined') return;

MG.register('words', function (container, api) {
  var C = api.colors;
  var lang = DICT[api.lang] && DICT[api.lang].length > 50 ? api.lang : 'en';
  var LIST = DICT[lang];
  var LEVELS = 8;

  // multiset containment: can `w` be built from letters of `base`?
  function fits(w, counts) {
    var c = {};
    for (var i = 0; i < w.length; i++) {
      var ch = w[i];
      c[ch] = (c[ch] || 0) + 1;
      if (c[ch] > (counts[ch] || 0)) return false;
    }
    return true;
  }
  function countsOf(w) {
    var c = {};
    for (var i = 0; i < w.length; i++) c[w[i]] = (c[w[i]] || 0) + 1;
    return c;
  }

  var level = 0, score = 0, coins = 0, over = false, timers = [];
  var base, targets, found, bonusFound, gridInfo;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function genLevel() {
    var bases = LIST.filter(function (w) { return w.length >= 6; });
    for (var attempt = 0; attempt < 200; attempt++) {
      var b = bases[(Math.random() * bases.length) | 0];
      var counts = countsOf(b);
      var subs = LIST.filter(function (w) { return w !== b && w.length >= 3 && fits(w, counts); });
      if (subs.length < 3) continue;
      // pick 3-5 varied-length targets + the base
      subs.sort(function (x, y) { return y.length - x.length || (Math.random() - 0.5); });
      var picked = [b];
      for (var i = 0; i < subs.length && picked.length < 6; i++) {
        if (picked.indexOf(subs[i]) < 0 && (picked.length < 4 || Math.random() < 0.6)) picked.push(subs[i]);
      }
      if (picked.length < 4) continue;
      base = b;
      targets = picked;
      found = {};
      bonusFound = {};
      gridInfo = placeCrossword(picked);
      return;
    }
    // extreme fallback
    base = bases[0];
    targets = [base];
    found = {};
    bonusFound = {};
    gridInfo = placeCrossword(targets);
  }

  /* Greedy crossword placement; falls back to stacked rows. */
  function placeCrossword(words) {
    var ws = words.slice().sort(function (a, b) { return b.length - a.length; });
    var cells = {}; // "r,c" -> letter
    var placedW = [];
    function canPlace(w, r, c, h) {
      var crossed = false;
      for (var i = 0; i < w.length; i++) {
        var rr = h ? r : r + i, cc = h ? c + i : c;
        var ex = cells[rr + ',' + cc];
        if (ex) {
          if (ex !== w[i]) return false;
          crossed = true;
        }
      }
      // ends must be empty
      var br = h ? r : r - 1, bc = h ? c - 1 : c;
      var ar = h ? r : r + w.length, ac = h ? c + w.length : c;
      if (cells[br + ',' + bc] || cells[ar + ',' + ac]) return false;
      return placedW.length === 0 || crossed;
    }
    function put(w, r, c, h) {
      var pos = [];
      for (var i = 0; i < w.length; i++) {
        var rr = h ? r : r + i, cc = h ? c + i : c;
        cells[rr + ',' + cc] = w[i];
        pos.push([rr, cc]);
      }
      placedW.push({ w: w, pos: pos });
    }
    put(ws[0], 0, 0, true);
    for (var i = 1; i < ws.length; i++) {
      var w = ws[i], done = false;
      // try crossing each existing cell
      var keys = Object.keys(cells);
      for (var k = 0; k < keys.length && !done; k++) {
        var kr = +keys[k].split(',')[0], kc = +keys[k].split(',')[1];
        var ch = cells[keys[k]];
        for (var li = 0; li < w.length && !done; li++) {
          if (w[li] !== ch) continue;
          // vertical through (kr,kc)
          if (canPlace(w, kr - li, kc, false)) { put(w, kr - li, kc, false); done = true; }
          else if (canPlace(w, kr, kc - li, true)) { put(w, kr, kc - li, true); done = true; }
        }
      }
      if (!done) {
        // stacked below everything
        var maxR = 0;
        placedW.forEach(function (p) { p.pos.forEach(function (q) { if (q[0] > maxR) maxR = q[0]; }); });
        put(w, maxR + 2, 0, true);
      }
    }
    // normalize offsets
    var minR = 1e9, minC = 1e9, maxR2 = -1e9, maxC2 = -1e9;
    placedW.forEach(function (p) { p.pos.forEach(function (q) {
      minR = Math.min(minR, q[0]); minC = Math.min(minC, q[1]);
      maxR2 = Math.max(maxR2, q[0]); maxC2 = Math.max(maxC2, q[1]);
    }); });
    placedW.forEach(function (p) { p.pos = p.pos.map(function (q) { return [q[0] - minR, q[1] - minC]; }); });
    return { words: placedW, rows: maxR2 - minR + 1, cols: maxC2 - minC + 1 };
  }

  /* ---------- DOM ---------- */
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;padding:10px;color:' + C.text +
    ';background:linear-gradient(180deg,' + C.bg + ',' + C.panel + ');';
  container.appendChild(root);

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;color:' + C.muted + ';padding:0 4px 6px;';
  root.appendChild(head);

  var gridEl = document.createElement('div');
  gridEl.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  root.appendChild(gridEl);

  var preview = document.createElement('div');
  preview.style.cssText = 'text-align:center;font-size:22px;font-weight:700;letter-spacing:4px;min-height:32px;padding:4px 0;';
  root.appendChild(preview);

  var wheel = document.createElement('div');
  wheel.style.cssText = 'position:relative;width:210px;height:210px;margin:0 auto 6px;flex-shrink:0;';
  root.appendChild(wheel);

  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;gap:8px;justify-content:center;padding-bottom:6px;';
  root.appendChild(toolbar);

  function tbtn(label, fn) {
    var b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:8px 16px;border:0;border-radius:10px;background:' + C.panel2 + ';color:' + C.text + ';font-size:14px;font-weight:600;cursor:pointer;';
    b.onclick = fn;
    toolbar.appendChild(b);
    return b;
  }
  tbtn('🔀', function () { buildWheel(); });
  tbtn('💡 -25', function () {
    if (score + coins < 25) return;
    score = Math.max(0, score - 25);
    revealHint();
    updateHead();
    api.score(score + coins);
  });

  var chain = [], dragging = false;
  var letterEls = [];

  function buildWheel() {
    wheel.innerHTML = '';
    letterEls = [];
    var letters = base.split('').sort(function () { return Math.random() - 0.5; });
    var R = 78, cx = 105, cy = 105;
    letters.forEach(function (ch, i) {
      var a = (i / letters.length) * Math.PI * 2 - Math.PI / 2;
      var el = document.createElement('div');
      el.textContent = ch;
      el.dataset.ch = ch;
      el.style.cssText = 'position:absolute;width:52px;height:52px;border-radius:50%;background:' + C.panel2 +
        ';color:' + C.text + ';display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;' +
        'left:' + (cx + R * Math.cos(a) - 26) + 'px;top:' + (cy + R * Math.sin(a) - 26) + 'px;' +
        'box-shadow:0 2px 6px rgba(0,0,0,.35);user-select:none;touch-action:none;';
      wheel.appendChild(el);
      letterEls.push(el);
    });
  }

  function setSel(el, on) {
    el.style.background = on ? C.accent : C.panel2;
    el.style.color = on ? '#fff' : C.text;
    if (!api.lowEnd) el.style.transform = on ? 'scale(1.12)' : '';
  }
  function chainAdd(el) {
    if (chain.indexOf(el) >= 0) return;
    chain.push(el);
    setSel(el, true);
    preview.textContent = chain.map(function (e) { return e.dataset.ch; }).join('');
    api.haptic('light');
  }
  function chainReset() {
    chain.forEach(function (e) { setSel(e, false); });
    chain = [];
    preview.textContent = '';
  }

  function onDown(e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.ch) {
      dragging = true;
      chainReset();
      chainAdd(t);
      e.preventDefault();
    }
  }
  function onMove(e) {
    if (!dragging) return;
    var p = e.touches ? e.touches[0] : e;
    var el = document.elementFromPoint(p.clientX, p.clientY);
    if (el && el.dataset && el.dataset.ch && el.parentNode === wheel) chainAdd(el);
    e.preventDefault();
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    submit();
  }
  wheel.addEventListener('touchstart', onDown, { passive: false });
  wheel.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
  wheel.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  function submit() {
    var w = chain.map(function (e) { return e.dataset.ch; }).join('');
    chainReset();
    if (w.length < 3) return;
    if (targets.indexOf(w) >= 0 && !found[w]) {
      found[w] = true;
      score += w.length * 10;
      api.score(score + coins);
      api.haptic('success');
      renderGrid();
      updateHead();
      var all = targets.every(function (t) { return found[t]; });
      if (all) levelDone();
    } else if (found[w]) {
      shake(preview);
    } else {
      // bonus word: any dictionary word buildable from base letters
      var counts = countsOf(base);
      if (LIST.indexOf(w) >= 0 && fits(w, counts) && !bonusFound[w]) {
        bonusFound[w] = true;
        coins += 5;
        api.score(score + coins);
        api.haptic('light');
        float('+5 🪙');
      } else {
        shake(preview);
        api.haptic('error');
      }
    }
    updateHead();
  }

  function shake(el) {
    if (api.lowEnd) return;
    el.style.transition = 'transform .07s';
    var i = 0;
    var id = setInterval(function () {
      el.style.transform = 'translateX(' + (i % 2 ? -6 : 6) + 'px)';
      if (++i > 5) { clearInterval(id); el.style.transform = ''; }
    }, 70);
    timers.push(id);
  }
  function float(text) {
    var f = document.createElement('div');
    f.textContent = text;
    f.style.cssText = 'position:absolute;left:50%;top:38%;transform:translateX(-50%);color:' + C.good +
      ';font-weight:800;font-size:20px;transition:all 1s ease-out;pointer-events:none;z-index:5;';
    root.appendChild(f);
    later(function () { f.style.top = '28%'; f.style.opacity = '0'; }, 30);
    later(function () { f.remove(); }, 1100);
  }

  function revealHint() {
    // reveal one letter of an unfound target
    var un = targets.filter(function (t) { return !found[t]; });
    if (!un.length) return;
    var w = un[0];
    var info = gridInfo.words.filter(function (p) { return p.w === w; })[0];
    if (!info) return;
    (info.hints = info.hints || {});
    for (var i = 0; i < w.length; i++) {
      if (!info.hints[i]) { info.hints[i] = true; break; }
    }
    renderGrid();
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    var rows = gridInfo.rows, cols = gridInfo.cols;
    var availW = container.clientWidth - 24, availH = gridEl.clientHeight || 200;
    var cs = Math.max(20, Math.min(40, Math.floor(Math.min(availW / cols, availH / rows))));
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:' + cols * cs + 'px;height:' + rows * cs + 'px;';
    gridEl.appendChild(wrap);
    gridInfo.words.forEach(function (p) {
      var isFound = found[p.w];
      p.pos.forEach(function (q, i) {
        var d = document.createElement('div');
        var show = isFound || (p.hints && p.hints[i]);
        d.textContent = show ? p.w[i] : '';
        d.style.cssText = 'position:absolute;left:' + (q[1] * cs) + 'px;top:' + (q[0] * cs) + 'px;width:' + (cs - 3) +
          'px;height:' + (cs - 3) + 'px;border-radius:6px;display:flex;align-items:center;justify-content:center;' +
          'font-weight:800;font-size:' + (cs * 0.55 | 0) + 'px;' +
          'background:' + (isFound ? C.good : C.panel2) + ';color:' + (isFound ? '#fff' : C.text) + ';';
        wrap.appendChild(d);
      });
    });
  }

  function updateHead() {
    head.innerHTML = '';
    var a = document.createElement('span');
    a.textContent = api.t('level') + ' ' + (level + 1) + '/' + LEVELS;
    var b = document.createElement('span');
    b.textContent = '🪙 ' + coins + '   ' + api.t('score') + ': ' + (score + coins);
    head.appendChild(a); head.appendChild(b);
  }

  function levelDone() {
    score += 100;
    api.score(score + coins);
    float('+100');
    later(function () {
      if (over) return;
      level++;
      if (level >= LEVELS) {
        over = true;
        api.save(null);
        api.gameOver(score + coins, { win: true });
      } else {
        genLevel();
        buildWheel();
        renderGrid();
        updateHead();
      }
    }, 1300);
  }

  api.score(0);
  genLevel();
  buildWheel();
  updateHead();
  later(renderGrid, 30); // after layout

  return {
    destroy: function () {
      over = true;
      timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    },
    pause: function () {},
    resume: function () {}
  };
});
})();
