/* Mini Golf — 9 procedural holes, drag to shoot (MG contract). */
(function () {
'use strict';
MG.register('golf', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g, C = api.colors, RU = api.lang === 'ru', LOW = api.lowEnd;
  var TAU = Math.PI * 2;
  var TOP = 40, HOLES = 9;

  // wall rects are [x, y, w, h] in normalized 0..1 field coords
  var TPL = [
    { par: 3, tee: [0.5, 0.90], hole: [0.5, 0.12], walls: [] },
    { par: 4, tee: [0.8, 0.90], hole: [0.15, 0.12], walls: [[0, 0.45, 0.62, 0.05]] },
    { par: 4, tee: [0.2, 0.90], hole: [0.85, 0.12], walls: [[0.38, 0.45, 0.62, 0.05]] },
    { par: 5, tee: [0.5, 0.92], hole: [0.5, 0.10], walls: [[0, 0.30, 0.68, 0.05], [0.32, 0.62, 0.68, 0.05]] },
    { par: 3, tee: [0.15, 0.90], hole: [0.85, 0.12], walls: [[0.40, 0.35, 0.20, 0.30]] },
    { par: 4, tee: [0.5, 0.90], hole: [0.5, 0.12], walls: [[0.42, 0.30, 0.16, 0.14], [0, 0.55, 0.30, 0.05], [0.70, 0.55, 0.30, 0.05]] }
  ];

  var holeN = 1, par = 3, strokes = 0, total = 0;
  var spec = null;            // normalized layout of current hole
  var fx, fy, fw, fh, rb;     // field rect + ball radius (px)
  var W = [], B = [], S = [], WA = [], HP = null, TE = null; // px: walls, bumpers, sands, waters, hole, tee
  var ball = { x: 0, y: 0 }, vel = { x: 0, y: 0 };
  var shotStart = { x: 0, y: 0 };
  var state = 'aim';          // aim | roll | drop | banner | over
  var capT = 0, banner = null, labels = [], started = false;
  var drag = null, rect = null;
  var raf = 0, last = 0, paused = false, time = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

  function rectsOverlap(a, b, m) {
    return a[0] < b[0] + b[2] + m && a[0] + a[2] + m > b[0] &&
           a[1] < b[1] + b[3] + m && a[1] + a[3] + m > b[1];
  }

  function freeSpot(w, h, avoid) {
    for (var t = 0; t < 30; t++) {
      var p = [rnd(0.04, 0.96 - w), rnd(0.20, 0.74 - h)];
      var cxn = p[0] + w / 2, cyn = p[1] + h / 2;
      if (dist2(cxn, cyn, spec.tee[0], spec.tee[1]) < 0.055) continue;
      if (dist2(cxn, cyn, spec.hole[0], spec.hole[1]) < 0.055) continue;
      var bad = false, i;
      for (i = 0; i < spec.walls.length && !bad; i++) bad = rectsOverlap([p[0], p[1], w, h], spec.walls[i], 0.05);
      for (i = 0; i < avoid.length && !bad; i++) bad = rectsOverlap([p[0], p[1], w, h], avoid[i], 0.03);
      if (!bad) return p;
    }
    return null;
  }

  var lastTpl = -1;
  function genHole(n) {
    var idx = n === 1 ? 0 : (Math.random() * TPL.length) | 0;
    if (n > 1 && idx === lastTpl) idx = (idx + 1) % TPL.length;
    lastTpl = idx;
    var t = TPL[idx];
    par = t.par;
    spec = { tee: t.tee, hole: t.hole, walls: t.walls, bumps: [], sands: [], waters: [] };
    var used = [], i, p;
    var nb = n > 2 ? 1 + (Math.random() * 2 | 0) : (Math.random() * 2 | 0);
    for (i = 0; i < nb; i++) {
      p = freeSpot(0.1, 0.1, used);
      if (p) { spec.bumps.push([p[0] + 0.05, p[1] + 0.05, 0.05]); used.push([p[0], p[1], 0.1, 0.1]); }
    }
    var ns = Math.random() * 3 | 0;
    for (i = 0; i < ns; i++) {
      p = freeSpot(0.22, 0.11, used);
      if (p) { spec.sands.push([p[0], p[1], 0.22, 0.11]); used.push([p[0], p[1], 0.22, 0.11]); }
    }
    if (n > 1 && Math.random() < 0.22) { // water is rare
      p = freeSpot(0.24, 0.09, used);
      if (p) spec.waters.push([p[0], p[1], 0.24, 0.09]);
    }
    applyLayout();
    ball.x = TE.x; ball.y = TE.y;
    vel.x = vel.y = 0;
    shotStart.x = ball.x; shotStart.y = ball.y;
    strokes = 0;
    state = 'aim';
  }

  function applyLayout() {
    fx = 8; fy = TOP; fw = cv.W - 16; fh = cv.H - TOP - 8;
    rb = Math.max(6, Math.min(fw, fh) * 0.018);
    function R2(r) { return { x: fx + r[0] * fw, y: fy + r[1] * fh, w: r[2] * fw, h: r[3] * fh }; }
    var i;
    W = []; S = []; WA = []; B = [];
    for (i = 0; i < spec.walls.length; i++) W.push(R2(spec.walls[i]));
    for (i = 0; i < spec.sands.length; i++) S.push(R2(spec.sands[i]));
    for (i = 0; i < spec.waters.length; i++) WA.push(R2(spec.waters[i]));
    for (i = 0; i < spec.bumps.length; i++) {
      var b = spec.bumps[i];
      B.push({ x: fx + b[0] * fw, y: fy + b[1] * fh, r: b[2] * Math.min(fw, fh), hit: 0 });
    }
    HP = { x: fx + spec.hole[0] * fw, y: fy + spec.hole[1] * fh };
    TE = { x: fx + spec.tee[0] * fw, y: fy + spec.tee[1] * fh };
    rect = cv.canvas.getBoundingClientRect();
  }

  cv.onResize = function () {
    if (!spec) return;
    var nx = (ball.x - fx) / fw, ny = (ball.y - fy) / fh;
    applyLayout();
    ball.x = fx + nx * fw; ball.y = fy + ny * fh;
  };

  function inRect(x, y, r) { return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h; }

  function physics(dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008));
    var h = dt / n;
    for (var k = 0; k < n && state === 'roll'; k++) {
      ball.x += vel.x * h;
      ball.y += vel.y * h;
      // outer walls
      if (ball.x < fx + rb) { ball.x = fx + rb; vel.x = -vel.x * 0.85; }
      if (ball.x > fx + fw - rb) { ball.x = fx + fw - rb; vel.x = -vel.x * 0.85; }
      if (ball.y < fy + rb) { ball.y = fy + rb; vel.y = -vel.y * 0.85; }
      if (ball.y > fy + fh - rb) { ball.y = fy + fh - rb; vel.y = -vel.y * 0.85; }
      // inner walls
      var i, r;
      for (i = 0; i < W.length; i++) {
        r = W[i];
        var px = clamp(ball.x, r.x, r.x + r.w), py = clamp(ball.y, r.y, r.y + r.h);
        var dx = ball.x - px, dy = ball.y - py, dd = dx * dx + dy * dy;
        if (dd < rb * rb) {
          if (dd === 0) { ball.y = r.y - rb; vel.y = -Math.abs(vel.y) * 0.85; continue; }
          var d = Math.sqrt(dd), nx = dx / d, ny = dy / d;
          ball.x = px + nx * rb; ball.y = py + ny * rb;
          var dot = vel.x * nx + vel.y * ny;
          if (dot < 0) { vel.x -= 2 * dot * nx; vel.y -= 2 * dot * ny; vel.x *= 0.85; vel.y *= 0.85; }
        }
      }
      // bumpers
      for (i = 0; i < B.length; i++) {
        var bp = B[i];
        var bdx = ball.x - bp.x, bdy = ball.y - bp.y;
        var bd = Math.sqrt(bdx * bdx + bdy * bdy), rr = rb + bp.r;
        if (bd < rr && bd > 0) {
          var bnx = bdx / bd, bny = bdy / bd;
          ball.x = bp.x + bnx * rr; ball.y = bp.y + bny * rr;
          var bdot = vel.x * bnx + vel.y * bny;
          if (bdot < 0) {
            vel.x -= 2 * bdot * bnx; vel.y -= 2 * bdot * bny;
            vel.x *= 1.05; vel.y *= 1.05;
            bp.hit = 1;
            api.haptic('light');
          }
        }
      }
      // water: reset with 1 stroke penalty
      for (i = 0; i < WA.length; i++) {
        if (inRect(ball.x, ball.y, WA[i])) {
          strokes++;
          ball.x = shotStart.x; ball.y = shotStart.y;
          vel.x = vel.y = 0;
          state = 'aim';
          labels.push({ txt: '💦 +1', x: ball.x, y: ball.y - 18, t: 0 });
          api.haptic('error');
          return;
        }
      }
      // sand friction / normal friction
      var sand = false;
      for (i = 0; i < S.length; i++) if (inRect(ball.x, ball.y, S[i])) { sand = true; break; }
      var f = Math.pow(sand ? 0.86 : 0.975, h * 60);
      vel.x *= f; vel.y *= f;
      var sp2 = vel.x * vel.x + vel.y * vel.y;
      // hole capture
      if (dist2(ball.x, ball.y, HP.x, HP.y) < rb * 1.9 * rb * 1.9 && sp2 < 170 * 170) {
        state = 'drop'; capT = 0;
        return;
      }
      if (sp2 < 64) { vel.x = vel.y = 0; state = 'aim'; shotStart.x = ball.x; shotStart.y = ball.y; return; }
    }
  }

  function holeDone() {
    api.haptic('success');
    var hs = Math.max(0, (par * 2 - strokes) * 25) + (strokes === 1 ? 100 : 0);
    total += hs;
    api.score(total);
    banner = {
      t: 0,
      a: (RU ? 'Лунка ' : 'Hole ') + holeN + ' · +' + hs,
      b: strokes === 1 ? (RU ? '🎯 С одного удара!' : '🎯 Hole-in-one!')
        : (api.t('moves') + ': ' + strokes + ' · ' + (RU ? 'Пар' : 'Par') + ' ' + par)
    };
    state = 'banner';
  }

  function nextHole() {
    banner = null;
    holeN++;
    if (holeN > HOLES) {
      state = 'over';
      api.gameOver(total, { win: true });
    } else {
      genHole(holeN);
    }
  }

  // ---- input ----
  function pt(e) { return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  function pd(e) {
    if (!started) { started = true; return; }
    if (state !== 'aim' || paused) return;
    var p = pt(e);
    drag = { sx: p.x, sy: p.y, x: p.x, y: p.y };
    e.preventDefault();
  }
  function pm(e) {
    if (!drag) return;
    var p = pt(e);
    drag.x = p.x; drag.y = p.y;
    e.preventDefault();
  }
  function pu() {
    if (!drag) return;
    var dx = drag.sx - drag.x, dy = drag.sy - drag.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var maxLen = Math.min(fw, fh) * 0.45;
    if (len > 12 && state === 'aim') {
      var pw = Math.min(1, len / maxLen);
      var sp = pw * Math.min(fw, fh) * 1.9;
      vel.x = dx / len * sp;
      vel.y = dy / len * sp;
      strokes++;
      shotStart.x = ball.x; shotStart.y = ball.y;
      state = 'roll';
      api.haptic('light');
    }
    drag = null;
  }
  cv.canvas.style.touchAction = 'none';
  cv.canvas.addEventListener('pointerdown', pd);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu);
  window.addEventListener('pointercancel', pu);
  function onKey(e) { if (e.key === ' ') { started = true; e.preventDefault(); } }
  window.addEventListener('keydown', onKey);

  // ---- drawing ----
  function rrect(r) { g.fillRect(r.x, r.y, r.w, r.h); }

  function draw() {
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    // field (green)
    g.fillStyle = C.panel;
    g.fillRect(fx, fy, fw, fh);
    g.globalAlpha = 0.14;
    g.fillStyle = C.good;
    g.fillRect(fx, fy, fw, fh);
    g.globalAlpha = 1;
    g.strokeStyle = C.panel2;
    g.lineWidth = 3;
    g.strokeRect(fx, fy, fw, fh);
    var i, r;
    // sand
    for (i = 0; i < S.length; i++) {
      r = S[i];
      g.fillStyle = C.panel2; rrect(r);
      g.fillStyle = C.muted;
      g.globalAlpha = 0.6;
      for (var k = 0; k < 8; k++) {
        g.fillRect(r.x + 4 + (k * 37) % (r.w - 8), r.y + 4 + (k * 53) % (r.h - 8), 2, 2);
      }
      g.globalAlpha = 1;
    }
    // water
    for (i = 0; i < WA.length; i++) {
      r = WA[i];
      g.globalAlpha = 0.5;
      g.fillStyle = C.accent; rrect(r);
      g.globalAlpha = 1;
      g.strokeStyle = C.accent;
      g.lineWidth = 1;
      g.beginPath();
      var wy = r.y + r.h / 2 + Math.sin(time * 2) * 2;
      g.moveTo(r.x + 6, wy);
      for (var wx = r.x + 6; wx < r.x + r.w - 6; wx += 10) g.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy);
      g.stroke();
    }
    // walls
    g.fillStyle = C.panel2;
    for (i = 0; i < W.length; i++) rrect(W[i]);
    g.strokeStyle = C.muted;
    g.lineWidth = 1;
    for (i = 0; i < W.length; i++) { r = W[i]; g.strokeRect(r.x, r.y, r.w, r.h); }
    // bumpers
    for (i = 0; i < B.length; i++) {
      var bp = B[i];
      var pr = bp.r * (1 + bp.hit * 0.15);
      g.fillStyle = C.bad;
      g.beginPath(); g.arc(bp.x, bp.y, pr, 0, TAU); g.fill();
      g.fillStyle = C.panel;
      g.beginPath(); g.arc(bp.x, bp.y, pr * 0.45, 0, TAU); g.fill();
      if (bp.hit > 0) bp.hit = Math.max(0, bp.hit - 0.08);
    }
    // hole + flag
    g.fillStyle = C.bg;
    g.beginPath(); g.arc(HP.x, HP.y, rb * 1.55, 0, TAU); g.fill();
    g.strokeStyle = C.muted; g.lineWidth = 1.5; g.stroke();
    g.strokeStyle = C.text; g.lineWidth = 2;
    g.beginPath(); g.moveTo(HP.x, HP.y - 2); g.lineTo(HP.x, HP.y - 26); g.stroke();
    g.fillStyle = C.bad;
    g.beginPath(); g.moveTo(HP.x, HP.y - 26); g.lineTo(HP.x + 13, HP.y - 21); g.lineTo(HP.x, HP.y - 16); g.closePath(); g.fill();
    // aim preview
    if (drag && state === 'aim') {
      var dx = drag.sx - drag.x, dy = drag.sy - drag.y;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > 12) {
        var maxLen = Math.min(fw, fh) * 0.45;
        var pw = Math.min(1, len / maxLen);
        var ll = pw * maxLen * 1.1;
        g.setLineDash([5, 7]);
        g.strokeStyle = pw > 0.75 ? C.bad : C.accent;
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(ball.x, ball.y);
        g.lineTo(ball.x + dx / len * ll, ball.y + dy / len * ll);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // ball
    if (state !== 'banner') {
      var bx = ball.x, by = ball.y, br = rb;
      if (state === 'drop') {
        var t = Math.min(1, capT / 0.45);
        bx = ball.x + (HP.x - ball.x) * t + Math.sin(t * 12) * 3 * (1 - t);
        by = ball.y + (HP.y - ball.y) * t;
        br = rb * (1 - t * 0.85);
      }
      g.fillStyle = C.text;
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
      g.fillStyle = C.muted;
      g.globalAlpha = 0.4;
      g.beginPath(); g.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    // labels
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = labels.length - 1; i >= 0; i--) {
      var L = labels[i];
      if (L.t > 1.2) { labels.splice(i, 1); continue; }
      g.globalAlpha = Math.max(0, 1 - L.t);
      g.fillStyle = C.text;
      g.font = 'bold 16px sans-serif';
      g.fillText(L.txt, L.x, L.y - L.t * 22);
      g.globalAlpha = 1;
    }
    // HUD
    g.fillStyle = C.text;
    g.font = 'bold 14px sans-serif';
    g.textAlign = 'left';
    g.fillText((RU ? 'Лунка' : 'Hole') + ' ' + Math.min(holeN, HOLES) + '/' + HOLES, 12, 24);
    g.textAlign = 'center';
    g.fillStyle = C.muted;
    g.fillText((RU ? 'Пар' : 'Par') + ' ' + par, cv.W / 2, 24);
    g.textAlign = 'right';
    g.fillStyle = C.text;
    g.fillText(api.t('moves') + ': ' + strokes, cv.W - 12, 24);
    // banner
    if (banner) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(0, cv.H / 2 - 56, cv.W, 112);
      g.textAlign = 'center';
      g.fillStyle = C.text;
      g.font = 'bold 24px sans-serif';
      g.fillText(banner.a, cv.W / 2, cv.H / 2 - 12);
      g.fillStyle = C.muted;
      g.font = '15px sans-serif';
      g.fillText(banner.b, cv.W / 2, cv.H / 2 + 20);
    }
    // start overlay
    if (!started) {
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 0, cv.W, cv.H);
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.font = 'bold 18px sans-serif';
      g.fillText(api.t('tap_to_start'), cv.W / 2, cv.H / 2);
      g.font = '13px sans-serif';
      g.fillStyle = C.muted;
      g.fillText(RU ? 'Тяни от мяча — удар в обратную сторону' : 'Drag from the ball, shoot opposite way', cv.W / 2, cv.H / 2 + 26);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    time += dt;
    if (started) {
      if (state === 'roll') physics(dt);
      else if (state === 'drop') {
        capT += dt;
        if (capT >= 0.5) holeDone();
      } else if (state === 'banner' && banner) {
        banner.t += dt;
        if (banner.t > 1.5) nextHole();
      }
    }
    draw();
  }

  genHole(1);
  api.score(0);
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      cv.canvas.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', onKey);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
