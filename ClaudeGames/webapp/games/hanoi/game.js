/* Hanoi Towers — move the whole tower; levels 3..8 disks. */
(function () {
'use strict';
MG.register('hanoi', function (container, api) {
  var C = api.colors;
  var cv = api.createCanvas();
  var g = cv.g;

  var MIN = 3, MAX = 8;
  var disks = MIN, pegs, sel = -1, moves, score = 0, over = false;
  var fly = null; // {d, fromX, fromY, toX, toY, t, peg}
  var raf = 0, paused = false, banner = null;

  function reset() {
    pegs = [[], [], []];
    for (var i = disks; i >= 1; i--) pegs[0].push(i);
    moves = 0;
    sel = -1;
    fly = null;
  }

  function pegX(p) { return cv.W * (0.5 + (p - 1) * 0.32); }
  function baseY() { return cv.H * 0.78; }
  function diskH() { return Math.max(14, Math.min(26, (cv.H * 0.42 / MAX) | 0)); }
  function diskW(d) { return cv.W * 0.09 + (cv.W * 0.20) * (d / MAX); }

  function hue(d) {
    // ramp between accent-ish hues by disk size
    var t = d / MAX;
    var r = Math.round(90 + 150 * t), gg = Math.round(170 - 60 * t), b = Math.round(255 - 130 * t);
    return 'rgb(' + r + ',' + gg + ',' + b + ')';
  }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    g.textBaseline = 'middle';
    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    g.textAlign = 'left';
    g.fillText(api.t('level') + ' ' + (disks - MIN + 1) + '/' + (MAX - MIN + 1) + ' (' + disks + '💿)', 12, 24);
    g.textAlign = 'right';
    var opt = Math.pow(2, disks) - 1;
    g.fillText(api.t('moves') + ': ' + moves + ' / ' + opt, cv.W - 12, 24);

    var bh = diskH();
    for (var p = 0; p < 3; p++) {
      var x = pegX(p);
      g.fillStyle = C.panel2;
      g.fillRect(x - 4, baseY() - bh * (MAX + 1.5), 8, bh * (MAX + 1.5));
      g.fillRect(x - cv.W * 0.15, baseY(), cv.W * 0.3, 10);
      for (var i = 0; i < pegs[p].length; i++) {
        var d = pegs[p][i];
        if (sel === p && i === pegs[p].length - 1 && !fly) continue;
        drawDisk(d, x, baseY() - bh * (i + 1) + bh * 0.5);
      }
      if (sel === p && !fly) {
        var dd = pegs[p][pegs[p].length - 1];
        drawDisk(dd, x, baseY() - bh * (MAX + 2.2));
      }
    }
    if (fly) {
      var t = fly.t < 0.5 ? 2 * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 2) / 2;
      var fx = fly.fromX + (fly.toX - fly.fromX) * t;
      var arc = Math.sin(Math.PI * fly.t) * bh * 3;
      var fy = fly.fromY + (fly.toY - fly.fromY) * t - arc;
      drawDisk(fly.d, fx, fy);
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

  function drawDisk(d, x, y) {
    var w = diskW(d), h = diskH() - 3;
    g.fillStyle = hue(d);
    g.beginPath();
    g.moveTo(x - w / 2 + h / 2, y - h / 2);
    g.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, h / 2);
    g.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, h / 2);
    g.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, h / 2);
    g.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, h / 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(x - w / 2 + h / 2, y - h / 2 + 2, w - h, 3);
  }

  function tapPeg(p) {
    if (over || fly || banner) return;
    if (sel < 0) {
      if (pegs[p].length) { sel = p; api.haptic('light'); }
      return;
    }
    if (sel === p) { sel = -1; return; }
    var d = pegs[sel][pegs[sel].length - 1];
    var top = pegs[p][pegs[p].length - 1];
    if (top && top < d) { // illegal
      api.haptic('error');
      sel = -1;
      return;
    }
    var bh = diskH();
    fly = {
      d: d,
      fromX: pegX(sel), fromY: baseY() - bh * (MAX + 2.2),
      toX: pegX(p), toY: baseY() - bh * (pegs[p].length + 1) + bh * 0.5,
      t: 0, peg: p
    };
    pegs[sel].pop();
    sel = -1;
    moves++;
  }

  function land() {
    pegs[fly.peg].push(fly.d);
    var done = pegs[2].length === disks || pegs[1].length === disks;
    fly = null;
    if (done) {
      var opt = Math.pow(2, disks) - 1;
      var gained = Math.max(50, 300 - 5 * (moves - opt));
      score += gained;
      api.score(score);
      api.haptic('success');
      banner = '+' + gained;
      setTimeout(function () {
        if (over) return;
        banner = null;
        if (disks >= MAX) { over = true; api.gameOver(score, { win: true }); }
        else { disks++; reset(); }
      }, 1200);
    }
  }

  function onTap(e) {
    var p = e.changedTouches ? e.changedTouches[0] : e;
    var r = cv.canvas.getBoundingClientRect();
    var x = p.clientX - r.left;
    var third = ((x / cv.W) * 3) | 0;
    tapPeg(Math.max(0, Math.min(2, third)));
  }
  cv.canvas.addEventListener('click', onTap);
  function onKey(e) {
    var m = { '1': 0, '2': 1, '3': 2 };
    if (m[e.key] !== undefined) tapPeg(m[e.key]);
  }
  window.addEventListener('keydown', onKey);

  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    if (fly) {
      fly.t += api.lowEnd ? 0.2 : 0.07;
      if (fly.t >= 1) land();
    }
    draw();
  }

  reset();
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      over = true;
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('click', onTap);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
