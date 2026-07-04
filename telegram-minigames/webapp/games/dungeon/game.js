/* Dungeon Crawl — turn-based mini-roguelike with shadow-cast lighting. */
(function () {
'use strict';

/*GEN*/
var MW = 24, MH = 24;

var MDEF = {
  bat:    { e: '🦇', hp: 3,  atk: 1, er: 1 },
  goblin: { e: '👺', hp: 5,  atk: 2, los: 6 },
  slime:  { e: '🟢', hp: 8,  atk: 1, slow: 1, los: 5 },
  skel:   { e: '💀', hp: 6,  atk: 3, los: 7 },
  ogre:   { e: '👹', hp: 14, atk: 4, slow: 1, los: 7 }
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function bfsDist(map, sx, sy) {
  var dist = new Int16Array(MW * MH), i;
  for (i = 0; i < dist.length; i++) dist[i] = -1;
  var q = [sy * MW + sx], head = 0;
  dist[q[0]] = 0;
  while (head < q.length) {
    var c = q[head++], cx = c % MW, cy = (c / MW) | 0;
    var nb = [c - 1, c + 1, c - MW, c + MW];
    var okd = [cx > 0, cx < MW - 1, cy > 0, cy < MH - 1];
    for (i = 0; i < 4; i++) {
      if (okd[i] && map[nb[i]] === 1 && dist[nb[i]] < 0) {
        dist[nb[i]] = dist[c] + 1;
        q.push(nb[i]);
      }
    }
  }
  return dist;
}

function carveCorridor(map, x0, y0, x1, y1, horizFirst) {
  var x = x0, y = y0;
  function h() { while (x !== x1) { map[y * MW + x] = 1; x += x < x1 ? 1 : -1; } }
  function v() { while (y !== y1) { map[y * MW + x] = 1; y += y < y1 ? 1 : -1; } }
  if (horizFirst) { h(); v(); } else { v(); h(); }
  map[y * MW + x] = 1;
}

function pickMonType(fl, rnd) {
  var pool = [['bat', Math.max(1, 4 - fl)], ['goblin', 3]];
  if (fl >= 2) pool.push(['slime', 2]);
  if (fl >= 3) pool.push(['skel', fl - 1]);
  if (fl >= 5) pool.push(['ogre', fl - 3]);
  var tot = 0, i;
  for (i = 0; i < pool.length; i++) tot += pool[i][1];
  var r = rnd() * tot;
  for (i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r < 0) return pool[i][0]; }
  return 'bat';
}

function tryGen(fl, rnd, fallback) {
  var map = new Uint8Array(MW * MH), rooms = [], i, j, x, y;
  function carve(x0, y0, w, h) {
    for (var yy = y0; yy < y0 + h; yy++)
      for (var xx = x0; xx < x0 + w; xx++) map[yy * MW + xx] = 1;
  }
  if (fallback) {
    carve(2, 2, MW - 4, MH - 4);
    rooms.push({ x: 2, y: 2, w: MW - 4, h: MH - 4, cx: MW >> 1, cy: MH >> 1 });
  } else {
    var want = 6 + Math.min(4, fl);
    for (i = 0; i < 90 && rooms.length < want; i++) {
      var w = 3 + (rnd() * 5 | 0), h = 3 + (rnd() * 4 | 0);
      x = 1 + ((MW - w - 2) * rnd() | 0);
      y = 1 + ((MH - h - 2) * rnd() | 0);
      var ok = true;
      for (j = 0; j < rooms.length; j++) {
        var o = rooms[j];
        if (x < o.x + o.w + 1 && o.x < x + w + 1 && y < o.y + o.h + 1 && o.y < y + h + 1) { ok = false; break; }
      }
      if (ok) {
        rooms.push({ x: x, y: y, w: w, h: h, cx: x + (w >> 1), cy: y + (h >> 1) });
        carve(x, y, w, h);
      }
    }
    if (rooms.length < 4) return null;
    for (i = 1; i < rooms.length; i++)
      carveCorridor(map, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy, rnd() < 0.5);
    if (rooms.length > 4 && rnd() < 0.6)
      carveCorridor(map, rooms[0].cx, rooms[0].cy, rooms[rooms.length - 1].cx, rooms[rooms.length - 1].cy, rnd() < 0.5);
  }

  var entry = { x: rooms[0].cx, y: rooms[0].cy };
  var dist = bfsDist(map, entry.x, entry.y);
  for (i = 0; i < MW * MH; i++) if (map[i] === 1 && dist[i] < 0) return null; // connectivity

  var far = -1, sx = entry.x, sy = entry.y;
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) {
    i = y * MW + x;
    if (map[i] === 1 && dist[i] > far) { far = dist[i]; sx = x; sy = y; }
  }
  if (!fallback && far < 12) return null; // stairs must be far from entry

  // candidate spawn cells (floor, away from entry, not stairs)
  var cand = [];
  for (y = 0; y < MH; y++) for (x = 0; x < MW; x++) {
    i = y * MW + x;
    if (map[i] === 1 && dist[i] >= 5 && !(x === sx && y === sy)) cand.push({ x: x, y: y });
  }
  for (i = cand.length - 1; i > 0; i--) { // shuffle
    j = (rnd() * (i + 1)) | 0;
    var tmp = cand[i]; cand[i] = cand[j]; cand[j] = tmp;
  }
  function take() { return cand.pop() || null; }

  var monsters = [], items = [];
  var mc = Math.min(12, 3 + Math.floor(fl * 1.2));
  for (i = 0; i < mc; i++) {
    var mp = take(); if (!mp) break;
    monsters.push({ x: mp.x, y: mp.y, t: pickMonType(fl, rnd) });
  }
  function addItem(t, v) {
    var p = take(); if (!p) return;
    items.push({ x: p.x, y: p.y, t: t, v: v || 0 });
  }
  var np = 1 + (rnd() * 2 | 0);
  for (i = 0; i < np; i++) addItem('potion');
  var ng = 2 + (rnd() * 2 | 0);
  for (i = 0; i < ng; i++) addItem('gold', 4 + (rnd() * 8 | 0) + fl * 2);
  if (fl >= 2 && fl <= 4 && rnd() < 0.7) addItem('weapon', 1);
  if (fl >= 5 && rnd() < 0.6) addItem('weapon', 2);
  if (fl >= 2 && rnd() < 0.5) addItem('armor', fl >= 4 ? 2 : 1);
  if (rnd() < 0.3) addItem('scroll');
  if (rnd() < 0.1) addItem('gem');

  var shade = new Float32Array(MW * MH);
  for (i = 0; i < shade.length; i++) shade[i] = 0.82 + rnd() * 0.36;

  return { map: map, rooms: rooms, entry: entry, stairs: { x: sx, y: sy }, monsters: monsters, items: items, shade: shade };
}

function genFloor(fl, rnd) {
  for (var k = 0; k < 80; k++) {
    var r = tryGen(fl, rnd, false);
    if (r) return r;
  }
  return tryGen(fl, rnd, true);
}
/*ENDGEN*/

MG.register('dungeon', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';
  var LOW = api.lowEnd;

  var VC = 11, VR = 15;           // visible cells
  var FOVR = 6;                   // light radius
  var HUD_T = 46, HUD_B = 60;

  var WICON = ['🗡', '⚔️', '🪓'];
  var WATK = [3, 5, 7];
  var WNAME = RU ? ['Кинжал', 'Меч', 'Топор'] : ['Dagger', 'Sword', 'Axe'];
  var IICON = { potion: '🧪', gold: '💰', weapon: '⚔️', armor: '🛡️', scroll: '✨', gem: '💎' };

  var meta = api.load() || {};
  var bestFloor = meta.bf | 0;

  var mode = 'menu';              // menu | play
  var raf = 0, paused = false, lastTs = 0, deadTimer = 0;
  var cell, ox, oy, viewW, viewH, vignette = null;

  // run state
  var map, shade, explored, vis, monsters, items, stairs, rooms;
  var p, floor, turn, kills, bonus, dead, seedBase;
  var floats = [], parts = [], shakeT = 0, hurtT = 0, floorMsgT = 0, partAcc = 0;
  var flaskRect = { x: 0, y: 0, w: 0, h: 0 };

  function layout() {
    cell = Math.floor(Math.min(cv.W / VC, (cv.H - HUD_T - HUD_B) / VR));
    viewW = cell * VC; viewH = cell * VR;
    ox = Math.floor((cv.W - viewW) / 2);
    oy = HUD_T + Math.floor((cv.H - HUD_T - HUD_B - viewH) / 2);
    vignette = g.createRadialGradient(cv.W / 2, cv.H / 2, Math.min(cv.W, cv.H) * 0.32,
                                      cv.W / 2, cv.H / 2, Math.max(cv.W, cv.H) * 0.72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
  }
  cv.onResize = function () { layout(); };
  layout();

  function sc() {
    return Math.max(0, (p ? p.gold : 0) + floor * 100 + kills * 10 + bonus) | 0;
  }

  function newRun() {
    floor = 1; turn = 0; kills = 0; bonus = 0; dead = false;
    seedBase = (Math.random() * 0x7fffffff) | 0;
    p = { x: 0, y: 0, px: 0, py: 0, hp: 20, maxhp: 20, wpn: 0, armor: 0, gold: 0,
          potions: 1, lx: 0, ly: 0, lungeT: 0, flash: 0 };
    floats.length = 0; parts.length = 0;
    loadFloor();
    mode = 'play';
    api.score(sc());
  }

  function loadFloor() {
    var f = genFloor(floor, mulberry32(seedBase + floor * 31337));
    map = f.map; shade = f.shade; stairs = f.stairs; rooms = f.rooms;
    explored = new Uint8Array(MW * MH);
    vis = new Uint8Array(MW * MH);
    items = f.items;
    monsters = [];
    var hpB = ((floor - 1) / 3) | 0, atkB = ((floor - 1) / 4) | 0;
    for (var i = 0; i < f.monsters.length; i++) {
      var d = MDEF[f.monsters[i].t];
      monsters.push({
        x: f.monsters[i].x, y: f.monsters[i].y, px: f.monsters[i].x, py: f.monsters[i].y,
        t: f.monsters[i].t, e: d.e, hp: d.hp + hpB, maxhp: d.hp + hpB, atk: d.atk + atkB,
        slow: d.slow || 0, er: d.er || 0, los: d.los || 6,
        ph: i & 1, aware: 0, tx: 0, ty: 0, lx: 0, ly: 0, lungeT: 0, flash: 0
      });
    }
    p.x = f.entry.x; p.y = f.entry.y; p.px = p.x; p.py = p.y;
    floats.length = 0; parts.length = 0;
    floorMsgT = 1500;
    computeFov();
    if (floor > bestFloor) { bestFloor = floor; api.save({ bf: bestFloor }); }
  }

  // --- FOV -----------------------------------------------------------------
  function losClear(x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0;
    while (!(x === x1 && y === y1)) {
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) break;
      if (map[y * MW + x] === 0) return false;
    }
    return true;
  }

  function computeFov() {
    for (var i = 0; i < vis.length; i++) vis[i] = 0;
    var r2 = FOVR * FOVR + FOVR;
    for (var dy = -FOVR; dy <= FOVR; dy++) {
      for (var dx = -FOVR; dx <= FOVR; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        var x = p.x + dx, y = p.y + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        if (losClear(p.x, p.y, x, y)) {
          vis[y * MW + x] = 1;
          explored[y * MW + x] = 1;
        }
      }
    }
  }

  // --- floats / fx ---------------------------------------------------------
  function addFloat(x, y, txt, color) {
    floats.push({ x: x, y: y, txt: txt, color: color, t: 0 });
  }

  // --- turn logic ----------------------------------------------------------
  function monAt(x, y) {
    for (var i = 0; i < monsters.length; i++)
      if (monsters[i].x === x && monsters[i].y === y) return monsters[i];
    return null;
  }
  function walkable(x, y) {
    return x >= 0 && y >= 0 && x < MW && y < MH && map[y * MW + x] === 1 &&
           !monAt(x, y) && !(x === p.x && y === p.y);
  }

  function doStep(dx, dy) {
    if (mode !== 'play' || dead) return;
    if (dx === 0 && dy === 0) { endTurn(); return; } // wait
    var nx = p.x + dx, ny = p.y + dy;
    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) return;
    var m = monAt(nx, ny);
    if (m) { attackMon(m, dx, dy); endTurn(); return; }
    if (map[ny * MW + nx] !== 1) return; // wall — no turn spent
    p.x = nx; p.y = ny;
    if (LOW) { p.px = nx; p.py = ny; }
    pickup(nx, ny);
    if (nx === stairs.x && ny === stairs.y) { descend(); return; }
    endTurn();
  }

  function attackMon(m, dx, dy) {
    p.lx = dx; p.ly = dy; p.lungeT = 120;
    var dmg = WATK[p.wpn];
    m.hp -= dmg;
    m.flash = 1;
    addFloat(m.x, m.y, '-' + dmg, '#ffd76a');
    if (m.hp <= 0) {
      kills++;
      addFloat(m.x, m.y, '💥', '#fff');
      monsters.splice(monsters.indexOf(m), 1);
      api.haptic('light');
    }
  }

  function pickup(x, y) {
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.x !== x || it.y !== y) continue;
      if (it.t === 'potion') {
        if (p.potions >= 3) { addFloat(x, y, '3/3', C.muted); continue; }
        p.potions++;
        addFloat(x, y, '🧪+1', C.good);
      } else if (it.t === 'gold') {
        p.gold += it.v;
        addFloat(x, y, '+' + it.v + '💰', '#ffd76a');
      } else if (it.t === 'weapon') {
        if (it.v > p.wpn) { p.wpn = it.v; addFloat(x, y, WICON[it.v] + ' ' + WNAME[it.v], C.good); }
        else { p.gold += 5; addFloat(x, y, '+5💰', '#ffd76a'); }
      } else if (it.t === 'armor') {
        if (it.v > p.armor) { p.armor = it.v; addFloat(x, y, '🛡+' + it.v, C.good); }
        else { p.gold += 5; addFloat(x, y, '+5💰', '#ffd76a'); }
      } else if (it.t === 'scroll') {
        for (var j = 0; j < explored.length; j++) if (map[j] === 1) explored[j] = 1;
        addFloat(x, y, RU ? 'Карта!' : 'Revealed!', C.accent);
      } else if (it.t === 'gem') {
        bonus += 200;
        addFloat(x, y, '+200', '#7ee0ff');
      }
      items.splice(i, 1);
    }
  }

  function drinkPotion() {
    if (mode !== 'play' || dead || p.potions <= 0 || p.hp >= p.maxhp) return;
    p.potions--;
    p.hp = Math.min(p.maxhp, p.hp + 8);
    addFloat(p.x, p.y, '+8', C.good);
    endTurn(); // costs a turn
  }

  function descend() {
    api.haptic('success');
    floor++;
    p.hp = Math.min(p.maxhp, p.hp + 4);
    loadFloor();
    api.score(sc());
  }

  function endTurn() {
    turn++;
    for (var i = monsters.length - 1; i >= 0; i--) monsterAct(monsters[i]);
    computeFov();
    api.score(sc());
  }

  function monsterAct(m) {
    if (m.slow && ((turn + m.ph) & 1)) return; // slow: acts every other turn
    var dx = p.x - m.x, dy = p.y - m.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) { hitPlayer(m, dx, dy); return; }
    var dist = Math.sqrt(dx * dx + dy * dy);
    var sees = dist <= m.los && losClear(m.x, m.y, p.x, p.y);
    if (sees) { m.aware = 8; m.tx = p.x; m.ty = p.y; }
    else if (m.aware > 0) m.aware--;
    var chase = sees || m.aware > 0;
    if (m.er && Math.random() < 0.5) chase = false; // erratic flutter
    if (chase) stepToward(m, m.tx, m.ty);
    else if (Math.random() < (m.er ? 0.7 : 0.3)) stepRandom(m);
  }

  function tryMove(m, dx, dy) {
    var nx = m.x + dx, ny = m.y + dy;
    if (!walkable(nx, ny)) return false;
    m.x = nx; m.y = ny;
    if (LOW) { m.px = nx; m.py = ny; }
    return true;
  }
  function stepToward(m, tx, ty) {
    var dx = tx > m.x ? 1 : tx < m.x ? -1 : 0;
    var dy = ty > m.y ? 1 : ty < m.y ? -1 : 0;
    if (Math.abs(tx - m.x) >= Math.abs(ty - m.y)) {
      if (!(dx && tryMove(m, dx, 0))) { if (dy) tryMove(m, 0, dy); }
    } else {
      if (!(dy && tryMove(m, 0, dy))) { if (dx) tryMove(m, dx, 0); }
    }
  }
  function stepRandom(m) {
    var d = [[1, 0], [-1, 0], [0, 1], [0, -1]][(Math.random() * 4) | 0];
    tryMove(m, d[0], d[1]);
  }

  function hitPlayer(m, dx, dy) {
    m.lx = dx; m.ly = dy; m.lungeT = 120;
    var dmg = Math.max(1, m.atk - p.armor);
    p.hp -= dmg;
    addFloat(p.x, p.y, '-' + dmg, '#ff6b6b');
    hurtT = 240; shakeT = 220;
    api.haptic('medium');
    if (p.hp <= 0) {
      p.hp = 0;
      dead = true;
      api.haptic('error');
      if (floor > bestFloor) { bestFloor = floor; }
      api.save({ bf: bestFloor });
      deadTimer = setTimeout(function () { api.gameOver(sc()); }, 900);
    }
  }

  // --- input ---------------------------------------------------------------
  function startRun() { newRun(); }

  var offSwipe = api.swipe(container, function (dir, pt) {
    if (mode === 'menu') { startRun(); return; }
    if (dead) return;
    if (dir === 'tap' && pt) {
      // HUD flask button
      if (pt.x >= flaskRect.x && pt.x <= flaskRect.x + flaskRect.w &&
          pt.y >= flaskRect.y && pt.y <= flaskRect.y + flaskRect.h) { drinkPotion(); return; }
      // tap in view → move toward tapped cell (tap player = wait)
      if (pt.y < oy || pt.y > oy + viewH) return;
      var camX = clampCam(p.px + 0.5 - VC / 2, MW - VC);
      var camY = clampCam(p.py + 0.5 - VR / 2, MH - VR);
      var gx = Math.floor(camX + (pt.x - ox) / cell);
      var gy = Math.floor(camY + (pt.y - oy) / cell);
      var dx = gx - p.x, dy = gy - p.y;
      if (dx === 0 && dy === 0) { doStep(0, 0); return; }
      if (Math.abs(dx) >= Math.abs(dy)) doStep(dx > 0 ? 1 : -1, 0);
      else doStep(0, dy > 0 ? 1 : -1);
      return;
    }
    var m = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    if (m) doStep(m[0], m[1]);
  });

  function onKey(e) {
    if (mode === 'menu') {
      if (e.key === ' ' || e.key === 'Enter') { startRun(); e.preventDefault(); }
      return;
    }
    var map2 = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
                 a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
    if (map2[e.key]) { doStep(map2[e.key][0], map2[e.key][1]); e.preventDefault(); }
    else if (e.key === ' ') { doStep(0, 0); e.preventDefault(); }
    else if (e.key === 'q' || e.key === 'e') drinkPotion();
  }
  window.addEventListener('keydown', onKey);

  function clampCam(v, max) { return Math.max(0, Math.min(max, v)); }

  // --- rendering -----------------------------------------------------------
  function tileColor(idx, wall, b, warm) {
    var sh = shade[idx];
    var r, gg, bb;
    if (wall) { r = 108; gg = 100; bb = 122; } else { r = 72; gg = 68; bb = 84; }
    if (warm) {
      r = r * sh * b * 1.18;
      gg = gg * sh * b * 1.0;
      bb = bb * sh * b * 0.8;
    } else { // cool memory tint
      r = r * sh * b * 0.7;
      gg = gg * sh * b * 0.82;
      bb = bb * sh * b * 1.15;
    }
    return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (bb | 0) + ')';
  }

  function updateAnims(dt) {
    var k = 1 - Math.exp(-dt / 38);
    if (!LOW) {
      p.px += (p.x - p.px) * k;
      p.py += (p.y - p.py) * k;
      for (var i = 0; i < monsters.length; i++) {
        var m = monsters[i];
        m.px += (m.x - m.px) * k;
        m.py += (m.y - m.py) * k;
        if (m.lungeT > 0) m.lungeT -= dt;
        if (m.flash > 0) m.flash -= dt / 180;
      }
    } else {
      p.px = p.x; p.py = p.y;
      for (var j = 0; j < monsters.length; j++) {
        monsters[j].px = monsters[j].x; monsters[j].py = monsters[j].y;
        if (monsters[j].lungeT > 0) monsters[j].lungeT -= dt;
        if (monsters[j].flash > 0) monsters[j].flash -= dt / 180;
      }
    }
    if (p.lungeT > 0) p.lungeT -= dt;
    if (shakeT > 0) shakeT -= dt;
    if (hurtT > 0) hurtT -= dt;
    if (floorMsgT > 0) floorMsgT -= dt;
    for (var f = floats.length - 1; f >= 0; f--) {
      floats[f].t += dt;
      if (floats[f].t > 900) floats.splice(f, 1);
    }
    if (!LOW) {
      partAcc += dt;
      if (partAcc > 260 && parts.length < 22) {
        partAcc = 0;
        var a = Math.random() * Math.PI * 2, rr = 1 + Math.random() * 4.5;
        parts.push({ x: p.x + 0.5 + Math.cos(a) * rr, y: p.y + 0.5 + Math.sin(a) * rr,
                     vx: (Math.random() - 0.5) * 0.0004, vy: -0.00025 - Math.random() * 0.0003,
                     t: 0, life: 2600 + Math.random() * 2600 });
      }
      for (var q = parts.length - 1; q >= 0; q--) {
        var pp = parts[q];
        pp.t += dt; pp.x += pp.vx * dt; pp.y += pp.vy * dt;
        if (pp.t > pp.life) parts.splice(q, 1);
      }
    }
  }

  function lunge(ent) {
    if (ent.lungeT <= 0) return { x: 0, y: 0 };
    var s = Math.sin(Math.PI * (1 - ent.lungeT / 120)) * 0.32;
    return { x: ent.lx * s, y: ent.ly * s };
  }

  function draw(ts) {
    g.fillStyle = '#07070c';
    g.fillRect(0, 0, cv.W, cv.H);
    if (mode === 'menu') { drawMenu(ts); return; }

    var flick = LOW ? 1 : 1 + 0.055 * Math.sin(ts * 0.0071) + 0.035 * Math.sin(ts * 0.0133 + 2.1);
    var camX = clampCam(p.px + 0.5 - VC / 2, MW - VC);
    var camY = clampCam(p.py + 0.5 - VR / 2, MH - VR);
    var shx = 0, shy = 0;
    if (shakeT > 0 && !LOW) {
      var sa = shakeT / 220 * 3.5;
      shx = (Math.random() - 0.5) * sa; shy = (Math.random() - 0.5) * sa;
    }

    g.save();
    g.beginPath();
    g.rect(ox, oy, viewW, viewH);
    g.clip();
    g.translate(shx, shy);

    var lr = (FOVR + 0.6) * flick;
    var x0 = Math.floor(camX), y0 = Math.floor(camY);
    var gx, gy, idx, sx, sy;
    for (gy = y0; gy <= Math.min(MH - 1, y0 + VR); gy++) {
      for (gx = x0; gx <= Math.min(MW - 1, x0 + VC); gx++) {
        idx = gy * MW + gx;
        if (!explored[idx]) continue;
        sx = ox + (gx - camX) * cell;
        sy = oy + (gy - camY) * cell;
        var wall = map[idx] === 0;
        if (vis[idx]) {
          var ddx = gx - p.px, ddy = gy - p.py;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          var b = Math.max(0, 1 - d / lr);
          b = 0.16 + 0.84 * b * b;
          g.fillStyle = tileColor(idx, wall, b, true);
        } else {
          g.fillStyle = tileColor(idx, wall, 0.16, false);
        }
        g.fillRect(sx, sy, cell + 1, cell + 1);
        if (wall) {
          g.fillStyle = 'rgba(0,0,0,0.28)';
          g.fillRect(sx, sy + cell * 0.78, cell + 1, cell * 0.22 + 1);
        }
      }
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // stairs
    idx = stairs.y * MW + stairs.x;
    if (explored[idx]) {
      g.globalAlpha = vis[idx] ? 1 : 0.4;
      g.fillStyle = C.accent;
      g.font = 'bold ' + (cell * 0.6 | 0) + 'px sans-serif';
      g.fillText('▼', ox + (stairs.x - camX) * cell + cell / 2, oy + (stairs.y - camY) * cell + cell / 2 + 1);
      g.globalAlpha = 1;
    }

    // items (ghost memory when explored, bright when visible)
    g.font = (cell * 0.6 | 0) + 'px sans-serif';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      idx = it.y * MW + it.x;
      if (!explored[idx]) continue;
      g.globalAlpha = vis[idx] ? 1 : 0.3;
      g.fillText(IICON[it.t], ox + (it.x - camX) * cell + cell / 2, oy + (it.y - camY) * cell + cell / 2 + 1);
    }
    g.globalAlpha = 1;

    // dust motes in the light
    if (!LOW) {
      for (var q = 0; q < parts.length; q++) {
        var pt = parts[q];
        var cxi = pt.x | 0, cyi = pt.y | 0;
        if (cxi < 0 || cyi < 0 || cxi >= MW || cyi >= MH || !vis[cyi * MW + cxi]) continue;
        var pd = Math.sqrt((pt.x - p.px - 0.5) * (pt.x - p.px - 0.5) + (pt.y - p.py - 0.5) * (pt.y - p.py - 0.5));
        var pb = Math.max(0, 1 - pd / lr);
        var fade = Math.sin(Math.PI * pt.t / pt.life);
        g.fillStyle = 'rgba(255,214,150,' + (0.34 * pb * fade).toFixed(3) + ')';
        g.fillRect(ox + (pt.x - camX) * cell, oy + (pt.y - camY) * cell, 2, 2);
      }
    }

    // monsters — only when visible
    g.font = (cell * 0.74 | 0) + 'px sans-serif';
    for (i = 0; i < monsters.length; i++) {
      var m = monsters[i];
      if (!vis[m.y * MW + m.x]) continue;
      var lg = lunge(m);
      var mx = ox + (m.px + lg.x - camX) * cell + cell / 2;
      var my = oy + (m.py + lg.y - camY) * cell + cell / 2;
      g.fillText(m.e, mx, my + 1);
      if (m.flash > 0) {
        g.fillStyle = 'rgba(255,255,255,' + (0.75 * m.flash).toFixed(2) + ')';
        g.beginPath();
        g.arc(mx, my, cell * 0.42, 0, 7);
        g.fill();
      }
      if (m.hp < m.maxhp) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(mx - cell * 0.32, my - cell * 0.52, cell * 0.64, 3);
        g.fillStyle = C.bad;
        g.fillRect(mx - cell * 0.32, my - cell * 0.52, cell * 0.64 * (m.hp / m.maxhp), 3);
      }
    }

    // player torch glow + player
    var plg = lunge(p);
    var pxs = ox + (p.px + plg.x - camX) * cell + cell / 2;
    var pys = oy + (p.py + plg.y - camY) * cell + cell / 2;
    if (!LOW) {
      var glow = g.createRadialGradient(pxs, pys, 0, pxs, pys, cell * 2.6 * flick);
      glow.addColorStop(0, 'rgba(255,178,84,0.16)');
      glow.addColorStop(1, 'rgba(255,178,84,0)');
      g.fillStyle = glow;
      g.fillRect(pxs - cell * 3, pys - cell * 3, cell * 6, cell * 6);
    }
    g.font = (cell * 0.78 | 0) + 'px sans-serif';
    g.fillText('🧙', pxs, pys + 1);

    // floating damage numbers
    g.font = 'bold ' + Math.max(12, cell * 0.42 | 0) + 'px sans-serif';
    for (i = 0; i < floats.length; i++) {
      var fl = floats[i];
      var a = 1 - fl.t / 900;
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = fl.color;
      g.fillText(fl.txt,
        ox + (fl.x - camX) * cell + cell / 2,
        oy + (fl.y - camY) * cell + cell * 0.1 - (fl.t / 900) * cell * 0.9);
    }
    g.globalAlpha = 1;
    g.restore();

    // vignette
    g.fillStyle = vignette;
    g.fillRect(0, 0, cv.W, cv.H);

    // hurt flash
    if (hurtT > 0) {
      g.fillStyle = 'rgba(200,30,30,' + (0.22 * hurtT / 240).toFixed(3) + ')';
      g.fillRect(0, 0, cv.W, cv.H);
    }

    drawHud();

    if (floorMsgT > 0) {
      g.globalAlpha = Math.min(1, floorMsgT / 500);
      g.fillStyle = C.text;
      g.textAlign = 'center';
      g.font = 'bold 26px sans-serif';
      g.fillText((RU ? 'Этаж ' : 'Floor ') + floor, cv.W / 2, oy + viewH * 0.32);
      g.globalAlpha = 1;
    }

    if (dead) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, cv.W, cv.H);
    }
  }

  function drawHud() {
    // top bar
    g.fillStyle = C.panel;
    g.globalAlpha = 0.92;
    g.fillRect(0, 0, cv.W, HUD_T);
    g.fillRect(0, cv.H - HUD_B, cv.W, HUD_B);
    g.globalAlpha = 1;

    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = '15px sans-serif';
    var hx = 10, hy = HUD_T / 2;
    for (var i = 0; i < 10; i++) {
      var seg = p.hp - i * 2;
      g.fillText(seg >= 2 ? '❤️' : seg === 1 ? '💔' : '🖤', hx + i * 17, hy);
    }
    g.textAlign = 'right';
    g.fillStyle = C.accent;
    g.font = 'bold 16px sans-serif';
    g.fillText('▼ ' + floor, cv.W - 12, hy);

    // bottom bar
    var by = cv.H - HUD_B / 2;
    g.textAlign = 'left';
    g.fillStyle = C.text;
    g.font = '17px sans-serif';
    g.fillText(WICON[p.wpn] + ' ' + WATK[p.wpn], 12, by);
    g.fillText('🛡 ' + p.armor, 76, by);

    // flask button
    var fw = 74, fh = 40;
    flaskRect.x = (cv.W - fw) / 2; flaskRect.y = cv.H - HUD_B / 2 - fh / 2;
    flaskRect.w = fw; flaskRect.h = fh;
    g.fillStyle = p.potions > 0 && p.hp < p.maxhp ? C.panel2 : C.panel;
    g.strokeStyle = p.potions > 0 ? C.accent : C.muted;
    g.lineWidth = 1.5;
    roundRect(flaskRect.x, flaskRect.y, fw, fh, 10);
    g.fill();
    g.stroke();
    g.fillStyle = C.text;
    g.textAlign = 'center';
    g.fillText('🧪×' + p.potions, cv.W / 2, by);

    g.textAlign = 'right';
    g.fillStyle = '#ffd76a';
    g.fillText('💰 ' + p.gold, cv.W - 12, by);
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawMenu(ts) {
    var cx = cv.W / 2, cy = cv.H * 0.30;
    if (!LOW) {
      var fl = 1 + 0.1 * Math.sin(ts * 0.004) + 0.05 * Math.sin(ts * 0.011);
      var glow = g.createRadialGradient(cx, cy, 0, cx, cy, cv.W * 0.55 * fl);
      glow.addColorStop(0, 'rgba(255,166,66,0.20)');
      glow.addColorStop(1, 'rgba(255,166,66,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, cv.W, cv.H);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '54px sans-serif';
    g.fillText('🏰', cx, cy - 56);
    g.fillStyle = C.text;
    g.font = 'bold 30px sans-serif';
    g.fillText(RU ? 'ПОДЗЕМЕЛЬЕ' : 'DUNGEON', cx, cy + 6);
    g.fillStyle = C.accent;
    g.font = '15px sans-serif';
    g.fillText((RU ? 'Лучший этаж: ' : 'Best floor: ') + (bestFloor || '—'), cx, cy + 40);

    g.fillStyle = C.muted;
    g.font = '13px sans-serif';
    var legend = RU ? [
      'Свайп / тап — шаг, столкновение — атака',
      'Каждый твой ход — ход монстров',
      '🦇👺🟢💀👹 — монстры',
      '🧪 зелье  ⚔️ оружие  🛡 броня',
      '💰 золото  ✨ карта  💎 +200  ▼ вниз'
    ] : [
      'Swipe / tap — step, bump — attack',
      'Every move the monsters move too',
      '🦇👺🟢💀👹 — monsters',
      '🧪 potion  ⚔️ weapon  🛡 armor',
      '💰 gold  ✨ reveal  💎 +200  ▼ descend'
    ];
    for (var i = 0; i < legend.length; i++)
      g.fillText(legend[i], cx, cv.H * 0.52 + i * 22);

    g.fillStyle = C.text;
    g.font = 'bold 18px sans-serif';
    g.globalAlpha = LOW ? 1 : 0.65 + 0.35 * Math.sin(ts * 0.004);
    g.fillText(api.t('tap_to_start'), cx, cv.H * 0.82);
    g.globalAlpha = 1;

    g.fillStyle = vignette;
    g.fillRect(0, 0, cv.W, cv.H);
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (paused) { lastTs = ts; return; }
    var dt = Math.min(80, ts - lastTs || 16);
    lastTs = ts;
    if (mode === 'play') updateAnims(dt);
    draw(ts);
  }
  raf = requestAnimationFrame(loop);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      clearTimeout(deadTimer);
      window.removeEventListener('keydown', onKey);
      offSwipe();
      cv.destroy();
    },
    pause: function () { paused = true; },
    resume: function () { paused = false; }
  };
});
})();
