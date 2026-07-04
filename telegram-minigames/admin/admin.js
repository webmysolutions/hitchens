/* Mini Games — admin panel (vanilla JS SPA). */
(function () {
  'use strict';

  var $ = function (s, root) { return (root || document).querySelector(s); };
  var view = $('#view');
  var token = localStorage.getItem('mg_admin_token') || '';

  /* ---------- api ---------- */
  function api(method, path, body) {
    return fetch('/api/admin' + path, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { logout(); throw new Error('unauthorized'); }
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || r.status);
        return j;
      });
    });
  }

  function toast(msg, isError) {
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2500);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtDate(ts) { return ts ? new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function fmtNum(n) { return (n || 0).toLocaleString('ru-RU'); }

  /* ---------- tiny canvas line chart ---------- */
  function drawChart(canvas, seriesList, labels) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    var pad = { l: 40, r: 10, t: 14, b: 22 };
    var max = 1;
    seriesList.forEach(function (s) { s.data.forEach(function (v) { if (v > max) max = v; }); });
    max = Math.ceil(max * 1.1);
    var n = Math.max.apply(null, seriesList.map(function (s) { return s.data.length; }).concat([2]));
    var x = function (i) { return pad.l + (W - pad.l - pad.r) * (n === 1 ? 0.5 : i / (n - 1)); };
    var y = function (v) { return pad.t + (H - pad.t - pad.b) * (1 - v / max); };

    g.strokeStyle = 'rgba(140,145,160,.15)';
    g.fillStyle = '#8b90a0';
    g.font = '10px sans-serif';
    g.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var v = Math.round(max * i / 4);
      g.beginPath(); g.moveTo(pad.l, y(v)); g.lineTo(W - pad.r, y(v)); g.stroke();
      g.fillText(fmtNum(v), pad.l - 6, y(v) + 3);
    }
    if (labels && labels.length) {
      g.textAlign = 'center';
      var step = Math.ceil(labels.length / 6);
      for (var j = 0; j < labels.length; j += step) {
        g.fillText(labels[j].slice(5), x(j), H - 6);
      }
    }
    seriesList.forEach(function (s) {
      g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
      s.data.forEach(function (v, k) { k ? g.lineTo(x(k), y(v)) : g.moveTo(x(k), y(v)); });
      g.stroke();
    });
    // legend
    g.textAlign = 'left'; g.font = '11px sans-serif';
    var lx = pad.l;
    seriesList.forEach(function (s) {
      g.fillStyle = s.color; g.fillRect(lx, 2, 10, 3);
      g.fillStyle = '#8b90a0'; g.fillText(s.name, lx + 14, 8);
      lx += 14 + g.measureText(s.name).width + 16;
    });
  }

  /* Merge daily rows [{day, v}] onto a continuous day axis. */
  function dayAxis(days) {
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    }
    return out;
  }
  function onAxis(axis, rows, key) {
    var map = {};
    (rows || []).forEach(function (r) { map[r.day] = r[key || 'v']; });
    return axis.map(function (d) { return map[d] || 0; });
  }

  /* ---------- views ---------- */
  var views = {};

  views.dashboard = function () {
    view.innerHTML = '<h2>📊 Дашборд <span class="muted">за 30 дней</span></h2>' +
      '<div class="cards" id="cards"></div>' +
      '<div class="panel"><h3 style="margin-top:0">Активность</h3><canvas class="chart" id="chart-main"></canvas></div>' +
      '<div class="panel"><h3 style="margin-top:0">Топ игр</h3><div id="top-games"></div></div>';
    Promise.all([api('GET', '/stats/summary?days=30'), api('GET', '/stats/timeseries?days=30')])
      .then(function (r) {
        var s = r[0], ts = r[1];
        $('#cards').innerHTML =
          card('Всего игроков', fmtNum(s.totalUsers)) +
          card('Новых за 30 дней', fmtNum(s.newUsers)) +
          card('Активных за сутки', fmtNum(s.dau)) +
          card('Игровых сессий', fmtNum(s.plays)) +
          card('Средняя сессия', s.avgDuration + ' сек') +
          card('Открытий приложения', fmtNum(s.appOpens));
        var axis = dayAxis(30);
        drawChart($('#chart-main'), [
          { name: 'Сессии', color: '#4ea1ff', data: onAxis(axis, ts.plays) },
          { name: 'Активные игроки', color: '#4caf7d', data: onAxis(axis, ts.activeUsers) },
          { name: 'Новые игроки', color: '#e0a94e', data: onAxis(axis, ts.newUsers) }
        ], axis);
        $('#top-games').innerHTML = table(
          ['Игра', 'Сессий', 'Игроков'],
          s.topGames.map(function (t) { return [esc(t.game_id), fmtNum(t.plays), fmtNum(t.players)]; })
        );
      }).catch(function (e) { view.innerHTML += err(e); });
    function card(k, v) { return '<div class="card"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>'; }
  };

  views.games = function () {
    view.innerHTML = '<h2>🕹️ Игры</h2><div class="panel"><div id="games-list">Загрузка…</div>' +
      '<div class="note">Включение/выключение убирает игру из каталога. «⭐ Featured» поднимает игру наверх с подсветкой. «Приоритет» — больший показывается выше.</div></div>';
    api('GET', '/games').then(function (r) {
      var rows = r.games.map(function (g) {
        return '<tr data-id="' + g.id + '">' +
          '<td><span class="icon">' + g.icon + '</span>' + esc(g.name.ru || g.name.en) + ' <span class="muted">' + g.id + '</span></td>' +
          '<td>' + esc(g.cat) + '</td>' +
          '<td>' + fmtNum(g.plays30d) + '</td>' +
          '<td><label class="toggle"><input type="checkbox" class="g-enabled"' + (g.enabled ? ' checked' : '') + '><span></span></label></td>' +
          '<td><label class="toggle"><input type="checkbox" class="g-featured"' + (g.featured ? ' checked' : '') + '><span></span></label></td>' +
          '<td style="width:90px"><input type="number" class="g-sort" value="' + g.sort + '"></td>' +
          '</tr>';
      }).join('');
      $('#games-list').innerHTML =
        '<table><thead><tr><th>Игра</th><th>Категория</th><th>Сессий/30д</th><th>Вкл</th><th>⭐</th><th>Приоритет</th></tr></thead><tbody>' +
        rows + '</tbody></table>';
      $('#games-list').addEventListener('change', function (e) {
        var tr = e.target.closest('tr');
        if (!tr) return;
        api('PUT', '/games/' + tr.dataset.id, {
          enabled: $('.g-enabled', tr).checked,
          featured: $('.g-featured', tr).checked,
          sort: parseInt($('.g-sort', tr).value, 10) || 0
        }).then(function () { toast('Сохранено'); })
          .catch(function (e) { toast(e.message, true); });
      });
    }).catch(function (e) { view.innerHTML += err(e); });
  };

  views.stats = function () {
    view.innerHTML = '<h2>📈 Статистика по играм</h2>' +
      '<div class="panel"><div class="flex mb"><select id="stat-days" style="max-width:160px">' +
      '<option value="7">7 дней</option><option value="30" selected>30 дней</option><option value="90">90 дней</option>' +
      '</select><div class="spacer"></div></div><div id="stats-table">Загрузка…</div></div>' +
      '<div class="panel" id="game-detail" hidden><h3 id="gd-title" style="margin-top:0"></h3>' +
      '<canvas class="chart" id="gd-chart"></canvas><h3>Топ игроков</h3><div id="gd-top"></div></div>';

    function load() {
      var days = $('#stat-days').value;
      api('GET', '/stats/games?days=' + days).then(function (r) {
        $('#stats-table').innerHTML = r.games.length
          ? '<table><thead><tr><th>Игра</th><th>Сессий</th><th>Игроков</th><th>Ср. счёт</th><th>Рекорд</th><th>Ср. время</th><th></th></tr></thead><tbody>' +
            r.games.map(function (g) {
              return '<tr><td>' + esc(g.game_id) + '</td><td>' + fmtNum(g.plays) + '</td><td>' + fmtNum(g.players) +
                '</td><td>' + fmtNum(g.avgScore) + '</td><td>' + fmtNum(g.maxScore) + '</td><td>' + (g.avgDuration || 0) +
                ' с</td><td class="right"><button class="btn btn-sm" data-game="' + esc(g.game_id) + '">Детали</button></td></tr>';
            }).join('') + '</tbody></table>'
          : '<div class="muted">Пока нет данных — статистика появится после первых игровых сессий.</div>';
      });
    }
    $('#stat-days').onchange = load;
    view.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-game]');
      if (!b) return;
      var id = b.dataset.game;
      var days = $('#stat-days').value;
      api('GET', '/stats/game/' + id + '?days=' + days).then(function (r) {
        $('#game-detail').hidden = false;
        $('#gd-title').textContent = 'Игра: ' + id;
        var axis = dayAxis(parseInt(days, 10));
        drawChart($('#gd-chart'), [
          { name: 'Сессии', color: '#4ea1ff', data: onAxis(axis, r.daily, 'plays') },
          { name: 'Игроки', color: '#4caf7d', data: onAxis(axis, r.daily, 'players') }
        ], axis);
        $('#gd-top').innerHTML = table(['Игрок', 'Лучший счёт'],
          r.top.map(function (t) { return [esc(t.name), fmtNum(t.score)]; }));
        $('#game-detail').scrollIntoView({ behavior: 'smooth' });
      });
    });
    load();
  };

  views.banners = function () {
    view.innerHTML = '<h2>🖼️ Баннерная реклама</h2>' +
      '<div class="panel"><h3 style="margin-top:0" id="bform-title">Новый баннер</h3>' +
      '<input type="hidden" id="b-id">' +
      '<div class="row"><div><label>Название (для себя)</label><input id="b-name"></div>' +
      '<div><label>Размещение</label><select id="b-placement">' +
      '<option value="any">Везде</option><option value="catalog_top">Каталог — сверху</option>' +
      '<option value="catalog_bottom">Каталог — снизу</option><option value="game_over">Экран конца игры</option>' +
      '</select></div><div><label>Вес (частота показа)</label><input id="b-weight" type="number" value="1" min="1" max="100"></div></div>' +
      '<label>Текст баннера (необязательно, если есть картинка)</label><input id="b-text">' +
      '<div class="row"><div><label>URL картинки (необязательно)</label><input id="b-image" placeholder="https://…/banner.png"></div>' +
      '<div><label>Ссылка при клике</label><input id="b-target" placeholder="https://…"></div></div>' +
      '<div class="flex mt"><button class="btn btn-primary" id="b-save">Сохранить</button>' +
      '<button class="btn" id="b-cancel" hidden>Отмена</button></div>' +
      '<div class="note">Баннеры показываются в ротации по весу. Свои баннеры имеют приоритет над AdSense в том же слоте.</div></div>' +
      '<div class="panel"><h3 style="margin-top:0">Баннеры</h3><div id="banners-list">Загрузка…</div></div>';

    function load() {
      api('GET', '/banners').then(function (r) {
        $('#banners-list').innerHTML = r.banners.length
          ? '<table><thead><tr><th>Название</th><th>Размещение</th><th>Вес</th><th>Показы</th><th>Клики</th><th>CTR</th><th>Вкл</th><th></th></tr></thead><tbody>' +
            r.banners.map(function (b) {
              var ctr = b.stats.impressions ? (100 * b.stats.clicks / b.stats.impressions).toFixed(1) + '%' : '—';
              return '<tr data-id="' + b.id + '">' +
                '<td>' + esc(b.name) + '</td><td>' + esc(b.placement) + '</td><td>' + b.weight + '</td>' +
                '<td>' + fmtNum(b.stats.impressions) + '</td><td>' + fmtNum(b.stats.clicks) + '</td><td>' + ctr + '</td>' +
                '<td><label class="toggle"><input type="checkbox" class="b-active"' + (b.active ? ' checked' : '') + '><span></span></label></td>' +
                '<td class="right"><button class="btn btn-sm b-edit">✏️</button> <button class="btn btn-sm btn-danger b-del">🗑</button></td></tr>';
            }).join('') + '</tbody></table>'
          : '<div class="muted">Баннеров пока нет.</div>';
        $('#banners-list').dataset.json = JSON.stringify(r.banners);
      });
    }

    $('#b-save').onclick = function () {
      var id = $('#b-id').value;
      var body = {
        name: $('#b-name').value.trim(),
        text: $('#b-text').value.trim(),
        image_url: $('#b-image').value.trim(),
        target_url: $('#b-target').value.trim(),
        placement: $('#b-placement').value,
        weight: parseInt($('#b-weight').value, 10) || 1
      };
      if (!body.name) return toast('Укажите название', true);
      (id ? api('PUT', '/banners/' + id, body) : api('POST', '/banners', body))
        .then(function () { toast('Сохранено'); resetForm(); load(); })
        .catch(function (e) { toast(e.message, true); });
    };
    function resetForm() {
      $('#b-id').value = ''; $('#b-name').value = ''; $('#b-text').value = '';
      $('#b-image').value = ''; $('#b-target').value = ''; $('#b-weight').value = 1;
      $('#b-placement').value = 'any';
      $('#bform-title').textContent = 'Новый баннер';
      $('#b-cancel').hidden = true;
    }
    $('#b-cancel').onclick = resetForm;

    $('#banners-list').addEventListener('click', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return;
      var id = tr.dataset.id;
      if (e.target.closest('.b-del')) {
        if (!confirm('Удалить баннер?')) return;
        api('DELETE', '/banners/' + id).then(function () { toast('Удалено'); load(); });
      } else if (e.target.closest('.b-edit')) {
        var b = JSON.parse($('#banners-list').dataset.json).find(function (x) { return String(x.id) === id; });
        $('#b-id').value = b.id; $('#b-name').value = b.name || ''; $('#b-text').value = b.text || '';
        $('#b-image').value = b.image_url || ''; $('#b-target').value = b.target_url || '';
        $('#b-weight').value = b.weight; $('#b-placement').value = b.placement;
        $('#bform-title').textContent = 'Редактировать: ' + b.name;
        $('#b-cancel').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    $('#banners-list').addEventListener('change', function (e) {
      var tr = e.target.closest('tr');
      if (!tr || !e.target.classList.contains('b-active')) return;
      api('PUT', '/banners/' + tr.dataset.id, { active: e.target.checked })
        .then(function () { toast('Сохранено'); });
    });
    load();
  };

  views.adsense = function () {
    view.innerHTML = '<h2>💵 Google AdSense</h2><div class="panel">' +
      '<div class="flex"><h3 style="margin:0">Статус</h3><span id="ads-badge" class="badge">…</span></div>' +
      '<label>Client ID (ca-pub-…)</label><input id="ads-client" placeholder="ca-pub-XXXXXXXXXXXXXXXX">' +
      '<div class="row">' +
      '<div><label>Slot: каталог сверху</label><input id="ads-slot-top" placeholder="1234567890"></div>' +
      '<div><label>Slot: каталог снизу</label><input id="ads-slot-bottom" placeholder="1234567890"></div>' +
      '<div><label>Slot: конец игры</label><input id="ads-slot-over" placeholder="1234567890"></div></div>' +
      '<div class="flex mt"><label class="toggle"><input type="checkbox" id="ads-enabled"><span></span></label>' +
      '<span>Включить AdSense</span><div class="spacer"></div>' +
      '<button class="btn btn-primary" id="ads-save">Сохранить</button></div>' +
      '<div class="note">ID и слоты можно вставить позже — поля пустые не ломают приложение. ' +
      'Свои баннеры всегда в приоритете; AdSense заполняет слот, когда для него нет баннера. ' +
      'Помните: AdSense внутри Telegram WebView работает не для всех гео/аккаунтов — проверьте политику AdSense для WebView.</div></div>';
    api('GET', '/adsense').then(function (r) {
      $('#ads-client').value = r.client || '';
      $('#ads-enabled').checked = r.enabled;
      $('#ads-slot-top').value = r.slots.catalog_top || '';
      $('#ads-slot-bottom').value = r.slots.catalog_bottom || '';
      $('#ads-slot-over').value = r.slots.game_over || '';
      badge(r.enabled && r.client);
    });
    function badge(on) {
      var b = $('#ads-badge');
      b.className = 'badge ' + (on ? 'on' : 'off');
      b.textContent = on ? 'активен' : 'выключен';
    }
    $('#ads-save').onclick = function () {
      api('PUT', '/adsense', {
        client: $('#ads-client').value.trim(),
        enabled: $('#ads-enabled').checked,
        slots: {
          catalog_top: $('#ads-slot-top').value.trim(),
          catalog_bottom: $('#ads-slot-bottom').value.trim(),
          game_over: $('#ads-slot-over').value.trim()
        }
      }).then(function () { toast('Сохранено'); badge($('#ads-enabled').checked && $('#ads-client').value.trim()); })
        .catch(function (e) { toast(e.message, true); });
    };
  };

  views.bot = function () {
    view.innerHTML = '<h2>🤖 Telegram-бот</h2>' +
      '<div class="panel"><div class="flex"><h3 style="margin:0">Статус</h3><span id="bot-badge" class="badge">…</span>' +
      '<span id="bot-name" class="muted"></span><div class="spacer"></div>' +
      '<button class="btn btn-sm" id="bot-start">▶ Запустить</button>' +
      '<button class="btn btn-sm" id="bot-stop">⏸ Остановить</button></div>' +
      '<div id="bot-error" class="err mt" hidden></div>' +
      '<label>Токен бота (из @BotFather)</label><input id="bot-token" type="password" placeholder="1234567890:AA…">' +
      '<label>URL мини-приложения (https)</label><input id="bot-url" placeholder="https://games.example.com">' +
      '<label>Текст кнопки</label><input id="bot-btn-text" placeholder="🎮 Играть">' +
      '<label>Приветствие /start (RU)</label><textarea id="bot-welcome-ru"></textarea>' +
      '<label>Приветствие /start (EN)</label><textarea id="bot-welcome-en"></textarea>' +
      '<div class="right mt"><button class="btn btn-primary" id="bot-save">Сохранить и перезапустить</button></div>' +
      '<div class="note">Токен появится позже — платформа полностью работает и без него (demo-режим). ' +
      'Когда вставите токен, бот сам начнёт получать /start и выставит кнопку меню с мини-приложением.</div></div>' +
      '<div class="panel"><h3 style="margin-top:0">Рассылка</h3>' +
      '<textarea id="bc-text" placeholder="Текст сообщения всем игрокам…"></textarea>' +
      '<div class="flex mt"><div id="bc-status" class="muted"></div><div class="spacer"></div>' +
      '<button class="btn" id="bc-cancel" hidden>Отменить</button>' +
      '<button class="btn btn-primary" id="bc-send">Отправить всем</button></div></div>';

    var bcTimer = null;
    function load() {
      api('GET', '/bot/status').then(function (s) {
        var b = $('#bot-badge');
        b.className = 'badge ' + (s.running ? 'on' : 'off');
        b.textContent = s.configured ? (s.running ? 'работает' : 'остановлен') : 'нет токена (demo)';
        $('#bot-name').textContent = s.bot ? '@' + s.bot.username : '';
        $('#bot-error').hidden = !s.lastError;
        $('#bot-error').textContent = s.lastError ? 'Ошибка: ' + s.lastError : '';
        if (!$('#bot-url').value) $('#bot-url').value = s.webappUrl || '';
        if (!$('#bot-btn-text').value) $('#bot-btn-text').value = s.button_text || '';
        if (!$('#bot-welcome-ru').value) $('#bot-welcome-ru').value = s.welcome_ru || '';
        if (!$('#bot-welcome-en').value) $('#bot-welcome-en').value = s.welcome_en || '';
        bcStatus(s.broadcast);
      });
    }
    function bcStatus(b) {
      if (!b) return;
      if (b.active) {
        $('#bc-status').textContent = 'Отправлено ' + b.sent + ' из ' + b.total + (b.failed ? ' (ошибок: ' + b.failed + ')' : '');
        $('#bc-cancel').hidden = false;
        if (!bcTimer) bcTimer = setInterval(function () { api('GET', '/bot/broadcast').then(bcStatus); }, 2000);
      } else {
        $('#bc-cancel').hidden = true;
        if (bcTimer) { clearInterval(bcTimer); bcTimer = null; }
        $('#bc-status').textContent = b.total
          ? 'Последняя рассылка: ' + b.sent + '/' + b.total + (b.failed ? ', ошибок ' + b.failed : '')
          : '';
      }
    }
    $('#bot-save').onclick = function () {
      var body = {
        webapp_url: $('#bot-url').value.trim(),
        button_text: $('#bot-btn-text').value.trim(),
        welcome_ru: $('#bot-welcome-ru').value,
        welcome_en: $('#bot-welcome-en').value
      };
      var tk = $('#bot-token').value.trim();
      if (tk) body.token = tk;
      api('PUT', '/bot/settings', body).then(function () {
        toast('Сохранено'); $('#bot-token').value = ''; load();
      }).catch(function (e) { toast(e.message, true); });
    };
    $('#bot-start').onclick = function () { api('POST', '/bot/start').then(load); };
    $('#bot-stop').onclick = function () { api('POST', '/bot/stop').then(load); };
    $('#bc-send').onclick = function () {
      var text = $('#bc-text').value.trim();
      if (!text) return toast('Введите текст', true);
      if (!confirm('Отправить сообщение всем игрокам?')) return;
      api('POST', '/bot/broadcast', { text: text })
        .then(function (b) { toast('Рассылка запущена'); bcStatus(b); })
        .catch(function (e) { toast(e.message, true); });
    };
    $('#bc-cancel').onclick = function () { api('POST', '/bot/broadcast/cancel').then(bcStatus); };
    load();
  };

  views.users = function () {
    view.innerHTML = '<h2>👥 Игроки</h2><div class="panel"><div id="users-list">Загрузка…</div></div>';
    api('GET', '/users?limit=100').then(function (r) {
      $('#users-list').innerHTML = r.users.length
        ? table(['Имя', 'Username', 'Язык', 'Сессий', 'Первый визит', 'Последний визит'],
            r.users.map(function (u) {
              return [esc(u.first_name || '—'), u.username ? '@' + esc(u.username) : '—',
                esc(u.lang || '—'), fmtNum(u.plays), fmtDate(u.first_seen), fmtDate(u.last_seen)];
            }))
        : '<div class="muted">Игроков пока нет. Они появятся, когда люди начнут открывать мини-приложение через бота.</div>';
    });
  };

  views.settings = function () {
    view.innerHTML = '<h2>⚙️ Настройки</h2>' +
      '<div class="panel"><h3 style="margin-top:0">Смена пароля админки</h3>' +
      '<label>Новый пароль</label><input id="new-pass" type="password">' +
      '<div class="right mt"><button class="btn btn-primary" id="save-pass">Сменить</button></div></div>';
    $('#save-pass').onclick = function () {
      var p = $('#new-pass').value;
      if (p.length < 4) return toast('Минимум 4 символа', true);
      api('PUT', '/password', { password: p }).then(function () {
        toast('Пароль изменён'); $('#new-pass').value = '';
      }).catch(function (e) { toast(e.message, true); });
    };
  };

  function table(headers, rows) {
    return '<table><thead><tr>' + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function err(e) { return '<div class="err">Ошибка: ' + esc(e.message) + '</div>'; }

  /* ---------- navigation / auth ---------- */
  function show(name) {
    document.querySelectorAll('.nav-btn[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    views[name]();
  }

  $('#nav').addEventListener('click', function (e) {
    var b = e.target.closest('.nav-btn[data-view]');
    if (b) show(b.dataset.view);
  });

  function logout() {
    if (token) fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(function () {});
    token = '';
    localStorage.removeItem('mg_admin_token');
    $('#app').hidden = true;
    $('#login-screen').hidden = false;
  }
  $('#btn-logout').onclick = logout;

  $('#login-form').onsubmit = function (e) {
    e.preventDefault();
    fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('#login-pass').value })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        token = j.token;
        localStorage.setItem('mg_admin_token', token);
        $('#login-screen').hidden = true;
        $('#app').hidden = false;
        show('dashboard');
      })
      .catch(function () { $('#login-error').hidden = false; });
  };

  if (token) {
    // Validate stored token with a cheap call
    api('GET', '/stats/summary?days=1').then(function () {
      $('#app').hidden = false;
      show('dashboard');
    }).catch(function () { /* logout() already ran on 401 */ });
    $('#login-screen').hidden = true;
  } else {
    $('#login-screen').hidden = false;
  }
})();
