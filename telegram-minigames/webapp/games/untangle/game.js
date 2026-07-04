/* Untangle — drag the glowing orbs until no edges cross (planarity puzzle). */
(function () {
'use strict';
MG.register('untangle', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';

  var NODES = [6, 8, 9, 11, 12, 14]; // 6 levels
  var level, total, verts, edges, cross, dragIdx, t0, banner;
  var raf = 0, paused = false, timers = [];
  var TOP = 42, MARGIN = 26;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  /* proper segment intersection (shared endpoints excluded by caller) */
  function ccw(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
  function segInt(a, b, c, d) {
    var d1 = ccw(c.x, c.y, d.x, d.y, a.x, a.y);
    var d2 = ccw(c.x, c.y, d.x, d.y, b.x, b.y);
    var d3 = ccw(a.x, a.y, b.x, b.y, c.x, c.y);
    var d4 = ccw(a.x, a.y, b.x, b.y, d.x, d.y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /* Build a guaranteed-planar graph: greedy triangulation on random points
     (add shortest non-crossing edges), then keep a connected ~1.8n subset. */
  function makeGraph(n) {
    var pts = [], i, j, tries = 0;
    while (pts.length < n && tries < 500) {
      tries++;
      var p = { x: 0.08 + Math.random() * 0.84, y: 0.08 + Math.random() * 0.84 };
      var ok = true;
      for (i = 0; i < pts.length; i++) {
        var dx = pts[i].x - p.x, dy = pts[i].y - p.y;
        if (dx * dx + dy * dy < 0.02) { ok = false; break; }
      }
      if (ok) pts.push(p);
    }
    while (pts.length < n) pts.push({ x: Math.random(), y: Math.random() });
    var cand = [];
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var ddx = pts[i].x - pts[j].x, ddy = pts[i].y - pts[j].y;
      cand.push({ a: i, b: j, d: ddx * ddx + ddy * ddy });
    }
    cand.sort(function (p1, p2) { return p1.d - p2.d; });
    var tri = [];
    for (i = 0; i < cand.length; i++) {
      var e = cand[i], hit = false;
      for (j = 0; j < tri.length; j++) {
        var f = tri[j];
        if (f.a === e.a || f.a === e.b || f.b === e.a || f.b === e.b) continue;
        if (segInt(pts[e.a], pts[e.b], pts[f.a], pts[f.b])) { hit = true; break; }
      }
      if (!hit) tri.push(e);
    }
    // subset: spanning tree first (connectivity), then shortest extras up to ~1.8n
    var parent = [];
    for (i = 0; i < n; i++) parent.push(i);
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    var chosen = [], rest = [];
    for (i = 0; i < tri.length; i++) {
      var ra = find(tri[i].a), rb = find(tri[i].b);
      if (ra !== rb) { parent[ra] = rb; chosen.push(tri[i]); }
      else rest.push(tri[i]);
    }
    var target = Math.min(tri.length, Math.round(1.8 * n));
    for (i = 0; i < rest.length && chosen.length < target; i++) chosen.push(rest[i]);
    return { pts: pts, edges: chosen };
  }

  function countCross() {
    var n = 0, i, j;
    for (i = 0; i < edges.length; i++) edges[i].bad = false;
    for (i = 0; i < edges.length; i++) {
      for (j = i + 1; j < edges.length; j++) {
        var e = edges[i], f = edges[j];
        if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
        if (segInt(verts[e.a], verts[e.b], verts[f.a], verts[f.b])) {
          n++;
          e.bad = true; f.bad = true;
        }
      }
    }
    cross = n;
    return n;
  }

  function newLevel() {
    var n = NODES[level];
    var gr = makeGraph(n);
    edges = gr.edges;
    // scramble display positions until tangled
    var attempt = 0;
    do {
      verts = [];
      for (var i = 0; i < n; i++) verts.push({ x: 0.08 + Math.random() * 0.84, y: 0.08 + Math.random() * 0.84, ph: Math.random() * 6.28 });
      attempt++;
    } while (countCross() === 0 && attempt < 30);
    dragIdx = -1;
    banner = null;
    t0 = performance.now();
  }

  /* normalized <-> pixel coords */
  function px(v) { return MARGIN + v.x * (cv.W - MARGIN * 2); }
  function py(v) { return TOP + MARGIN + v.y * (cv.H - TOP - MARGIN * 2); }

  function solve() {
    var sec = Math.floor((performance.now() - t0) / 1000);
    var pts = 100 + Math.max(0, 90 - sec);
    total += pts;
    api.score(total);
    api.haptic('success');
    banner = { text: '+' + pts, until: performance.now() + 1200 };
    later(function () {
      level++;
      if (level >= NODES.length) api.gameOver(total, { win: true });
      else newLevel();
    }, 1250);
  }

  /* ---- input ---- */
  function pt(e) {
    var t = e.touches && e.touches.length ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    var r = cv.canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function onDown(e) {
    if (banner) return;
    var p = pt(e), best = -1, bestD = 26 * 26;
    for (var i = 0; i < verts.length; i++) {
      var dx = px(verts[i]) - p.x, dy = py(verts[i]) - p.y;
      var d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      dragIdx = best;
      api.haptic('light');
      if (e.cancelable) e.preventDefault();
    }
  }
  function onMove(e) {
    if (dragIdx < 0) return;
    var p = pt(e);
    var v = verts[dragIdx];
    v.x = Math.max(0, Math.min(1, (p.x - MARGIN) / (cv.W - MARGIN * 2)));
    v.y = Math.max(0, Math.min(1, (p.y - TOP - MARGIN) / (cv.H - TOP - MARGIN * 2)));
    countCross();
    if (e.cancelable) e.preventDefault();
  }
  function onUp() {
    if (dragIdx < 0) return;
    dragIdx = -1;
    if (countCross() === 0 && !banner) solve();
  }
  cv.canvas.addEventListener('touchstart', onDown, { passive: false });
  cv.canvas.addEventListener('touchmove', onMove, { passive: false });
  cv.canvas.addEventListener('touchend', onUp);
  cv.canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  /* ---- drawing ---- */
  function draw() {
    var now = performance.now();
    g.fillStyle = C.bg;
    g.fillRect(0, 0, cv.W, cv.H);
    var wob = !api.lowEnd;
    var i, x1, y1, x2, y2;
    function vx(i2) { return px(verts[i2]) + (wob && i2 !== dragIdx ? Math.sin(now * 0.0016 + verts[i2].ph) * 1.6 : 0); }
    function vy(i2) { return py(verts[i2]) + (wob && i2 !== dragIdx ? Math.cos(now * 0.0013 + verts[i2].ph) * 1.6 : 0); }
    // edges
    for (i = 0; i < edges.length; i++) {
      var e = edges[i];
      x1 = vx(e.a); y1 = vy(e.a); x2 = vx(e.b); y2 = vy(e.b);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      if (e.bad) { g.strokeStyle = C.bad; g.lineWidth = 2; g.globalAlpha = 0.9; }
      else {
        g.strokeStyle = C.accent; g.lineWidth = 2; g.globalAlpha = 0.85;
        if (!api.lowEnd) { g.shadowColor = C.accent; g.shadowBlur = 6; }
      }
      g.stroke();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
    // vertices: glowing orbs
    for (i = 0; i < verts.length; i++) {
      var r = i === dragIdx ? 14 : 10;
      var x = vx(i), y = vy(i);
      if (!api.lowEnd) { g.shadowColor = C.accent; g.shadowBlur = i === dragIdx ? 18 : 10; }
      g.beginPath();
      g.arc(x, y, r, 0, 6.2832);
      g.fillStyle = i === dragIdx ? C.text : C.accent;
      g.fill();
      g.shadowBlur = 0;
      g.beginPath();
      g.arc(x - r * 0.25, y - r * 0.3, r * 0.35, 0, 6.2832);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fill();
    }
    // header: level + live crossing counter
    g.fillStyle = C.text;
    g.font = 'bold 15px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(api.t('level') + ' ' + (level + 1) + '/' + NODES.length + '    ✖ ' + cross, cv.W / 2, 20);
    if (banner && now < banner.until) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(0, cv.H / 2 - 34, cv.W, 68);
      g.fillStyle = C.good;
      g.font = 'bold 24px sans-serif';
      g.fillText((RU ? 'Распутано! ' : 'Untangled! ') + banner.text, cv.W / 2, cv.H / 2);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (paused) return;
    draw();
  }

  level = 0; total = 0;
  api.score(0);
  newLevel();
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      cv.canvas.removeEventListener('touchstart', onDown);
      cv.canvas.removeEventListener('touchmove', onMove);
      cv.canvas.removeEventListener('touchend', onUp);
      cv.canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
