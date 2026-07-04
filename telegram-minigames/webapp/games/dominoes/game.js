/* Dominoes — classic draw dominoes vs AI (double-six set), first to 100. */
(function () {
'use strict';
MG.register('dominoes', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g, C = api.colors, RU = api.lang === 'ru';
  var TARGET = 100;
  var dead = false, paused = false, timers = [];

  function arm(o) {
    o.at = Date.now();
    o.id = setTimeout(function () {
      var i = timers.indexOf(o);
      if (i >= 0) timers.splice(i, 1);
      if (!dead && !paused) o.fn();
    }, o.rem);
  }
  function setT(fn, ms) {
    var o = { fn: fn, rem: ms, at: 0, id: 0 };
    timers.push(o);
    if (!paused) arm(o);
    return o;
  }

  var pScore = 0, aScore = 0, roundNum = 0;
  var hand = [], aiHand = [], boneyard = [], line = [];
  var turn = 'p', sel = -1, passStreak = 0, roundOver = true, matchOver = false, mustDraw = false, msg = '';
  var handRects = [], endLpt = null, endRpt = null, endLok = false, endRok = false, boneyRect = null;

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pips(h) { var s = 0; for (var i = 0; i < h.length; i++) s += h[i].a + h[i].b; return s; }
  function ends() { return { L: line[0].a, R: line[line.length - 1].b }; }
  function canPlay(t) { var e = ends(); return t.a === e.L || t.b === e.L || t.a === e.R || t.b === e.R; }
  function anyPlayable(h) { for (var i = 0; i < h.length; i++) if (canPlay(h[i])) return true; return false; }
  function place(t, end) {
    var e = ends();
    if (end === 'L') line.unshift(t.b === e.L ? { a: t.a, b: t.b } : { a: t.b, b: t.a });
    else line.push(t.a === e.R ? { a: t.a, b: t.b } : { a: t.b, b: t.a });
  }

  function deal() {
    roundNum++;
    for (;;) {
      var set = [];
      for (var a = 0; a <= 6; a++) for (var b = a; b <= 6; b++) set.push({ a: a, b: b });
      shuffle(set);
      hand = set.slice(0, 7); aiHand = set.slice(7, 14); boneyard = set.slice(14);
      var st = null, v, i;
      for (v = 6; v >= 0 && !st; v--) {
        for (i = 0; i < hand.length; i++) if (hand[i].a === v && hand[i].b === v) { st = { who: 'p', i: i }; break; }
        if (!st) for (i = 0; i < aiHand.length; i++) if (aiHand[i].a === v && aiHand[i].b === v) { st = { who: 'a', i: i }; break; }
      }
      if (st) { // highest double starts; none anywhere -> draw again (redeal)
        line = [];
        var t = (st.who === 'p' ? hand : aiHand).splice(st.i, 1)[0];
        line.push({ a: t.a, b: t.b });
        turn = st.who === 'p' ? 'a' : 'p';
        break;
      }
    }
    sel = -1; passStreak = 0; roundOver = false; mustDraw = false;
    beginTurn();
  }

  function beginTurn() {
    if (roundOver || dead) return;
    mustDraw = false; sel = -1;
    if (turn === 'a') {
      msg = api.t('thinking');
      draw();
      setT(aiMove, 700 + Math.random() * 500);
    } else {
      msg = api.t('your_turn');
      if (!anyPlayable(hand)) {
        if (boneyard.length) { mustDraw = true; msg = RU ? 'Возьми из базара' : 'Draw from the boneyard'; }
        else { msg = RU ? 'Пас…' : 'Pass…'; draw(); setT(doPass, 900); return; }
      }
      draw();
    }
  }

  function doPass() {
    if (roundOver) return;
    passStreak++;
    if (passStreak >= 2) return blockEnd();
    turn = turn === 'p' ? 'a' : 'p';
    beginTurn();
  }

  function blockEnd() {
    var ps = pips(hand), as = pips(aiHand);
    if (ps < as) finishRound('p', as);
    else if (as < ps) finishRound('a', ps);
    else finishRound(null, 0);
  }

  function afterMove(who) {
    passStreak = 0;
    var h = who === 'p' ? hand : aiHand;
    if (!h.length) return finishRound(who, pips(who === 'p' ? aiHand : hand));
    turn = who === 'p' ? 'a' : 'p';
    beginTurn();
  }

  function finishRound(w, pts) {
    roundOver = true; sel = -1; mustDraw = false;
    if (w === 'p') { pScore += pts; api.score(pScore); api.haptic('success'); msg = api.t('you_win') + '  +' + pts; }
    else if (w === 'a') { aScore += pts; api.haptic('error'); msg = api.t('you_lose') + '  +' + pts; }
    else msg = api.t('draw');
    draw();
    setT(function () {
      if (pScore >= TARGET || aScore >= TARGET) {
        matchOver = true;
        api.gameOver(pScore, { win: pScore > aScore });
      } else deal();
    }, 1800);
  }

  function aiMove() {
    if (roundOver || dead) return;
    while (!anyPlayable(aiHand) && boneyard.length) aiHand.push(boneyard.pop());
    if (!anyPlayable(aiHand)) {
      msg = RU ? 'ИИ пасует' : 'AI passes';
      draw();
      setT(doPass, 700);
      return;
    }
    var e = ends(), best = null, bs = -1e9, i, k, j;
    for (i = 0; i < aiHand.length; i++) {
      var t = aiHand[i], opts = [];
      if (t.a === e.L || t.b === e.L) opts.push('L');
      if (t.a === e.R || t.b === e.R) opts.push('R');
      for (k = 0; k < opts.length; k++) {
        var newL = e.L, newR = e.R;
        if (opts[k] === 'L') newL = (t.b === e.L) ? t.a : t.b;
        else newR = (t.a === e.R) ? t.b : t.a;
        var div = 0; // end-diversity: keep own hand playable after
        for (j = 0; j < aiHand.length; j++) if (j !== i) {
          var u = aiHand[j];
          if (u.a === newL || u.b === newL || u.a === newR || u.b === newR) div++;
        }
        var s = (t.a + t.b) * 10 + div * 3 + (t.a === t.b ? 6 : 0);
        if (s > bs) { bs = s; best = { i: i, end: opts[k] }; }
      }
    }
    var tile = aiHand.splice(best.i, 1)[0];
    place(tile, best.end);
    afterMove('a');
  }

  // ---- input ----
  function hitR(rc, x, y) { return rc && x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h; }
  function onDown(ev) {
    if (dead || paused || roundOver || matchOver || turn !== 'p') return;
    var r = container.getBoundingClientRect();
    var x = ev.clientX - r.left, y = ev.clientY - r.top;
    if (mustDraw && hitR(boneyRect, x, y)) {
      while (!anyPlayable(hand) && boneyard.length) hand.push(boneyard.pop());
      api.haptic('light');
      mustDraw = false;
      if (!anyPlayable(hand)) { msg = RU ? 'Пас…' : 'Pass…'; draw(); setT(doPass, 800); }
      else { msg = api.t('your_turn'); draw(); }
      return;
    }
    if (sel >= 0) {
      if (endLok && endLpt && Math.hypot(x - endLpt.x, y - endLpt.y) < 34) return playSel('L');
      if (endRok && endRpt && Math.hypot(x - endRpt.x, y - endRpt.y) < 34) return playSel('R');
    }
    for (var i = 0; i < handRects.length; i++) if (hitR(handRects[i], x, y)) return tapHand(i);
    if (sel >= 0) { sel = -1; draw(); }
  }
  container.addEventListener('pointerdown', onDown);

  function tapHand(i) {
    var t = hand[i];
    if (!t || !canPlay(t)) return;
    var e = ends();
    var cl = (t.a === e.L || t.b === e.L), cr = (t.a === e.R || t.b === e.R);
    if (cl && cr && e.L !== e.R) { // two distinct options: pick an end
      sel = (sel === i) ? -1 : i;
      draw();
      return;
    }
    sel = i;
    playSel(cr ? 'R' : 'L');
  }
  function playSel(end) {
    var t = hand.splice(sel, 1)[0];
    sel = -1;
    place(t, end);
    api.haptic('light');
    afterMove('p');
  }

  // ---- rendering ----
  var PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawHalf(cx, cy, s, v) {
    g.fillStyle = '#26282c';
    var pr = Math.max(1.5, s * 0.09), pp = PIPS[v];
    for (var i = 0; i < pp.length; i++) {
      var col = pp[i] % 3, row = (pp[i] / 3) | 0;
      g.beginPath();
      g.arc(cx + (col - 1) * s * 0.27, cy + (row - 1) * s * 0.27, pr, 0, 6.2832);
      g.fill();
    }
  }
  function drawTile(t, glow, lift) {
    var x = t.x, y = t.y - (lift || 0), w = t.w, h = t.h, rad = Math.min(w, h) * 0.18;
    g.save();
    if (glow) { g.shadowColor = C.accent; g.shadowBlur = 12; }
    else { g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 3; g.shadowOffsetY = 1; }
    g.fillStyle = '#fcfcf6';
    rr(x, y, w, h, rad);
    g.fill();
    g.restore();
    g.strokeStyle = glow ? C.accent : '#b9b9b2';
    g.lineWidth = glow ? 2 : 1;
    rr(x, y, w, h, rad);
    g.stroke();
    g.strokeStyle = '#c8c8c0'; g.lineWidth = 1;
    var va = t.rev ? t.b : t.a, vb = t.rev ? t.a : t.b;
    g.beginPath();
    if (t.vert) {
      g.moveTo(x + 3, y + h / 2); g.lineTo(x + w - 3, y + h / 2); g.stroke();
      drawHalf(x + w / 2, y + h / 4, w, va);
      drawHalf(x + w / 2, y + 3 * h / 4, w, vb);
    } else {
      g.moveTo(x + w / 2, y + 3); g.lineTo(x + w / 2, y + h - 3); g.stroke();
      drawHalf(x + w / 4, y + h / 2, h, va);
      drawHalf(x + 3 * w / 4, y + h / 2, h, vb);
    }
  }

  function walk(u, xmin, xmax) {
    var x = xmin, y = 0, dir = 1, tiles = [], minY = 1e9, maxY = -1e9, pitch = 2.35 * u;
    for (var i = 0; i < line.length; i++) {
      var t = line[i], dbl = t.a === t.b, len = dbl ? u : 2 * u, o;
      var fits = dir === 1 ? (x + len <= xmax) : (x - len >= xmin);
      if (!fits) { // bend the snake: corner tile goes vertical down to next row
        var cx = dir === 1 ? Math.min(x, xmax - u) : Math.max(x - u, xmin);
        o = { x: cx, y: y - u / 2, w: u, h: 2 * u, a: t.a, b: t.b, vert: true, rev: false, d: dir, corner: true };
        y += pitch; dir = -dir;
        x = dir === 1 ? cx + u : cx;
      } else if (dbl) { // doubles perpendicular to the line
        o = { x: dir === 1 ? x : x - u, y: y - u, w: u, h: 2 * u, a: t.a, b: t.b, vert: true, rev: false, d: dir };
        x += dir * len;
      } else {
        o = { x: dir === 1 ? x : x - len, y: y - u / 2, w: len, h: u, a: t.a, b: t.b, vert: false, rev: dir === -1, d: dir };
        x += dir * len;
      }
      tiles.push(o);
      if (o.y < minY) minY = o.y;
      if (o.y + o.h > maxY) maxY = o.y + o.h;
    }
    var f = tiles[0], l = tiles[tiles.length - 1];
    var L = { x: f.x - 16, y: f.y + f.h / 2 };
    var R;
    if (l.corner) R = { x: l.x + l.w / 2, y: l.y + l.h + 16 };
    else R = { x: l.d === 1 ? l.x + l.w + 16 : l.x - 16, y: l.y + l.h / 2 };
    return { tiles: tiles, L: L, R: R, minY: minY, maxY: maxY };
  }
  function layoutLine(top, bottom) {
    var xmin = 8, xmax = cv.W - 8, areaH = Math.max(60, bottom - top), res = null;
    for (var u = 26; u >= 11; u -= 1.5) {
      res = walk(u, xmin, xmax);
      if (res.maxY - res.minY <= areaH) break;
    }
    var oy = top + Math.max(0, (areaH - (res.maxY - res.minY)) / 2) - res.minY;
    for (var i = 0; i < res.tiles.length; i++) res.tiles[i].y += oy;
    res.L.y += oy; res.R.y += oy;
    return res;
  }
  function marker(p, val) {
    g.save();
    g.shadowColor = C.accent; g.shadowBlur = 14;
    g.fillStyle = C.accent;
    g.beginPath(); g.arc(p.x, p.y, 15, 0, 6.2832); g.fill();
    g.restore();
    g.fillStyle = '#fff';
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(val), p.x, p.y + 1);
  }

  function draw() {
    if (dead) return;
    var W = cv.W, H = cv.H, i;
    var gr = g.createRadialGradient(W / 2, H * 0.32, 30, W / 2, H * 0.4, H * 0.9);
    gr.addColorStop(0, C.panel2);
    gr.addColorStop(1, C.bg);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);

    g.textBaseline = 'middle';
    g.font = 'bold 14px sans-serif';
    g.fillStyle = C.text;
    g.textAlign = 'left';
    g.fillText((RU ? 'Вы ' : 'You ') + pScore, 10, 16);
    g.textAlign = 'right';
    g.fillText((RU ? 'ИИ ' : 'AI ') + aScore, W - 10, 16);
    g.textAlign = 'center';
    g.font = '11px sans-serif';
    g.fillStyle = C.muted;
    g.fillText('→' + TARGET + ' · ' + (RU ? 'раунд ' : 'round ') + roundNum, W / 2, 16);

    g.font = 'bold 13px sans-serif';
    g.fillStyle = (turn === 'p' && !roundOver) ? C.accent : C.text;
    g.fillText(msg, W / 2, 38);

    // AI hand (backs)
    var an = aiHand.length;
    var aw = Math.min(12, Math.max(6, (W - 40) / (an || 1) - 4));
    var ax = (W - (an * (aw + 4) - 4)) / 2;
    for (i = 0; i < an; i++) {
      g.fillStyle = C.panel;
      g.strokeStyle = C.muted;
      g.lineWidth = 1;
      rr(ax + i * (aw + 4), 52, aw, 22, 3);
      g.fill(); g.stroke();
    }

    // player hand geometry
    var n = hand.length;
    var rows = n > 9 ? 2 : 1;
    var per = Math.ceil(n / rows) || 1;
    var tw = Math.max(22, Math.min(44, Math.floor((W - 12) / per) - 6));
    var th = tw * 2;
    var handH = rows * (th + 8) + 4;
    var handTop = H - handH - 6;
    handRects = [];
    for (i = 0; i < n; i++) {
      var r0 = Math.floor(i / per), c0 = i % per;
      var inRow = (r0 === rows - 1) ? n - per * (rows - 1) : per;
      var rowW = inRow * (tw + 6) - 6;
      handRects.push({ x: (W - rowW) / 2 + c0 * (tw + 6), y: handTop + r0 * (th + 8), w: tw, h: th });
    }

    // boneyard
    boneyRect = { x: W - 64, y: handTop - 52, w: 56, h: 42 };
    g.save();
    if (mustDraw) { g.shadowColor = C.accent; g.shadowBlur = 14; }
    g.fillStyle = C.panel;
    rr(boneyRect.x, boneyRect.y, boneyRect.w, boneyRect.h, 8);
    g.fill();
    g.restore();
    g.strokeStyle = mustDraw ? C.accent : C.muted;
    g.lineWidth = mustDraw ? 2 : 1;
    rr(boneyRect.x, boneyRect.y, boneyRect.w, boneyRect.h, 8);
    g.stroke();
    g.fillStyle = C.panel2;
    rr(boneyRect.x + 7, boneyRect.y + 9, 15, 24, 3);
    g.fill();
    g.strokeStyle = C.muted;
    rr(boneyRect.x + 7, boneyRect.y + 9, 15, 24, 3);
    g.stroke();
    g.fillStyle = C.text;
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'center';
    g.fillText(String(boneyard.length), boneyRect.x + 39, boneyRect.y + 21);

    // line of play (the snake)
    var res = null;
    if (line.length) {
      res = layoutLine(84, handTop - 60);
      for (i = 0; i < res.tiles.length; i++) drawTile(res.tiles[i], false, 0);
    }
    endLpt = endRpt = null;
    if (sel >= 0 && res && hand[sel]) {
      var e = ends(), t = hand[sel];
      endLok = (t.a === e.L || t.b === e.L);
      endRok = (t.a === e.R || t.b === e.R);
      var cl = function (p) { return { x: Math.min(Math.max(p.x, 18), W - 18), y: Math.min(Math.max(p.y, 92), handTop - 64) }; };
      if (endLok) { endLpt = cl(res.L); marker(endLpt, e.L); }
      if (endRok) { endRpt = cl(res.R); marker(endRpt, e.R); }
    }

    // player hand tiles
    for (i = 0; i < n; i++) {
      var ht = hand[i];
      var glow = turn === 'p' && !roundOver && !mustDraw && canPlay(ht);
      drawTile({ x: handRects[i].x, y: handRects[i].y, w: tw, h: th, a: ht.a, b: ht.b, vert: true, rev: false }, glow, sel === i ? 8 : 0);
    }
  }

  cv.onResize = function () { draw(); };

  api.score(0);
  deal();
  draw();

  return {
    destroy: function () {
      dead = true;
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i].id);
      timers.length = 0;
      container.removeEventListener('pointerdown', onDown);
      cv.destroy();
    },
    pause: function () {
      paused = true;
      for (var i = 0; i < timers.length; i++) {
        var o = timers[i];
        clearTimeout(o.id);
        o.rem = Math.max(0, o.rem - (Date.now() - o.at));
      }
    },
    resume: function () {
      paused = false;
      for (var i = 0; i < timers.length; i++) arm(timers[i]);
      draw();
    }
  };
});
})();
