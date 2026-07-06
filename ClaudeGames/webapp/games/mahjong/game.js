/* Mahjong solitaire — 72 tiles, layered layouts, guaranteed-solvable deals. */
(function () {
'use strict';

/*DEAL*/
function mjLayouts() {
  var A = [], B = [], x, y;
  // Layout A "pyramid": 8x6 base, 5x4 middle (offset x), 2x2 top. 48+20+4=72
  for (y = 0; y <= 10; y += 2) for (x = 0; x <= 14; x += 2) A.push({ x: x, y: y, z: 0 });
  for (y = 2; y <= 8; y += 2) for (x = 3; x <= 11; x += 2) A.push({ x: x, y: y, z: 1 });
  for (y = 4; y <= 6; y += 2) for (x = 6; x <= 8; x += 2) A.push({ x: x, y: y, z: 2 });
  // Layout B "fortress": 10x5 base, 6x3 middle (offset x+y), 2x2 top. 50+18+4=72
  for (y = 0; y <= 8; y += 2) for (x = 0; x <= 18; x += 2) B.push({ x: x, y: y, z: 0 });
  for (y = 1; y <= 5; y += 2) for (x = 5; x <= 15; x += 2) B.push({ x: x, y: y, z: 1 });
  for (y = 2; y <= 4; y += 2) for (x = 9; x <= 11; x += 2) B.push({ x: x, y: y, z: 2 });
  return [A, B];
}
/* Half-unit grid: a tile occupies [x,x+2)x[y,y+2) at layer z.
   Free = nothing overlapping above AND (left edge open OR right edge open). */
function mjFree(list, t) {
  var L = false, R = false, i, o, dx, dy;
  for (i = 0; i < list.length; i++) {
    o = list[i];
    if (o === t) continue;
    dy = o.y - t.y; if (dy < 0) dy = -dy;
    if (dy >= 2) continue;
    if (o.z > t.z) {
      dx = o.x - t.x; if (dx < 0) dx = -dx;
      if (dx < 2) return false; // covered from above
    } else if (o.z === t.z) {
      if (o.x === t.x - 2) L = true;
      else if (o.x === t.x + 2) R = true;
    }
  }
  return !L || !R;
}
/* Deal by reverse removal: repeatedly pick two currently-free positions and
   assign them a matching pair — the pick order is itself a solution. */
function mjTryDeal(positions, pairBag) {
  var bag = pairBag.slice(), i, j, t, k;
  for (i = bag.length - 1; i > 0; i--) { j = (Math.random() * (i + 1)) | 0; t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
  var rem = [], values = new Array(positions.length), order = [];
  for (i = 0; i < positions.length; i++) rem.push(i);
  while (rem.length) {
    var live = [], free = [];
    for (k = 0; k < rem.length; k++) live.push(positions[rem[k]]);
    for (k = 0; k < rem.length; k++) if (mjFree(live, positions[rem[k]])) free.push(k);
    if (free.length < 2) return null; // dead end, caller retries
    var ai = free[(Math.random() * free.length) | 0], bi = ai;
    while (bi === ai) bi = free[(Math.random() * free.length) | 0];
    var v = bag.pop();
    values[rem[ai]] = v; values[rem[bi]] = v;
    order.push([rem[ai], rem[bi]]);
    if (ai < bi) { rem.splice(bi, 1); rem.splice(ai, 1); }
    else { rem.splice(ai, 1); rem.splice(bi, 1); }
  }
  return { values: values, order: order };
}
function mjDeal(positions, pairBag, tries) {
  for (var a = 0, r; a < (tries || 300); a++) { r = mjTryDeal(positions, pairBag); if (r) return r; }
  return null;
}
/*ENDDEAL*/

MG.register('mahjong', function (container, api) {
  var C = api.colors, ru = api.lang === 'ru', low = api.lowEnd;
  var SYM = ['🌸', '🍁', '🎋', '🌙', '⭐', '🔥', '💧', '⚡', '🐉', '🐟', '🦋', '🍀', '🎐', '🏮', '🗻', '🌊', '🎴', '🌞'];

  function pc(s) {
    var m; s = String(s).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(s))) { var p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
    return [128, 128, 128];
  }
  function shade(c, amt) {
    var p = pc(c);
    function q(n) { n += amt; return n < 0 ? 0 : n > 255 ? 255 : n | 0; }
    return 'rgb(' + q(p[0]) + ',' + q(p[1]) + ',' + q(p[2]) + ')';
  }
  function rgba(c, a) { var p = pc(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }

  // alternate layout per round
  var st = api.load() || {};
  var li = st.li === 1 ? 1 : 0;
  api.save({ li: li === 0 ? 1 : 0 });
  var POS = mjLayouts()[li];
  var gw = 0, gh = 0, gz = 0, i;
  for (i = 0; i < POS.length; i++) {
    if (POS[i].x + 2 > gw) gw = POS[i].x + 2;
    if (POS[i].y + 2 > gh) gh = POS[i].y + 2;
    if (POS[i].z > gz) gz = POS[i].z;
  }

  var tiles = [], sel = null, score = 0, over = false, paused = false;
  var shuffles = 2, elapsed = 0, timeouts = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timeouts.push(id); return id; }

  // ----- DOM -----
  container.style.background = C.bg;
  var styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes mjshk{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}';
  container.appendChild(styleEl);

  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;color:' + C.text + ';user-select:none;-webkit-user-select:none;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;padding:8px 16px;font-size:14px;font-weight:700;';
  var timeLbl = document.createElement('div');
  timeLbl.style.color = C.muted;
  var leftLbl = document.createElement('div');
  leftLbl.style.color = C.accent;
  bar.appendChild(timeLbl); bar.appendChild(leftLbl);

  var wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;position:relative;min-height:0;overflow:hidden;';
  var board = document.createElement('div');
  board.style.cssText = 'position:absolute;';
  var msg = document.createElement('div');
  msg.style.cssText = 'position:absolute;left:10%;right:10%;top:45%;text-align:center;font-size:17px;font-weight:800;background:' + rgba(C.panel, 0.94) + ';border-radius:12px;padding:14px 10px;display:none;z-index:200;';
  wrap.appendChild(board); wrap.appendChild(msg);

  var btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:10px;justify-content:center;padding:8px 0 12px;';
  var BTN = 'border:0;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer;background:' + C.panel2 + ';color:' + C.text + ';';
  var hintBtn = document.createElement('button');
  hintBtn.style.cssText = BTN;
  hintBtn.textContent = '💡 ' + (ru ? 'Подсказка' : 'Hint') + ' -5';
  var shufBtn = document.createElement('button');
  shufBtn.style.cssText = BTN;
  btns.appendChild(hintBtn); btns.appendChild(shufBtn);

  root.appendChild(bar); root.appendChild(wrap); root.appendChild(btns);
  container.appendChild(root);

  // ----- tiles -----
  var edgeL = shade(C.panel, 52), edgeD = shade(C.panel, -42), face = shade(C.panel, 20);
  var SHDW = low ? '' : '2px 3px 3px rgba(0,0,0,.35)';

  var deal = mjDeal(POS, fullBag(), 400);
  if (!deal) { // practically unreachable: fall back to sequential pairs
    deal = { values: [] };
    for (i = 0; i < POS.length; i++) deal.values[i] = ((i >> 2) % 18);
  }
  for (i = 0; i < POS.length; i++) {
    var el = document.createElement('div');
    el.setAttribute('data-i', i);
    el.style.cssText = 'position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:5px;background:' + face +
      ';border:2px solid;border-color:' + edgeL + ' ' + edgeD + ' ' + edgeD + ' ' + edgeL + ';' +
      (low ? '' : 'box-shadow:' + SHDW + ';transition:transform .12s;');
    el.textContent = SYM[deal.values[i]];
    tiles.push({ pos: POS[i], val: deal.values[i], el: el, alive: true });
    board.appendChild(el);
  }

  function fullBag() {
    var b = [], k;
    for (k = 0; k < 18; k++) { b.push(k); b.push(k); }
    return b;
  }

  // ----- layout -----
  var ux = 20, uy = 26, sh = 4;
  function layout() {
    var aw = wrap.clientWidth - 12, ah = wrap.clientHeight - 12;
    if (aw <= 0 || ah <= 0) return;
    ux = Math.min(aw / (gw + 1), ah / ((gh + 1) * 1.3));
    uy = ux * 1.3;
    sh = Math.max(2, Math.round(ux * 0.22));
    var bw = gw * ux + sh * gz + 4, bh = gh * uy + sh * gz + 4;
    board.style.width = bw + 'px'; board.style.height = bh + 'px';
    board.style.left = ((wrap.clientWidth - bw) / 2) + 'px';
    board.style.top = ((wrap.clientHeight - bh) / 2) + 'px';
    for (var k = 0; k < tiles.length; k++) {
      var p = tiles[k].pos, s = tiles[k].el.style;
      s.left = (sh * gz + p.x * ux - p.z * sh) + 'px';
      s.top = (sh * gz + p.y * uy - p.z * sh) + 'px';
      s.width = (ux * 2 - 2) + 'px';
      s.height = (uy * 2 - 2) + 'px';
      s.fontSize = (ux * 1.02) + 'px';
      if (tiles[k] !== sel) s.zIndex = p.z + 1;
    }
  }
  window.addEventListener('resize', layout);

  // ----- rules -----
  function livePos() {
    var a = [], k;
    for (k = 0; k < tiles.length; k++) if (tiles[k].alive) a.push(tiles[k].pos);
    return a;
  }
  function isFree(t) { return t.alive && mjFree(livePos(), t.pos); }
  function findPair() {
    var lp = livePos(), fr = [], k, m;
    for (k = 0; k < tiles.length; k++) if (tiles[k].alive && mjFree(lp, tiles[k].pos)) fr.push(tiles[k]);
    for (k = 0; k < fr.length; k++)
      for (m = k + 1; m < fr.length; m++)
        if (fr[k].val === fr[m].val) return [fr[k], fr[m]];
    return null;
  }

  function setSel(t, on) {
    t.el.style.transform = on ? 'translateY(-6px)' : '';
    t.el.style.boxShadow = on ? '0 0 0 3px ' + C.accent + ',0 6px 10px rgba(0,0,0,.4)' : SHDW;
    t.el.style.zIndex = on ? 60 : (t.pos.z + 1);
  }
  function shake(t) {
    t.el.style.animation = 'mjshk .16s 2';
    later(function () { t.el.style.animation = ''; }, 380);
  }
  function flash(t) {
    var on = '0 0 0 3px ' + C.good;
    t.el.style.boxShadow = on;
    later(function () { if (sel !== t) t.el.style.boxShadow = SHDW; }, 280);
    later(function () { if (sel !== t) t.el.style.boxShadow = on; }, 480);
    later(function () { if (sel !== t) t.el.style.boxShadow = SHDW; }, 820);
  }
  function fly(t) {
    var el = t.el;
    if (low) { el.style.display = 'none'; return; }
    el.style.zIndex = 90;
    el.style.transition = 'transform .32s ease-in,opacity .32s';
    el.style.transform = 'translateY(-50px) scale(1.35)';
    el.style.opacity = '0';
    later(function () { el.style.display = 'none'; }, 340);
  }

  function aliveCount() {
    var n = 0, k;
    for (k = 0; k < tiles.length; k++) if (tiles[k].alive) n++;
    return n;
  }
  function updBar() {
    timeLbl.textContent = '⏱ ' + fmt(elapsed);
    leftLbl.textContent = '🀄 ' + aliveCount();
  }
  function updBtns() {
    shufBtn.textContent = '🔀 ' + (ru ? 'Микс' : 'Shuffle') + ' -20 (' + shuffles + ')';
    shufBtn.style.opacity = shuffles > 0 ? '1' : '0.4';
  }
  function fmt(s) { return ((s / 60) | 0) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function showMsg(t) {
    msg.textContent = t;
    msg.style.display = 'block';
    later(function () { msg.style.display = 'none'; }, 1800);
  }

  function removePair(a, b) {
    if (sel) setSel(sel, false);
    sel = null;
    a.alive = false; b.alive = false;
    score += 10; api.score(score);
    api.haptic('light');
    fly(a); fly(b);
    updBar();
    if (aliveCount() === 0) {
      over = true;
      var bonus = Math.max(0, 300 - elapsed);
      score += bonus; api.score(score);
      api.haptic('success');
      later(function () { api.gameOver(score, { win: true }); }, 500);
      return;
    }
    afterChange();
  }
  function afterChange() {
    if (findPair()) return;
    if (shuffles > 0) {
      showMsg(ru ? 'Нет ходов — перемешайте! 🔀' : 'No moves — shuffle! 🔀');
    } else {
      over = true;
      api.haptic('error');
      later(function () { api.gameOver(score); }, 700);
    }
  }

  function onTap(ev) {
    if (over || paused) return;
    var el = ev.target, k = -1;
    while (el && el !== board) {
      var a = el.getAttribute && el.getAttribute('data-i');
      if (a != null) { k = +a; break; }
      el = el.parentNode;
    }
    if (k < 0) return;
    var t = tiles[k];
    if (!t.alive) return;
    if (!isFree(t)) { shake(t); return; }
    if (sel === t) { setSel(t, false); sel = null; return; }
    if (sel && sel.val === t.val) { removePair(sel, t); return; }
    if (sel) setSel(sel, false);
    sel = t; setSel(t, true);
  }
  board.addEventListener('click', onTap);

  function onHint() {
    if (over || paused) return;
    var p = findPair();
    if (!p) { afterChange(); return; }
    score = Math.max(0, score - 5); api.score(score);
    flash(p[0]); flash(p[1]);
  }
  function onShuffle() {
    if (over || paused || shuffles <= 0) return;
    var idx = [], pos = [], cnt = {}, k, v;
    for (k = 0; k < tiles.length; k++) if (tiles[k].alive) {
      idx.push(k); pos.push(tiles[k].pos);
      cnt[tiles[k].val] = (cnt[tiles[k].val] || 0) + 1;
    }
    if (idx.length < 4) return;
    var bag = [];
    for (v in cnt) for (k = 0; k < cnt[v] / 2; k++) bag.push(+v);
    var res = mjDeal(pos, bag, 300);
    if (!res) { // remaining positions can't be solved by any assignment
      over = true;
      later(function () { api.gameOver(score); }, 500);
      return;
    }
    shuffles--;
    score = Math.max(0, score - 20); api.score(score);
    if (sel) { setSel(sel, false); sel = null; }
    for (k = 0; k < idx.length; k++) {
      tiles[idx[k]].val = res.values[k];
      tiles[idx[k]].el.textContent = SYM[res.values[k]];
    }
    updBtns();
    api.haptic('medium');
    afterChange();
  }
  hintBtn.addEventListener('click', onHint);
  shufBtn.addEventListener('click', onShuffle);

  var timer = setInterval(function () {
    if (!paused && !over) { elapsed++; timeLbl.textContent = '⏱ ' + fmt(elapsed); }
  }, 1000);

  api.score(0);
  updBar(); updBtns(); layout();

  return {
    destroy: function () {
      clearInterval(timer);
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      window.removeEventListener('resize', layout);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
