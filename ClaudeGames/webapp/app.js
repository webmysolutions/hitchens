/* Mini Games — shell application.
   Runs inside Telegram Mini App or a plain mobile browser (demo mode).
   Everything is optional-server: if /api/* is unreachable the app still works
   from static files with localStorage only. */
(function () {
  'use strict';

  window.MG_VERSION = '2';
  var tg = window.Telegram && window.Telegram.WebApp;
  var API = ''; // same origin

  /* ---------- state ---------- */
  var state = {
    lang: null,
    dict: {},
    catalog: { categories: [], games: [] },
    config: { banners: [], adsense: null },
    cat: 'all',
    query: '',
    current: null,       // current game id
    inst: null,          // running game instance
    lastScore: 0,
    sessionId: null,
    playStart: 0
  };

  var $ = function (sel) { return document.querySelector(sel); };

  /* ---------- i18n ---------- */
  var FALLBACK_LANGS = ['ru', 'en'];
  function detectLang() {
    var saved = lsGet('mg_lang');
    if (saved) return saved;
    var c = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) ||
            (navigator.language || 'en').slice(0, 2);
    return FALLBACK_LANGS.indexOf(c) >= 0 ? c : 'en';
  }
  function t(key) { return state.dict[key] || key; }
  function loadLang(lang) {
    return fetch('i18n/' + lang + '.json?v=' + window.MG_VERSION)
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return {}; })
      .then(function (dict) {
        state.lang = lang;
        state.dict = dict;
        lsSet('mg_lang', lang);
        applyI18n();
      });
  }
  function applyI18n() {
    document.querySelectorAll('[data-t]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-t'));
    });
    $('#search').placeholder = t('search');
    $('#footer-note').textContent = t('offline_note');
    document.documentElement.lang = state.lang;
  }

  /* ---------- storage helpers ---------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function bestKey(id) { return 'mg_best_' + id; }
  function getBest(id) { return parseInt(lsGet(bestKey(id)) || '0', 10) || 0; }
  function setBest(id, v) { lsSet(bestKey(id), String(v)); }

  /* ---------- analytics (fire-and-forget, batched) ---------- */
  var evQueue = [];
  var evTimer = null;
  function track(type, data) {
    evQueue.push({ type: type, data: data || {}, ts: Date.now() });
    if (!evTimer) evTimer = setTimeout(flushEvents, 3000);
  }
  function flushEvents(useBeacon) {
    clearTimeout(evTimer); evTimer = null;
    if (!evQueue.length) return;
    var payload = JSON.stringify({
      initData: (tg && tg.initData) || '',
      lang: state.lang,
      events: evQueue.splice(0, evQueue.length)
    });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(API + '/api/track', new Blob([payload], { type: 'application/json' }));
      } else {
        fetch(API + '/api/track', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true
        }).catch(function () {});
      }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushEvents(true);
      if (state.inst) state.inst.pause();
    } else if (state.inst) state.inst.resume();
  });

  /* ---------- catalog ---------- */
  function loadCatalog() {
    // Server catalog reflects admin toggles/order; static file is the offline fallback.
    return fetch(API + '/api/games')
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () {
        return fetch('games/catalog.json?v=' + window.MG_VERSION).then(function (r) { return r.json(); });
      })
      .then(function (cat) { state.catalog = cat; });
  }
  function gameById(id) {
    for (var i = 0; i < state.catalog.games.length; i++)
      if (state.catalog.games[i].id === id) return state.catalog.games[i];
    return null;
  }
  function gname(g) { return g.name[state.lang] || g.name.en || g.id; }

  function renderCats() {
    var el = $('#cats');
    el.innerHTML = '';
    var cats = ['all'].concat(state.catalog.categories);
    cats.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'cat' + (state.cat === c ? ' active' : '');
      b.textContent = t('cat_' + c);
      b.onclick = function () { state.cat = c; renderCats(); renderGrid(); };
      el.appendChild(b);
    });
  }

  function renderGrid() {
    var el = $('#grid');
    el.innerHTML = '';
    var q = state.query.toLowerCase();
    var shown = 0;
    state.catalog.games.forEach(function (g) {
      if (g.enabled === false) return;
      if (state.cat !== 'all' && g.cat !== state.cat) return;
      if (q && gname(g).toLowerCase().indexOf(q) < 0 && g.id.indexOf(q) < 0) return;
      var b = document.createElement('button');
      b.className = 'tile' + (g.featured ? ' featured' : '');
      var best = getBest(g.id);
      b.innerHTML = '<span class="t-icon">' + g.icon + '</span>' +
        '<span class="t-name"></span>' +
        (best ? '<span class="t-best">' + t('best') + ': ' + best + '</span>' : '');
      b.querySelector('.t-name').textContent = gname(g);
      b.onclick = function () { openGame(g.id); };
      el.appendChild(b);
      shown++;
    });
    if (!shown) {
      var d = document.createElement('div');
      d.className = 'grid-empty';
      d.textContent = t('nothing_found');
      el.appendChild(d);
    }
  }

  /* ---------- game lifecycle ---------- */
  function openGame(id) {
    var g = gameById(id);
    if (!g) return;
    state.current = id;
    $('#game-title').textContent = gname(g);
    $('#live-score').textContent = '0';
    $('#screen-catalog').hidden = true;
    $('#screen-game').hidden = false;
    $('#modal-over').hidden = true;
    if (tg && tg.BackButton) { try { tg.BackButton.show(); } catch (e) {} }
    track('game_open', { game: id });
    state.playStart = Date.now();

    MG.load(id).then(function () {
      startInstance(id);
    }).catch(function (err) {
      $('#game-container').innerHTML =
        '<div class="mg-center"><div style="font-size:40px">😕</div><div>' + (err && err.message || 'error') + '</div></div>';
    });
  }

  function startInstance(id) {
    stopInstance();
    var container = $('#game-container');
    container.innerHTML = '';
    state.lastScore = 0;
    state.playStart = Date.now();
    state.inst = MG.start(id, container, {
      t: t,
      lang: state.lang,
      storageKey: 'mg_save_' + id,
      best: function () { return getBest(id); },
      onScore: function (n) {
        state.lastScore = n;
        $('#live-score').textContent = String(n);
      },
      onGameOver: function (score, opts) { onGameOver(id, score, opts); }
    });
  }

  function stopInstance() {
    if (state.inst) { state.inst.destroy(); state.inst = null; }
  }

  function onGameOver(id, score, opts) {
    score = Math.max(0, Math.round(score || 0));
    state.lastScore = score;
    var best = getBest(id);
    var record = score > best;
    if (record) { setBest(id, score); best = score; }
    var duration = Math.round((Date.now() - state.playStart) / 1000);

    $('#over-emoji').textContent = opts.win === true ? '🏆' : (opts.win === false ? '💥' : '🏁');
    $('#over-title').textContent = opts.win === true ? t('you_win') : (opts.win === false ? t('you_lose') : (opts.draw ? t('draw') : t('game_over')));
    $('#over-score').textContent = String(score);
    $('#over-best').textContent = String(best);
    $('#over-record').hidden = !record;
    $('#modal-over').hidden = false;
    renderAd('game_over', $('#ad-gameover'));

    track('game_over', { game: id, score: score, duration: duration, win: opts.win });
    flushEvents();
    submitScore(id, score, duration);
  }

  function submitScore(id, score, duration) {
    try {
      fetch(API + '/api/score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: (tg && tg.initData) || '', game: id, score: score, duration: duration })
      }).catch(function () {});
    } catch (e) {}
  }

  function exitGame() {
    var id = state.current;
    if (id) track('game_close', { game: id, duration: Math.round((Date.now() - state.playStart) / 1000) });
    stopInstance();
    state.current = null;
    $('#modal-over').hidden = true;
    $('#screen-game').hidden = true;
    $('#screen-catalog').hidden = false;
    if (tg && tg.BackButton) { try { tg.BackButton.hide(); } catch (e) {} }
    renderGrid(); // refresh best scores
    flushEvents();
  }

  /* ---------- ads ---------- */
  function loadConfig() {
    return fetch(API + '/api/config')
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .catch(function () { return { banners: [], adsense: null }; })
      .then(function (cfg) { state.config = cfg; });
  }

  function pickBanner(placement) {
    var list = (state.config.banners || []).filter(function (b) {
      return b.placement === placement || b.placement === 'any';
    });
    if (!list.length) return null;
    var total = 0;
    list.forEach(function (b) { total += (b.weight || 1); });
    var r = Math.random() * total;
    for (var i = 0; i < list.length; i++) {
      r -= (list[i].weight || 1);
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function renderAd(placement, slot) {
    if (!slot) return;
    slot.innerHTML = '';
    slot.hidden = true;

    // Own banners take priority; AdSense fills the slot when configured and no banner matches.
    var b = pickBanner(placement);
    if (b) {
      var a = document.createElement('a');
      a.className = 'ad-banner';
      a.href = b.target_url || '#';
      a.onclick = function (ev) {
        ev.preventDefault();
        track('ad_click', { banner: b.id, placement: placement });
        flushEvents();
        if (b.target_url) {
          if (tg && tg.openLink) tg.openLink(b.target_url); else window.open(b.target_url, '_blank');
        }
      };
      if (b.image_url) {
        var img = document.createElement('img');
        img.src = b.image_url; img.alt = b.name || '';
        img.loading = 'lazy';
        a.appendChild(img);
      }
      if (b.text) {
        var d = document.createElement('div');
        d.className = 'ad-text'; d.textContent = b.text;
        a.appendChild(d);
      }
      var mark = document.createElement('span');
      mark.className = 'ad-mark'; mark.textContent = t('ad');
      a.appendChild(mark);
      slot.appendChild(a);
      slot.hidden = false;
      track('ad_impression', { banner: b.id, placement: placement });
      return;
    }

    var ads = state.config.adsense;
    if (ads && ads.client && ads.enabled && ads.slots && ads.slots[placement]) {
      ensureAdsense(ads.client);
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', ads.client);
      ins.setAttribute('data-ad-slot', ads.slots[placement]);
      ins.setAttribute('data-ad-format', 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      slot.appendChild(ins);
      slot.hidden = false;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    }
  }

  var adsenseLoaded = false;
  function ensureAdsense(client) {
    if (adsenseLoaded) return;
    adsenseLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }

  /* ---------- language modal ---------- */
  var LANGS = [
    { code: 'ru', label: 'Русский' },
    { code: 'en', label: 'English' }
  ];
  function openLangModal() {
    var list = $('#lang-list');
    list.innerHTML = '';
    LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'btn' + (l.code === state.lang ? ' btn-primary' : '');
      b.textContent = l.label;
      b.onclick = function () {
        $('#modal-lang').hidden = true;
        loadLang(l.code).then(function () { renderCats(); renderGrid(); });
        track('lang_change', { lang: l.code });
      };
      list.appendChild(b);
    });
    $('#modal-lang').hidden = false;
  }

  /* ---------- telegram theme ---------- */
  function applyTelegramTheme() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      var p = tg.themeParams || {};
      var root = document.documentElement.style;
      if (p.bg_color) root.setProperty('--bg', p.bg_color);
      if (p.secondary_bg_color) root.setProperty('--panel', p.secondary_bg_color);
      if (p.text_color) root.setProperty('--text', p.text_color);
      if (p.hint_color) root.setProperty('--muted', p.hint_color);
      if (p.button_color) root.setProperty('--accent', p.button_color);
      tg.BackButton.onClick(function () {
        if (state.current) exitGame(); else { try { tg.close(); } catch (e) {} }
      });
      try { tg.disableVerticalSwipes(); } catch (e) {}
    } catch (e) {}
  }

  /* ---------- init ---------- */
  function bindUI() {
    $('#btn-back').onclick = exitGame;
    $('#btn-exit').onclick = exitGame;
    $('#btn-restart').onclick = function () {
      $('#modal-over').hidden = true;
      track('game_restart', { game: state.current });
      startInstance(state.current);
    };
    $('#btn-lang').onclick = openLangModal;
    $('#modal-lang').onclick = function (e) { if (e.target === this) this.hidden = true; };
    $('#search').oninput = function () { state.query = this.value.trim(); renderGrid(); };
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    try { navigator.serviceWorker.register('sw.js'); } catch (e) {}
  }

  applyTelegramTheme();
  bindUI();
  loadLang(detectLang())
    .then(function () { return Promise.all([loadCatalog(), loadConfig()]); })
    .then(function () {
      renderCats();
      renderGrid();
      renderAd('catalog_top', $('#ad-top'));
      renderAd('catalog_bottom', $('#ad-bottom'));
      track('app_open', {
        platform: (tg && tg.platform) || 'browser',
        lowEnd: MG.lowEnd
      });
      registerSW();

      // Deep link: t.me/bot/app?startapp=<gameid> or plain ?game=<gameid>
      var start = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) ||
        new URLSearchParams(location.search).get('game') || '';
      if (start && gameById(start)) openGame(start);
    });
})();
