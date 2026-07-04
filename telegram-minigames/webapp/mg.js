/* MG — tiny game SDK for the Mini Games platform.
   Games call MG.register(id, startFn). The shell (app.js) calls MG.start(id, container, shellHooks).
   Designed for low-end devices: no dependencies, capped DPR, pause on hidden tab. */
(function () {
  'use strict';

  var registry = {};
  var loaded = {};

  // Rough low-end detection: few cores, little RAM or old Android.
  var lowEnd = (function () {
    try {
      var mem = navigator.deviceMemory || 4;
      var cores = navigator.hardwareConcurrency || 4;
      var oldAndroid = /Android [4-7]\./.test(navigator.userAgent);
      return mem <= 2 || cores <= 2 || oldAndroid;
    } catch (e) { return false; }
  })();

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  var MG = {
    lowEnd: lowEnd,

    register: function (id, startFn) {
      registry[id] = startFn;
    },

    /* Load a game script once; resolves when its MG.register ran. */
    load: function (id) {
      if (registry[id]) return Promise.resolve();
      if (loaded[id]) return loaded[id];
      loaded[id] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'games/' + id + '/game.js?v=' + (window.MG_VERSION || '1');
        s.onload = function () {
          registry[id] ? resolve() : reject(new Error('game did not register: ' + id));
        };
        s.onerror = function () { delete loaded[id]; reject(new Error('failed to load ' + id)); };
        document.head.appendChild(s);
      });
      return loaded[id];
    },

    /* Start a game inside container. shell provides {t, lang, onScore, onGameOver, storageKey}. */
    start: function (id, container, shell) {
      var startFn = registry[id];
      if (!startFn) throw new Error('game not registered: ' + id);
      var destroyed = false;

      var api = {
        t: shell.t,
        lang: shell.lang,
        lowEnd: lowEnd,
        colors: {
          bg: cssVar('--bg', '#12141a'),
          panel: cssVar('--panel', '#1c1f28'),
          panel2: cssVar('--panel2', '#262a36'),
          text: cssVar('--text', '#e8eaf0'),
          muted: cssVar('--muted', '#8b90a0'),
          accent: cssVar('--accent', '#4ea1ff'),
          good: cssVar('--good', '#4caf7d'),
          bad: cssVar('--bad', '#e05a5a')
        },

        /* Canvas that fills the container, DPR-aware (capped for weak devices). */
        createCanvas: function () {
          var canvas = document.createElement('canvas');
          container.appendChild(canvas);
          var g = canvas.getContext('2d');
          var out = { canvas: canvas, g: g, W: 0, H: 0, dpr: 1, onResize: null };
          function fit() {
            var r = container.getBoundingClientRect();
            var dpr = lowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 2);
            out.W = Math.max(1, Math.round(r.width));
            out.H = Math.max(1, Math.round(r.height));
            out.dpr = dpr;
            canvas.width = out.W * dpr;
            canvas.height = out.H * dpr;
            canvas.style.width = out.W + 'px';
            canvas.style.height = out.H + 'px';
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (out.onResize) out.onResize(out.W, out.H);
          }
          fit();
          var t;
          out._rl = function () { clearTimeout(t); t = setTimeout(fit, 100); };
          window.addEventListener('resize', out._rl);
          out.destroy = function () { window.removeEventListener('resize', out._rl); };
          return out;
        },

        /* Swipe + tap detection. handler(dir) with dir in 'left|right|up|down|tap'. Returns unsubscribe. */
        swipe: function (el, handler) {
          var sx = 0, sy = 0, st = 0;
          function ts(e) {
            var p = e.touches ? e.touches[0] : e;
            sx = p.clientX; sy = p.clientY; st = Date.now();
          }
          function te(e) {
            var p = e.changedTouches ? e.changedTouches[0] : e;
            var dx = p.clientX - sx, dy = p.clientY - sy;
            var ax = Math.abs(dx), ay = Math.abs(dy);
            if (ax < 18 && ay < 18) { if (Date.now() - st < 350) handler('tap', p); return; }
            if (ax > ay) handler(dx > 0 ? 'right' : 'left', p);
            else handler(dy > 0 ? 'down' : 'up', p);
          }
          el.addEventListener('touchstart', ts, { passive: true });
          el.addEventListener('touchend', te, { passive: true });
          el.addEventListener('mousedown', ts);
          el.addEventListener('mouseup', te);
          return function () {
            el.removeEventListener('touchstart', ts);
            el.removeEventListener('touchend', te);
            el.removeEventListener('mousedown', ts);
            el.removeEventListener('mouseup', te);
          };
        },

        /* Live score shown in the header. */
        score: function (n) { if (!destroyed) shell.onScore(n); },

        /* End of round. Shell shows the game-over overlay and records the play. */
        gameOver: function (score, opts) { if (!destroyed) shell.onGameOver(score, opts || {}); },

        /* Per-game persistent state. */
        save: function (obj) {
          try { localStorage.setItem(shell.storageKey, JSON.stringify(obj)); } catch (e) {}
        },
        load: function () {
          try { return JSON.parse(localStorage.getItem(shell.storageKey)); } catch (e) { return null; }
        },
        best: function () { return shell.best(); },

        haptic: function (kind) {
          try {
            var h = window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback;
            if (!h) return;
            if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
            else h.impactOccurred(kind || 'light');
          } catch (e) {}
        }
      };

      var inst = startFn(container, api) || {};
      return {
        destroy: function () {
          destroyed = true;
          try { if (inst.destroy) inst.destroy(); } catch (e) {}
          container.innerHTML = '';
        },
        pause: function () { try { if (inst.pause) inst.pause(); } catch (e) {} },
        resume: function () { try { if (inst.resume) inst.resume(); } catch (e) {} }
      };
    }
  };

  window.MG = MG;
})();
