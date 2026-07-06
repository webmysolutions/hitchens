/* Stack — tap to drop the sliding block, build the tallest tower. */
(function () {
'use strict';
MG.register('stack', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;

  var BH = 26;           // block height
  var PERFECT = 4;       // px tolerance for a perfect drop
  var raf = 0, last = 0, paused = false;
  var started, over, score, blocks, cur, cam, camT, debris, flash;

  function shade(hex, t) {
    // t in [-1,1]: negative darkens, positive lightens toward white
    var m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
    function ch(v) {
      v = t >= 0 ? v + (255 - v) * t : v * (1 + t);
      return Math.max(0, Math.min(255, Math.round(v)));
    }
    return 'rgb(' + ch(r) + ',' + ch(gr) + ',' + ch(b) + ')';
  }
  function blockColor(i) {
    return shade(C.accent, Math.sin(i * 0.55) * 0.3);
  }

  function baseW() { return Math.min(cv.W * 0.6, 240); }

  function reset() {
    score = 0;
    started = false; over = false;
    blocks = [{ x: (cv.W - baseW()) / 2, w: baseW() }];
    debris = [];
    flash = null;
    cam = 0; camT = 0;
    newSlider();
    api.score(0);
  }

  function newSlider() {
    var top = blocks[blocks.length - 1];
    var fromLeft = blocks.length % 2 === 1;
    cur = {
      w: top.w,
      x: fromLeft ? -top.w : cv.W,
      dir: fromLeft ? 1 : -1,
      speed: Math.min(400, 130 + (blocks.length - 1) * 9)
    };
  }

  function floorTopY(i) {
    // screen y of the top edge of floor i (i=0 is the base)
    return cv.H - 50 - (i + 1) * BH + cam;
  }

  function drop() {
    var top = blocks[blocks.length - 1];
    var i = blocks.length; // index of the new floor
    if (Math.abs(cur.x - top.x) <= PERFECT) {
      // perfect: keep full width, bonus point
      blocks.push({ x: top.x, w: top.w });
      score += 2;
      flash = { t: 700, txt: (api.lang === 'ru' ? 'Идеально!' : 'Perfect!') + ' +2', y: floorTopY(i) };
      api.haptic('success');
    } else {
      var l = Math.max(cur.x, top.x);
      var r = Math.min(cur.x + cur.w, top.x + top.w);
      var w = r - l;
      if (w <= 0) {
        // total miss — the whole block falls
        over = true;
        debris.push({ x: cur.x, w: cur.w, y: floorTopY(i), vy: 0, col: blockColor(i) });
        api.haptic('error');
        api.gameOver(score);
        return;
      }
      // sliced-off overhang falls as debris
      var offX = cur.x < top.x ? cur.x : r;
      if (!api.lowEnd || debris.length < 4) {
        debris.push({ x: offX, w: cur.w - w, y: floorTopY(i), vy: 0, col: blockColor(i) });
      }
      blocks.push({ x: l, w: w });
      score += 1;
      api.haptic('light');
    }
    api.score(score);
    newSlider();
  }

  function update(dt) {
    var s = dt / 1000;
    if (!over) {
      cur.x += cur.dir * cur.speed * s;
      if (cur.dir > 0 && cur.x > cv.W - cur.w * 0.25) { cur.x = cv.W - cur.w * 0.25; cur.dir = -1; }
      else if (cur.dir < 0 && cur.x < -cur.w * 0.75) { cur.x = -cur.w * 0.75; cur.dir = 1; }
    }
    // camera pans up so the action stays around 45% height
    var topNoCam = cv.H - 50 - blocks.length * BH;
    camT = Math.max(0, cv.H * 0.45 - topNoCam);
    cam += (camT - cam) * Math.min(1, s * 6);
    // debris
    for (var i = debris.length - 1; i >= 0; i--) {
      var d = debris[i];
      d.vy += 1400 * s;
      d.y += d.vy * s;
      if (d.y > cv.H + BH) debris.splice(i, 1);
    }
    if (flash) {
      flash.t -= dt;
      if (flash.t <= 0) flash = null;
    }
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // ground
    g.fillStyle = C.panel;
    g.fillRect(0, floorTopY(0) + BH, cv.W, cv.H);
    // tower (only visible floors)
    var first = Math.max(0, blocks.length - Math.ceil(cv.H / BH) - 2);
    for (var i = first; i < blocks.length; i++) {
      var b = blocks[i];
      var y = floorTopY(i);
      g.fillStyle = blockColor(i);
      g.fillRect(b.x, y, b.w, BH - 1);
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(b.x + b.w - 5, y, 5, BH - 1);
    }
    // debris
    for (i = 0; i < debris.length; i++) {
      var d = debris[i];
      g.globalAlpha = 0.8;
      g.fillStyle = d.col;
      g.fillRect(d.x, d.y, d.w, BH - 1);
      g.globalAlpha = 1;
    }
    // sliding block
    if (!over) {
      var sy = floorTopY(blocks.length);
      g.fillStyle = blockColor(blocks.length);
      g.fillRect(cur.x, sy, cur.w, BH - 1);
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(cur.x, sy, cur.w, 3);
    }
    // floor counter
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = C.muted;
    g.font = '14px sans-serif';
    g.fillText((api.lang === 'ru' ? 'Этажи: ' : 'Floors: ') + (blocks.length - 1), cv.W / 2, 24);
    if (flash) {
      g.globalAlpha = Math.min(1, flash.t / 400);
      g.fillStyle = C.good;
      g.font = 'bold 18px sans-serif';
      g.fillText(flash.txt, cv.W / 2, flash.y - 14 - (700 - flash.t) * 0.03);
      g.globalAlpha = 1;
    }
    if (!started && !over) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(api.lang === 'ru' ? 'Тапни, чтобы уронить блок' : 'Tap to drop the block', cv.W / 2, cv.H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(50, ts - last);
    last = ts;
    if (started) update(dt);
    draw();
  }

  function tap(e) {
    if (e && e.cancelable) e.preventDefault();
    if (over) return;
    if (!started) { started = true; return; }
    drop();
  }
  container.addEventListener('touchstart', tap, { passive: false });
  container.addEventListener('mousedown', tap);

  function onKey(e) {
    if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') {
      tap();
      e.preventDefault();
    }
  }
  window.addEventListener('keydown', onKey);

  cv.onResize = function () { draw(); };

  reset();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      container.removeEventListener('touchstart', tap);
      container.removeEventListener('mousedown', tap);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
