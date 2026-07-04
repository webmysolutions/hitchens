/* Dice Poker (Yahtzee) — 5 dice, 3 rolls per turn, 13-category scorecard. */
(function () {
'use strict';

/*CALC*/
/* cat: 0..5 = ones..sixes, 6 = 3 of a kind, 7 = 4 of a kind, 8 = full house,
   9 = small straight, 10 = large straight, 11 = yahtzee, 12 = chance */
function diceCalc(cat, d) {
  var cnt = [0, 0, 0, 0, 0, 0, 0], sum = 0, i, v;
  for (i = 0; i < 5; i++) { v = d[i]; cnt[v]++; sum += v; }
  if (cat < 6) return cnt[cat + 1] * (cat + 1);
  var mx = 0, p3 = false, p2 = false, run = 0, best = 0;
  for (v = 1; v <= 6; v++) {
    if (cnt[v] > mx) mx = cnt[v];
    if (cnt[v] >= 3) p3 = true; else if (cnt[v] === 2) p2 = true;
    if (cnt[v] > 0) { run++; if (run > best) best = run; } else run = 0;
  }
  if (cat === 6) return mx >= 3 ? sum : 0;
  if (cat === 7) return mx >= 4 ? sum : 0;
  if (cat === 8) return (p3 && p2) ? 25 : 0;
  if (cat === 9) return best >= 4 ? 30 : 0;
  if (cat === 10) return best >= 5 ? 40 : 0;
  if (cat === 11) return mx === 5 ? 50 : 0;
  return sum; // chance
}
/*ENDCALC*/

MG.register('dice', function (container, api) {
  var C = api.colors, ru = api.lang === 'ru', low = api.lowEnd;

  var NAMES = ru
    ? ['Единицы', 'Двойки', 'Тройки', 'Четвёрки', 'Пятёрки', 'Шестёрки', '3 одинаковых', '4 одинаковых', 'Фулл-хаус', 'Мал. стрит', 'Бол. стрит', 'Покер', 'Шанс']
    : ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', '3 of a kind', '4 of a kind', 'Full house', 'Sm. straight', 'Lg. straight', 'Yahtzee', 'Chance'];

  var dice = [1, 2, 3, 4, 5], held = [false, false, false, false, false];
  var used = [null, null, null, null, null, null, null, null, null, null, null, null, null];
  var turn = 0, rollsLeft = 3, rolled = false;
  var over = false, paused = false, anim = false;
  var timeouts = [], iv = 0;
  function later(fn, ms) { var id = setTimeout(fn, ms); timeouts.push(id); return id; }

  function pc(s) {
    var m; s = String(s).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(s))) { var p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
    return [128, 128, 128];
  }
  function rgba(c, a) { var p = pc(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }

  // ----- DOM -----
  container.style.background = C.bg;
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;color:' + C.text + ';user-select:none;-webkit-user-select:none;overflow-y:auto;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;width:100%;max-width:440px;box-sizing:border-box;padding:8px 16px 2px;font-size:14px;font-weight:700;';
  var turnLbl = document.createElement('div');
  turnLbl.style.color = C.accent;
  var rollsLbl = document.createElement('div');
  rollsLbl.style.color = C.muted;
  bar.appendChild(turnLbl); bar.appendChild(rollsLbl);

  var diceWrap = document.createElement('div');
  diceWrap.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:14px 0 6px;';

  // dice: face uses text color, pips use bg color — readable in both themes
  var PIP = [[25, 25], [75, 25], [25, 50], [50, 50], [75, 50], [25, 75], [75, 75]];
  var PAT = [null, [3], [0, 6], [0, 3, 6], [0, 1, 5, 6], [0, 1, 3, 5, 6], [0, 1, 2, 4, 5, 6]];
  var dieEls = [];
  for (var di = 0; di < 5; di++) {
    var del = document.createElement('div');
    del.setAttribute('data-d', di);
    del.style.cssText = 'position:relative;width:52px;height:52px;border-radius:11px;background:' + C.text + ';cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.35);' + (low ? '' : 'transition:transform .12s;');
    var pips = [];
    for (var p = 0; p < 7; p++) {
      var pip = document.createElement('div');
      pip.style.cssText = 'position:absolute;width:17%;height:17%;border-radius:50%;background:' + C.bg + ';transform:translate(-50%,-50%);left:' + PIP[p][0] + '%;top:' + PIP[p][1] + '%;display:none;';
      del.appendChild(pip); pips.push(pip);
    }
    dieEls.push({ el: del, pips: pips });
    diceWrap.appendChild(del);
  }
  function setFace(i, v) {
    var ps = dieEls[i].pips, on = PAT[v], p;
    for (p = 0; p < 7; p++) ps[p].style.display = 'none';
    for (p = 0; p < on.length; p++) ps[on[p]].style.display = 'block';
  }
  function setHeld(i) {
    dieEls[i].el.style.transform = held[i] ? 'translateY(-10px)' : '';
    dieEls[i].el.style.boxShadow = held[i] ? '0 0 0 3px ' + C.accent + ',0 4px 6px rgba(0,0,0,.4)' : '0 2px 4px rgba(0,0,0,.35)';
  }

  var rollBtn = document.createElement('button');
  rollBtn.className = 'mg-btn';
  rollBtn.style.margin = '6px 0 8px';

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,auto);grid-template-columns:1fr 1fr;gap:5px;width:100%;max-width:440px;box-sizing:border-box;padding:4px 10px 14px;';
  var rows = [], vals = [];
  function addRow(label, c) {
    var r = document.createElement('div');
    r.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:' + C.panel + ';border-radius:8px;padding:7px 10px;font-size:13px;font-weight:600;cursor:pointer;';
    var l = document.createElement('span');
    l.textContent = label;
    var v = document.createElement('span');
    v.style.cssText = 'font-weight:800;min-width:24px;text-align:right;';
    r.appendChild(l); r.appendChild(v);
    if (c >= 0) r.setAttribute('data-c', c);
    grid.appendChild(r);
    rows[c] = r; vals[c] = v;
    return { row: r, val: v };
  }
  for (var c1 = 0; c1 < 6; c1++) addRow(NAMES[c1], c1);
  var bonusRow = addRow((ru ? 'Бонус 63+' : 'Bonus 63+'), -1);
  bonusRow.row.style.cursor = 'default';
  bonusRow.row.style.background = rgba(C.accent, 0.15);
  for (var c2 = 6; c2 < 13; c2++) addRow(NAMES[c2], c2);

  root.appendChild(bar); root.appendChild(diceWrap); root.appendChild(rollBtn); root.appendChild(grid);
  container.appendChild(root);

  // ----- scoring state -----
  function upSum() { var s = 0, c; for (c = 0; c < 6; c++) if (used[c] != null) s += used[c]; return s; }
  function total() {
    var s = 0, c;
    for (c = 0; c < 13; c++) if (used[c] != null) s += used[c];
    if (upSum() >= 63) s += 35;
    return s;
  }

  function updAll() {
    turnLbl.textContent = (ru ? 'Ход ' : 'Turn ') + Math.min(turn + 1, 13) + '/13';
    rollsLbl.textContent = '🎲 ' + rollsLeft;
    rollBtn.textContent = (ru ? 'Бросить' : 'Roll') + ' (' + rollsLeft + ')';
    rollBtn.style.opacity = (rollsLeft > 0 && !over) ? '1' : '0.4';
    for (var i = 0; i < 5; i++) dieEls[i].el.style.opacity = rolled ? '1' : '0.45';
    for (var c = 0; c < 13; c++) {
      if (used[c] != null) {
        vals[c].textContent = used[c];
        vals[c].style.color = C.text;
        rows[c].style.opacity = '0.55';
        rows[c].style.cursor = 'default';
      } else if (rolled && !anim) {
        vals[c].textContent = diceCalc(c, dice);
        vals[c].style.color = C.muted;
        rows[c].style.opacity = '1';
      } else {
        vals[c].textContent = '·';
        vals[c].style.color = C.muted;
        rows[c].style.opacity = '1';
      }
    }
    var us = upSum();
    bonusRow.val.textContent = us >= 63 ? '+35' : us + '/63';
    bonusRow.val.style.color = us >= 63 ? C.good : C.muted;
  }

  // ----- actions -----
  function roll() {
    if (over || paused || anim || rollsLeft <= 0) return;
    anim = true;
    api.haptic('light');
    var finals = dice.slice(), i;
    for (i = 0; i < 5; i++) if (!held[i]) finals[i] = 1 + ((Math.random() * 6) | 0);
    function finish() {
      dice = finals;
      anim = false; rollsLeft--; rolled = true;
      for (var k = 0; k < 5; k++) setFace(k, dice[k]);
      updAll();
    }
    if (low) { finish(); return; }
    var n = 0;
    iv = setInterval(function () {
      n++;
      for (var k = 0; k < 5; k++) if (!held[k]) setFace(k, 1 + ((Math.random() * 6) | 0));
      if (n >= 7) { clearInterval(iv); iv = 0; finish(); }
    }, 65);
  }

  function toggleHold(i) {
    if (over || paused || anim || !rolled || rollsLeft <= 0) return;
    held[i] = !held[i];
    setHeld(i);
    api.haptic('light');
  }

  function commit(c) {
    if (over || paused || anim || !rolled || used[c] != null) return;
    var v = diceCalc(c, dice);
    used[c] = v;
    if (c === 11 && v === 50) api.haptic('success');
    else api.haptic('light');
    turn++;
    api.score(total());
    if (turn >= 13) {
      over = true;
      updAll();
      var tt = total();
      later(function () { api.gameOver(tt, { win: tt >= 200 }); }, 700);
      return;
    }
    rollsLeft = 3; rolled = false;
    for (var i = 0; i < 5; i++) { held[i] = false; setHeld(i); }
    updAll();
  }

  function onDiceTap(ev) {
    var el = ev.target;
    while (el && el !== diceWrap) {
      var a = el.getAttribute && el.getAttribute('data-d');
      if (a != null) { toggleHold(+a); return; }
      el = el.parentNode;
    }
  }
  function onGridTap(ev) {
    var el = ev.target;
    while (el && el !== grid) {
      var a = el.getAttribute && el.getAttribute('data-c');
      if (a != null) { commit(+a); return; }
      el = el.parentNode;
    }
  }
  diceWrap.addEventListener('click', onDiceTap);
  grid.addEventListener('click', onGridTap);
  rollBtn.addEventListener('click', roll);

  function onKey(e) {
    if (e.key === ' ' || e.key === 'r' || e.key === 'Enter') { roll(); e.preventDefault(); }
    else if (e.key >= '1' && e.key <= '5') toggleHold(+e.key - 1);
  }
  window.addEventListener('keydown', onKey);

  for (var f = 0; f < 5; f++) setFace(f, dice[f]);
  api.score(0);
  updAll();

  return {
    destroy: function () {
      if (iv) clearInterval(iv);
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      window.removeEventListener('keydown', onKey);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
