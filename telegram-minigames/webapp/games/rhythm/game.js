/* Beat Tap — 4-lane rhythm game with fully synthesized music (WebAudio). */
(function () {
'use strict';
MG.register('rhythm', function (container, api) {
  var cv = api.createCanvas();
  var g = cv.g;
  var C = api.colors;
  var RU = api.lang === 'ru';
  var LOW = api.lowEnd;

  // ---------- constants ----------
  var LANES = 4;
  var HUES = [187, 275, 330, 45];           // lane hues (cyan/violet/pink/gold)
  var BPMS = [90, 115, 140];
  var DENS = [0.42, 0.53, 0.63];
  var APPROACH = [1.9, 1.65, 1.42];         // seconds from top to hit bar
  var STAGE_LEN = 40;                        // seconds of music per stage
  var LEAD_IN = 2.2;                         // silence before stage music
  var VIS_OFF = -0.030;                      // fixed visual offset
  var P_WIN = 0.050, G_WIN = 0.110, M_WIN = 0.250;
  var KEYS = { d: 0, f: 1, j: 2, k: 3, 'в': 0, 'а': 1, 'о': 2, 'л': 3 };
  var JTXT = RU ? ['ИДЕАЛЬНО', 'ХОРОШО', 'МИМО'] : ['PERFECT', 'GOOD', 'MISS'];
  var T_STAGE = RU ? 'ЭТАП' : 'STAGE';
  var T_CLEAR = RU ? 'ЭТАП ПРОЙДЕН!' : 'STAGE CLEAR!';
  var T_ACC = RU ? 'Точность' : 'Accuracy';
  var T_COMBO = RU ? 'Макс. комбо' : 'Max combo';
  var T_HINT = RU ? 'Жми по дорожкам в такт' : 'Tap the lanes on the beat';
  var T_KEYS = 'D F J K';
  var T_MUTE = RU ? 'без звука' : 'silent mode';

  // ---------- layout ----------
  var laneW, hitY, padTop, eqN = 16;
  function layout() {
    laneW = cv.W / LANES;
    hitY = cv.H - Math.max(110, cv.H * 0.16);
    padTop = 46;
  }
  cv.onResize = function () { layout(); };
  layout();

  // ---------- seeded RNG ----------
  var baseSeed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function m2f(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---------- audio ----------
  var actx = null, master = null, noiseBuf = null, audioOK = false;
  function initAudio() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.5;
      master.connect(actx.destination);
      var len = Math.floor(actx.sampleRate * 0.06);
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (actx.state === 'suspended') actx.resume();
      audioOK = true;
    } catch (e) { actx = null; audioOK = false; }
  }
  // song clock: AudioContext time, or performance.now-based in silent mode
  var silentBase = 0, pauseAt = 0;
  function getT() {
    if (audioOK && actx) return actx.currentTime;
    return (performance.now() - silentBase) / 1000;
  }

  function playKick(t) {
    var o = actx.createOscillator(), v = actx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    v.gain.setValueAtTime(0.9, t);
    v.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(v); v.connect(master);
    o.start(t); o.stop(t + 0.3);
  }
  function playHat(t) {
    var s = actx.createBufferSource(), v = actx.createGain(), f = actx.createBiquadFilter();
    s.buffer = noiseBuf;
    f.type = 'highpass'; f.frequency.value = 6000;
    v.gain.setValueAtTime(0.22, t);
    v.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(v); v.connect(master);
    s.start(t); s.stop(t + 0.06);
  }
  function playBass(t, fq) {
    var o = actx.createOscillator(), v = actx.createGain();
    o.type = 'triangle';
    o.frequency.value = fq;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(0.3, t + 0.015);
    v.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(v); v.connect(master);
    o.start(t); o.stop(t + 0.32);
  }
  function playLead(t, fq, sq) {
    var o = actx.createOscillator(), v = actx.createGain();
    o.type = sq ? 'square' : 'sine';
    o.frequency.value = fq;
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(sq ? 0.13 : 0.22, t + 0.008);
    v.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(v); v.connect(master);
    o.start(t); o.stop(t + 0.28);
  }
  function playEv(ev) {
    if (!audioOK) return;
    try {
      if (ev.k === 0) playKick(ev.t);
      else if (ev.k === 1) playHat(ev.t);
      else if (ev.k === 2) playBass(ev.t, ev.f);
      else playLead(ev.t, ev.f, ev.sq);
    } catch (e) { /* keep playing silently */ }
  }

  // ---------- music + note generation ----------
  var events = [], notes = [], evIdx = 0, noteIdx = 0;
  var stage = 0, stageStartT = 0, stageEndT = 0, beatDur = 0.6;

  function buildStage(si, startT) {
    var rng = mulberry32((baseSeed + si * 7919) >>> 0);
    var bpm = BPMS[si];
    var beat = 60 / bpm;
    beatDur = beat;
    var root = 45 + Math.floor(rng() * 8);            // A2..E3
    var scale = rng() < 0.4 ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
    var sq = rng() < 0.6;                             // lead timbre per stage
    var bars = Math.floor(STAGE_LEN / (beat * 4));
    var dens = DENS[si];
    events = []; notes = []; evIdx = 0; noteIdx = 0;

    // 2-bar motif on an eighth-note grid (16 slots), random-walk degrees
    var motif = [], deg = 4 + Math.floor(rng() * 4);
    for (var i = 0; i < 16; i++) {
      if (i === 0 || rng() < dens) {
        deg += Math.floor(rng() * 5) - 2;
        if (deg < 0) deg = 0; if (deg > 9) deg = 9;
        motif.push(deg);
      } else motif.push(-1);
    }

    var laneLast = [-9, -9, -9, -9];
    function addNote(t, lane) {
      if (t - laneLast[lane] < 0.18) return;
      laneLast[lane] = t;
      notes.push({ t: t, lane: lane, j: -1 });        // j: -1 pending, 0/1 hit, 2 miss
    }

    for (var b = 0; b < bars; b++) {
      var bt = startT + b * 4 * beat;
      for (var q = 0; q < 4; q++) {
        var t = bt + q * beat;
        events.push({ t: t, k: 0, dn: q === 0 });                      // kick on beats
        events.push({ t: t + beat / 2, k: 1 });                        // hihat off-beats
        events.push({ t: t, k: 2, f: m2f(root - 12 + (q < 2 ? 0 : 7)) }); // bass root/fifth
        if (q === 0 && si >= 1 && b > 0 && rng() < 0.45) addNote(t, b % LANES); // some kicks
      }
      for (var s = 0; s < 8; s++) {                                    // lead melody
        var d0 = motif[(b % 2) * 8 + s];
        if (d0 < 0) { if (rng() < 0.06) d0 = Math.floor(rng() * 10); else continue; }
        var dd = d0;
        if (rng() < 0.18) { dd += rng() < 0.5 ? 1 : -1; if (dd < 0) dd = 0; if (dd > 9) dd = 9; }
        var tt = bt + s * beat / 2;
        events.push({ t: tt, k: 3, f: m2f(root + 12 + scale[dd % 5] + 12 * Math.floor(dd / 5)), sq: sq, dg: dd });
        addNote(tt, dd % LANES);
      }
    }
    events.sort(function (a, b2) { return a.t - b2.t; });
    notes.sort(function (a, b2) { return a.t - b2.t; });
    stageStartT = startT;
    stageEndT = startT + bars * 4 * beat + 0.6;
  }

  // ---------- lookahead scheduler ----------
  var sched = 0, fxQ = [];
  function schedTick() {
    if (paused || (state !== 'play')) return;
    var now = getT();
    while (evIdx < events.length && events[evIdx].t < now + 0.2) {
      var ev = events[evIdx++];
      playEv(ev);
      fxQ.push(ev);                                    // fake-FFT visual pulse
    }
  }

  // ---------- game state ----------
  var state = 'ready';                                 // ready | play | inter | done
  var paused = false;
  var score = 0, combo = 0, maxCombo = 0, hp = 100;
  var stHit = 0, stTotal = 0, stMaxCombo = 0;          // per-stage stats
  var lastAcc = 0, lastMaxCombo = 0;
  var interEndT = 0, perfStreak = 0;
  var raf = 0, lastFrame = 0;

  // visuals
  var eq = new Array(eqN); for (var z = 0; z < eqN; z++) eq[z] = 0;
  var beatPulse = 0, screenPulse = 0, comboScale = 1;
  var lanePress = [0, 0, 0, 0];
  var rings = [], labels = [];

  function mult() { return combo >= 50 ? 4 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1; }

  function judge(lane) {
    lanePress[lane] = 1;
    var now = getT();
    var best = null, bd = 1e9;
    for (var i = noteIdx; i < notes.length; i++) {
      var n = notes[i];
      if (n.t - now > M_WIN + 0.05) break;
      if (n.j !== -1 || n.lane !== lane) continue;
      var d = Math.abs(now - n.t);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best || bd > M_WIN) return;                   // empty tap: no penalty
    if (bd <= P_WIN) hitNote(best, 0);
    else if (bd <= G_WIN) hitNote(best, 1);
    else missNote(best, true);
  }

  function hitNote(n, kind) {
    n.j = kind;
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo > stMaxCombo) stMaxCombo = combo;
    score += (kind === 0 ? 30 : 10) * mult();
    api.score(score);
    stHit++; stTotal++;
    comboScale = 1.45;
    if (kind === 0) {
      hp = Math.min(100, hp + 2);
      perfStreak++;
      if (perfStreak % 10 === 0) api.haptic('light');
    } else perfStreak = 0;
    var x = n.lane * laneW + laneW / 2;
    addLabel(x, hitY - 34, JTXT[kind], kind === 0 ? 'hsl(' + HUES[n.lane] + ',95%,70%)' : C.good);
    if (!LOW) rings.push({ x: x, y: hitY, r: 8, life: 1, hue: HUES[n.lane] });
  }

  function missNote(n, tapped) {
    n.j = 2;
    if (state !== 'play') return;
    combo = 0; perfStreak = 0;
    stTotal++;
    hp -= 8;
    addLabel(n.lane * laneW + laneW / 2, hitY - 34, JTXT[2], C.bad);
    if (hp <= 0) {
      hp = 0;
      state = 'done';
      stopMusic();
      api.haptic('error');
      api.gameOver(score, { win: false });
    }
  }

  function addLabel(x, y, txt, col) {
    labels.push({ x: x, y: y, t: txt, c: col, life: 1 });
    if (labels.length > 14) labels.shift();
  }

  function stopMusic() {
    if (audioOK && actx) { try { actx.suspend(); } catch (e) {} }
  }

  function startStage(si) {
    stage = si;
    stHit = 0; stTotal = 0; stMaxCombo = 0;
    buildStage(si, getT() + LEAD_IN);
    state = 'play';
    if (audioOK && actx && actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
  }

  function startGame() {
    initAudio();
    if (!audioOK) silentBase = performance.now();
    score = 0; combo = 0; maxCombo = 0; hp = 100; perfStreak = 0;
    api.score(0);
    startStage(0);
  }

  // ---------- update ----------
  function update(now) {
    // auto-miss passed notes
    while (noteIdx < notes.length) {
      var n = notes[noteIdx];
      if (n.j === -1 && now - n.t > G_WIN + 0.02) missNote(n, false);
      if (n.j !== -1 && now - n.t > 0.4) noteIdx++;
      else break;
    }
    if (state === 'play' && now > stageEndT) {
      lastAcc = stTotal ? Math.round(stHit / stTotal * 100) : 100;
      lastMaxCombo = stMaxCombo;
      api.haptic('success');
      if (stage >= 2) {
        state = 'done';
        stopMusic();
        api.gameOver(score, { win: true });
      } else {
        state = 'inter';
        interEndT = now + 2;
      }
    } else if (state === 'inter' && now > interEndT) {
      startStage(stage + 1);
    }
    // consume scheduled visual pulses (fake FFT)
    while (fxQ.length && fxQ[0].t <= now + 0.001) {
      var ev = fxQ.shift();
      if (ev.k === 0) {
        beatPulse = 1;
        if (ev.dn) screenPulse = 1;
        eq[0] = eq[1] = eq[2] = 1;
      } else if (ev.k === 1) { eq[13] = Math.max(eq[13], 0.55); eq[14] = Math.max(eq[14], 0.5); eq[15] = Math.max(eq[15], 0.45); }
      else if (ev.k === 2) { eq[3] = Math.max(eq[3], 0.8); eq[4] = Math.max(eq[4], 0.75); eq[5] = Math.max(eq[5], 0.6); }
      else { var bi = 6 + Math.min(9, ev.dg || 0); if (bi > 15) bi = 15; eq[bi] = 1; if (bi < 15) eq[bi + 1] = Math.max(eq[bi + 1], 0.6); }
    }
  }

  // ---------- draw ----------
  function rr(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function draw(now, dt) {
    var W = cv.W, H = cv.H;
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);

    var sc = 1 + screenPulse * 0.008;
    g.save();
    if (!LOW && screenPulse > 0.01) {
      g.translate(W / 2, H / 2); g.scale(sc, sc); g.translate(-W / 2, -H / 2);
    }

    // equalizer background
    if (!LOW) {
      var bw = W / eqN;
      for (var i = 0; i < eqN; i++) {
        var e = eq[i];
        if (e < 0.02) continue;
        var bh = e * H * 0.38;
        g.fillStyle = 'hsla(' + (185 + i * 11) + ',80%,55%,' + (0.05 + e * 0.13) + ')';
        g.fillRect(i * bw + 1, hitY - bh, bw - 2, bh);
      }
    }

    // lane rails
    for (var l = 0; l <= LANES; l++) {
      var x = l * laneW;
      var grd = g.createLinearGradient(0, 0, 0, hitY);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(1, 'rgba(255,255,255,0.22)');
      g.fillStyle = grd;
      g.fillRect(x - 1, padTop, 2, hitY - padTop);
    }
    // lane press glow
    for (l = 0; l < LANES; l++) {
      if (lanePress[l] > 0.02) {
        var lg = g.createLinearGradient(0, hitY, 0, hitY - 160);
        lg.addColorStop(0, 'hsla(' + HUES[l] + ',90%,60%,' + (0.3 * lanePress[l]) + ')');
        lg.addColorStop(1, 'hsla(' + HUES[l] + ',90%,60%,0)');
        g.fillStyle = lg;
        g.fillRect(l * laneW + 2, hitY - 160, laneW - 4, 160);
      }
      lanePress[l] *= Math.exp(-dt * 8);
    }

    // hit bar + metronome pulse (also the silent-mode visual metronome)
    g.fillStyle = 'rgba(255,255,255,' + (0.35 + beatPulse * 0.5) + ')';
    g.fillRect(0, hitY - 2, W, 3 + beatPulse * 2);
    // lane buttons
    var btnY = hitY + 12, btnH = H - hitY - 22;
    var keyCh = T_KEYS.split(' ');
    for (l = 0; l < LANES; l++) {
      var bx = l * laneW + 7;
      g.fillStyle = 'hsla(' + HUES[l] + ',60%,50%,' + (0.14 + lanePress[l] * 0.4 + beatPulse * 0.06) + ')';
      rr(bx, btnY, laneW - 14, btnH, 14);
      g.fill();
      g.strokeStyle = 'hsla(' + HUES[l] + ',85%,65%,' + (0.5 + lanePress[l] * 0.5) + ')';
      g.lineWidth = 2;
      rr(bx, btnY, laneW - 14, btnH, 14);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = 'bold 15px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(keyCh[l], l * laneW + laneW / 2, btnY + btnH / 2);
    }

    // notes — position purely from clock: y = f(noteTime - now), never frame deltas
    var appr = APPROACH[stage];
    var pps = (hitY - padTop + 40) / appr;
    var nh = 20, nw = laneW * 0.62;
    for (i = noteIdx; i < notes.length; i++) {
      var n = notes[i];
      var y = hitY - (n.t + VIS_OFF - now) * pps;
      if (y < padTop - nh) break;
      if (n.j === 0 || n.j === 1) continue;
      if (y > hitY + 60) continue;
      var nx = n.lane * laneW + (laneW - nw) / 2;
      var late = n.j === 2;
      if (LOW) {
        g.fillStyle = late ? 'rgba(120,120,120,0.5)' : 'hsl(' + HUES[n.lane] + ',85%,60%)';
        rr(nx, y - nh / 2, nw, nh, nh / 2);
        g.fill();
      } else {
        g.save();
        if (!late) { g.shadowColor = 'hsl(' + HUES[n.lane] + ',90%,60%)'; g.shadowBlur = 12; }
        g.fillStyle = late ? 'rgba(120,120,120,0.5)' : 'hsl(' + HUES[n.lane] + ',85%,58%)';
        rr(nx, y - nh / 2, nw, nh, nh / 2);
        g.fill();
        g.restore();
        var gl = g.createLinearGradient(0, y - nh / 2, 0, y + nh / 2);
        gl.addColorStop(0, 'rgba(255,255,255,' + (late ? 0.1 : 0.4) + ')');
        gl.addColorStop(0.55, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        rr(nx, y - nh / 2, nw, nh, nh / 2);
        g.fill();
      }
    }

    // rings
    for (i = rings.length - 1; i >= 0; i--) {
      var rg2 = rings[i];
      rg2.r += dt * 190; rg2.life -= dt * 2.6;
      if (rg2.life <= 0) { rings.splice(i, 1); continue; }
      g.strokeStyle = 'hsla(' + rg2.hue + ',90%,65%,' + rg2.life + ')';
      g.lineWidth = 3 * rg2.life;
      g.beginPath(); g.arc(rg2.x, rg2.y, rg2.r, 0, Math.PI * 2); g.stroke();
    }
    // floating labels
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (i = labels.length - 1; i >= 0; i--) {
      var lb = labels[i];
      lb.y -= dt * 42; lb.life -= dt * 1.7;
      if (lb.life <= 0) { labels.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, lb.life);
      g.fillStyle = lb.c;
      g.font = 'bold 15px sans-serif';
      g.fillText(lb.t, lb.x, lb.y);
      g.globalAlpha = 1;
    }

    g.restore(); // end screen pulse transform

    // HUD -------------------------------------------------
    // HP bar
    var hw = W - 24;
    g.fillStyle = C.panel;
    rr(12, 10, hw, 10, 5); g.fill();
    if (hp > 0) {
      var hg = g.createLinearGradient(12, 0, 12 + hw, 0);
      hg.addColorStop(0, C.bad);
      hg.addColorStop(0.45, C.accent);
      hg.addColorStop(1, C.good);
      g.fillStyle = hg;
      g.save();
      g.beginPath(); g.rect(12, 10, hw * hp / 100, 10); g.clip();
      rr(12, 10, hw, 10, 5); g.fill();
      g.restore();
    }
    // stage + accuracy
    g.fillStyle = C.muted;
    g.font = '12px sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(T_STAGE + ' ' + (stage + 1) + '/3' + (audioOK ? '' : ' · ' + T_MUTE), 12, 26);
    g.textAlign = 'right';
    var acc = stTotal ? Math.round(stHit / stTotal * 100) : 100;
    g.fillText(acc + '%', W - 12, 26);

    // combo counter with scale bounce
    if (combo >= 2 && state === 'play') {
      comboScale += (1 - comboScale) * Math.min(1, dt * 10);
      g.save();
      g.translate(W / 2, padTop + 56);
      g.scale(comboScale, comboScale);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 34px sans-serif';
      g.fillText(combo + 'x', 0, 0);
      var m = mult();
      if (m > 1) {
        g.fillStyle = C.accent;
        g.font = 'bold 14px sans-serif';
        g.fillText('×' + m, 0, 28);
      }
      g.restore();
    }

    beatPulse *= Math.exp(-dt * 7);
    screenPulse *= Math.exp(-dt * 5);
    for (i = 0; i < eqN; i++) eq[i] *= Math.exp(-dt * 5.5);

    // overlays ---------------------------------------------
    if (state === 'ready') {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.text;
      g.font = 'bold 26px sans-serif';
      g.fillText('🎹', W / 2, H / 2 - 78);
      g.fillText(RU ? 'РИТМ' : 'BEAT TAP', W / 2, H / 2 - 44);
      g.fillStyle = C.muted;
      g.font = '14px sans-serif';
      g.fillText(T_HINT, W / 2, H / 2 - 10);
      g.fillText(T_KEYS, W / 2, H / 2 + 14);
      var bl = 0.6 + 0.4 * Math.sin(performance.now() / 350);
      g.globalAlpha = bl;
      g.fillStyle = C.accent;
      g.font = 'bold 17px sans-serif';
      g.fillText(api.t('tap_to_start'), W / 2, H / 2 + 58);
      g.globalAlpha = 1;
    } else if (state === 'inter') {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 0, W, H);
      var pw = Math.min(300, W - 60), ph = 150;
      var px = (W - pw) / 2, py = (H - ph) / 2 - 30;
      g.fillStyle = C.panel;
      rr(px, py, pw, ph, 16); g.fill();
      g.strokeStyle = C.accent; g.lineWidth = 2;
      rr(px, py, pw, ph, 16); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = C.good;
      g.font = 'bold 20px sans-serif';
      g.fillText(T_CLEAR, W / 2, py + 32);
      g.fillStyle = C.text;
      g.font = '16px sans-serif';
      g.fillText(T_ACC + ': ' + lastAcc + '%', W / 2, py + 68);
      g.fillText(T_COMBO + ': ' + lastMaxCombo + 'x', W / 2, py + 94);
      g.fillStyle = C.muted;
      g.font = '13px sans-serif';
      g.fillText(T_STAGE + ' ' + (stage + 2) + '/3 →', W / 2, py + 124);
    }
  }

  // ---------- main loop ----------
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var dt = Math.min(0.05, (ts - lastFrame) / 1000) || 0.016;
    lastFrame = ts;
    if (paused) return;
    var now = getT();
    if (state === 'play' || state === 'inter') update(now);
    draw(now, dt);
  }

  // ---------- input ----------
  function onDown(e) {
    if (state === 'done' || paused) return;
    if (state === 'ready') { startGame(); return; }
    if (state !== 'play') return;
    var rect = container.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (y < cv.H * 0.45) return;
    var lane = Math.max(0, Math.min(LANES - 1, Math.floor(x / laneW)));
    judge(lane);
  }
  function onKey(e) {
    if (paused) return;
    var k = (e.key || '').toLowerCase();
    if (state === 'ready' && (k === ' ' || k === 'enter')) { startGame(); e.preventDefault(); return; }
    if (state !== 'play') return;
    if (KEYS.hasOwnProperty(k)) { judge(KEYS[k]); e.preventDefault(); }
  }
  container.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);

  raf = requestAnimationFrame(loop);
  sched = setInterval(schedTick, 25);

  return {
    destroy: function () {
      cancelAnimationFrame(raf);
      clearInterval(sched);
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      if (actx) { try { actx.close(); } catch (e) {} actx = null; }
      cv.destroy();
    },
    pause: function () {
      if (paused) return;
      paused = true;
      if (audioOK && actx) { try { actx.suspend(); } catch (e) {} }
      else pauseAt = performance.now();
    },
    resume: function () {
      if (!paused) return;
      paused = false;
      lastFrame = performance.now();
      if (audioOK && actx) {
        if (state === 'play') { try { actx.resume(); } catch (e) {} }
      } else silentBase += performance.now() - pauseAt;
    }
  };
});
})();
