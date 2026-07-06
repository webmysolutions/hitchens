/* Memory — pairs. 3 levels: 4x4, 4x5, 5x6. DOM cards with CSS flip. */
(function () {
'use strict';
MG.register('memory', function (container, api) {
  var C = api.colors, ru = api.lang === 'ru', low = api.lowEnd;

  function pc(s) {
    var m; s = String(s).trim();
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [17 * parseInt(m[1][0], 16), 17 * parseInt(m[1][1], 16), 17 * parseInt(m[1][2], 16)];
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^rgba?\(([^)]+)\)/.exec(s))) { var p = m[1].split(','); return [+p[0], +p[1], +p[2]]; }
    return [128, 128, 128];
  }
  function rgba(c, a) { var p = pc(c); return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')'; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var EMO = ['🐶', '🦊', '🐼', '🐸', '🦄', '🐙', '🦋', '🐝', '🍕', '🍩', '🍓', '🚀', '🌈', '⚽', '🎩'];
  var LV = [{ c: 4, r: 4 }, { c: 4, r: 5 }, { c: 5, r: 6 }];

  var level = 0, total = 0, moves = 0, first = -1, lock = false, matched = 0;
  var over = false, paused = false, cards = [];
  var timeouts = [];
  function later(fn, ms) { var id = setTimeout(fn, ms); timeouts.push(id); return id; }

  // ----- DOM -----
  container.style.background = C.bg;
  var root = document.createElement('div');
  root.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;color:' + C.text + ';user-select:none;-webkit-user-select:none;';
  var bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;max-width:420px;padding:10px 14px;box-sizing:border-box;font-weight:700;font-size:15px;';
  var lvlLbl = document.createElement('div');
  lvlLbl.style.color = C.accent;
  var movesLbl = document.createElement('div');
  bar.appendChild(lvlLbl); bar.appendChild(movesLbl);

  var wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;width:100%;min-height:0;position:relative;';
  var gridEl = document.createElement('div');
  gridEl.style.cssText = 'display:grid;touch-action:manipulation;';
  var msg = document.createElement('div');
  msg.style.cssText = 'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-size:24px;font-weight:800;color:' + C.text + ';background:' + rgba(C.panel, 0.92) + ';padding:18px 8px;display:none;';
  wrap.appendChild(gridEl); wrap.appendChild(msg);
  root.appendChild(bar); root.appendChild(wrap);
  container.appendChild(root);

  var FACE = 'position:absolute;left:0;top:0;width:100%;height:100%;border-radius:10px;display:flex;align-items:center;justify-content:center;-webkit-backface-visibility:hidden;backface-visibility:hidden;';

  function makeCard(i, val) {
    var el = document.createElement('div');
    el.setAttribute('data-i', i);
    var cd = { el: el, val: val, open: false, matched: false };
    if (low) {
      el.style.cssText = 'display:flex;align-items:center;justify-content:center;border-radius:10px;background:' + C.panel2 + ';color:' + C.muted + ';transition:opacity .12s;cursor:pointer;';
      el.textContent = '❔';
    } else {
      el.style.cssText = 'position:relative;cursor:pointer;-webkit-perspective:600px;perspective:600px;';
      var inner = document.createElement('div');
      inner.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;transition:transform .35s;-webkit-transform-style:preserve-3d;transform-style:preserve-3d;';
      var front = document.createElement('div');
      front.style.cssText = FACE + 'background:' + C.panel2 + ';color:' + C.muted + ';';
      front.textContent = '❔';
      var back = document.createElement('div');
      back.style.cssText = FACE + 'background:' + C.panel + ';transform:rotateY(180deg);';
      back.textContent = val;
      inner.appendChild(front); inner.appendChild(back);
      el.appendChild(inner);
      cd.inner = inner; cd.back = back;
    }
    return cd;
  }
  function setOpen(cd, o) {
    cd.open = o;
    if (low) {
      cd.el.style.opacity = '0.35';
      (function (cd, o) {
        later(function () {
          cd.el.textContent = o ? cd.val : '❔';
          cd.el.style.background = o ? C.panel : C.panel2;
          cd.el.style.opacity = '1';
        }, 80);
      })(cd, o);
    } else {
      cd.inner.style.transform = o ? 'rotateY(180deg)' : '';
    }
  }
  function setMatched(cd) {
    cd.matched = true;
    var t = low ? cd.el : cd.back;
    t.style.background = rgba(C.good, 0.22);
    t.style.boxShadow = '0 0 0 2px ' + rgba(C.good, 0.55) + ' inset';
  }

  function updBar() {
    lvlLbl.textContent = api.t('level') + ' ' + (level + 1) + '/3';
    movesLbl.textContent = api.t('moves') + ': ' + moves;
  }

  function layout() {
    var lv = LV[level];
    var gap = level === 2 ? 6 : 8;
    var w = wrap.clientWidth - 20, h = wrap.clientHeight - 20;
    var s = Math.floor(Math.min((w - (lv.c - 1) * gap) / lv.c, (h - (lv.r - 1) * gap) / lv.r));
    s = Math.max(30, Math.min(s, 92));
    gridEl.style.gap = gap + 'px';
    gridEl.style.gridTemplateColumns = 'repeat(' + lv.c + ',' + s + 'px)';
    gridEl.style.gridAutoRows = s + 'px';
    gridEl.style.fontSize = Math.floor(s * 0.52) + 'px';
  }
  window.addEventListener('resize', layout);

  function buildLevel() {
    msg.style.display = 'none';
    gridEl.innerHTML = '';
    cards = [];
    moves = 0; first = -1; matched = 0; lock = false;
    var lv = LV[level], pairs = (lv.c * lv.r) / 2;
    var vals = shuffle(EMO.slice(0, pairs).concat(EMO.slice(0, pairs)));
    for (var i = 0; i < vals.length; i++) {
      var cd = makeCard(i, vals[i]);
      cards.push(cd);
      gridEl.appendChild(cd.el);
    }
    layout();
    updBar();
  }

  function levelDone() {
    var ls = Math.max(50, 1000 - moves * 15) + (level + 1) * 100;
    total += ls;
    api.score(total);
    api.haptic('success');
    if (level >= 2) {
      over = true;
      later(function () { api.gameOver(total, { win: true }); }, 600);
      return;
    }
    level++;
    lock = true;
    msg.textContent = '+' + ls + '  ·  ' + api.t('level') + ' ' + (level + 1);
    msg.style.display = 'block';
    later(buildLevel, 1000);
  }

  function onTap(ev) {
    if (over || paused || lock) return;
    var t = ev.target, i = -1;
    while (t && t !== gridEl) {
      var a = t.getAttribute && t.getAttribute('data-i');
      if (a != null) { i = +a; break; }
      t = t.parentNode;
    }
    if (i < 0) return;
    var cd = cards[i];
    if (cd.open || cd.matched) return;
    setOpen(cd, true);
    if (first < 0) { first = i; return; }
    var fc = cards[first];
    first = -1;
    moves++;
    updBar();
    if (fc.val === cd.val) {
      matched++;
      setMatched(fc); setMatched(cd);
      api.haptic('light');
      if (matched === cards.length / 2) levelDone();
    } else {
      lock = true;
      later(function () {
        setOpen(fc, false); setOpen(cd, false);
        lock = false;
      }, 700);
    }
  }
  gridEl.addEventListener('click', onTap);

  api.score(0);
  buildLevel();

  return {
    destroy: function () {
      for (var k = 0; k < timeouts.length; k++) clearTimeout(timeouts[k]);
      window.removeEventListener('resize', layout);
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
