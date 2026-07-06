# HANDOVER — передаточный документ по платформе Telegram Mini Games

Документ для агента/разработчика, который продолжит работу. Здесь описано, что
сделано, как всё устроено, где лежит каждый кусок кода и как это проверить.

---

## 1. Общая картина

**Что это:** игровая платформа — Telegram Mini App со 106 браузерными
мини-играми + Node.js-сервер + Telegram-бот + админ-панель (игры, детальная
статистика, управление ботом, баннерная реклама, Google AdSense).

**Целевая аудитория:** пользователи из небогатых стран со слабыми телефонами и
медленным интернетом. Отсюда ключевые решения: никаких фреймворков, ноль
внешних ассетов (вся графика рисуется кодом/эмодзи), ленивая загрузка игр по
одной, service worker для офлайна, детект слабых устройств.

**Где код:** репозиторий `webmysolutions/hitchens`, ветка
`claude/telegram-minigames-app-uzfypa`, всё лежит в папке
**`ClaudeGames/`** в корне репозитория. Остальное содержимое репозитория
(Jekyll-тема Hitchens) к проекту отношения не имеет — не трогать.
На локальной машине владельца проект живёт в `~/ClaudeGames` (`/Users/ihor/ClaudeGames`).

**Статус:** все 106 игр реализованы; каждая проходила `node --check` и
Playwright-смоук-тест (загрузка в Chromium 390×780, тап + клавиши, ноль
`pageerror`) — последний полный прогон: **106/106 passed**. Сервер, API,
админка и demo-режим проверены вручную через curl и скриншоты.

**Чего пока нет (сознательно):** токена бота, ID AdSense, боевого сервера —
владелец добавит позже. Платформа полностью работает без них в demo-режиме.

---

## 2. Структура каталогов

```
ClaudeGames/
├── package.json           # deps: express, better-sqlite3; npm start
├── .env.example           # PORT, BOT_TOKEN, WEBAPP_URL, ADMIN_PASSWORD, ADSENSE_CLIENT, DB_PATH
├── .gitignore             # node_modules/, data/, .env
├── README.md              # обзор, запуск, полная таблица 106 игр
│
├── webapp/                # ═══ МИНИ-ПРИЛОЖЕНИЕ (то, что видит игрок) ═══
│   ├── index.html         # оболочка: каталог, экран игры, модалки (game over, язык)
│   ├── styles.css         # все стили; тема через CSS-переменные (--bg, --accent…)
│   ├── app.js             # логика оболочки: каталог, i18n, запуск игр, статистика,
│   │                      #   реклама, Telegram WebApp API, deep-links (?game=id и startapp)
│   ├── mg.js              # SDK игр (window.MG): register/load/start, createCanvas
│   │                      #   (DPR-aware), swipe, score, gameOver, save/load, haptic, lowEnd
│   ├── sw.js              # service worker: cache-first статика, network-only /api/*
│   │                      #   ВАЖНО: при изменении статики поднять VERSION ('mg-v2' → 'mg-v3')
│   │                      #   и window.MG_VERSION в app.js
│   ├── i18n/
│   │   ├── ru.json, en.json   # переводы оболочки; новый язык = новый JSON +
│   │   │                      #   добавить в массив LANGS в app.js
│   └── games/
│       ├── catalog.json   # ЕДИНЫЙ РЕЕСТР всех 106 игр: id, категория, иконка,
│       │                  #   name/desc на ru+en. Категории: arcade, puzzle, board,
│       │                  #   cards, word, racing, sport, sim, strategy, casual
│       └── <id>/game.js   # 106 папок — ОДНА игра = ОДИН файл game.js, без ассетов
│
├── server/                # ═══ СЕРВЕР (Node.js ≥18, Express) ═══
│   ├── index.js           # входная точка: статика (webapp на /, admin на /admin), API, запуск бота
│   ├── env.js             # мини-загрузчик .env (без dotenv)
│   ├── db.js              # SQLite (better-sqlite3), схема, settings, upsertUser, banner_stats
│   ├── telegram-auth.js   # HMAC-проверка initData; без токена = demo-режим (анонимно можно)
│   ├── api.js             # публичное API (см. §5)
│   ├── admin.js           # админ-API (Bearer-токен; см. §5)
│   └── bot.js             # бот на raw Bot API (fetch + long polling), /start с кнопкой
│                          #   Mini App, menu button, рассылка с прогрессом; без токена спит
│
├── admin/                 # ═══ АДМИНКА (vanilla JS SPA, RU-интерфейс) ═══
│   ├── index.html         # логин + разделы: Дашборд, Игры, Статистика, Баннеры,
│   ├── admin.css          #   AdSense, Бот, Игроки, Настройки
│   └── admin.js           # вся логика + самописные canvas-графики (drawChart)
│
└── docs/
    ├── GAME_API.md        # ★ КОНТРАКТ ИГРЫ — читать первым при работе с играми
    └── HANDOVER.md        # этот файл
```

---

## 3. Как устроены игры (главное для доработок)

Контракт полностью описан в **`docs/GAME_API.md`**; эталонная реализация —
**`webapp/games/snake/game.js`** (читать оба перед любой работой с играми).

Кратко:
- Игра — самрегистрирующийся классический скрипт (не ES-модуль):
  `MG.register('<id>', function (container, api) { ... return {destroy, pause, resume}; })`.
  `<id>` обязан совпадать с id в `catalog.json`.
- `api` даёт: `t()` (i18n), `lang`, `lowEnd`, `colors` (палитра темы),
  `createCanvas()`, `swipe()`, `score(n)`, `gameOver(score, {win/draw})`,
  `save()/load()` (localStorage на игру), `best()`, `haptic()`.
- Оболочка сама рисует экран Game Over, шапку со счётом, ведёт рекорды и
  отправляет статистику — игре это делать НЕ нужно.
- `destroy()` обязан снимать rAF/таймеры/слушатели — иначе утечки при выходе.
- Бюджеты: обычная игра ≤ ~25 КБ, премиум ≤ ~50 КБ. Никаких внешних ресурсов.

**Добавить новую игру:** создать `webapp/games/<id>/game.js` по контракту +
одну запись в `catalog.json`. Всё — она появится в каталоге и в админке.

**Категории игр** (10): состав каждой перечислен в README.md (таблица) и в
`catalog.json`. 12 «премиум»-игр с расширенной графикой/генерацией:
orbit, deepsea, lumen, flow, words, solitaire, durak, kingdom, defense,
dungeon, atc, rhythm.

**Особенности отдельных игр:**
- `chess` — полный движок (0x88, рокировки, эн-пассан, паты/маты), прошёл
  perft(1..5) от начальной позиции; negamax depth 3 (2 на lowEnd). Движок
  экспортируется через `module.exports` для node-тестов.
- `unblock` — 12 уровней сгенерированы и проверены BFS-солвером (оптимум
  5→19 ходов); массивы `LEVELS`/`OPT` в начале файла.
- `lumen`, `flow`, `pipes`, `takuzu`, `mahjong` — процедурная генерация с
  ГАРАНТИЕЙ решаемости (конструированием от решения); менять генераторы
  осторожно, ломается гарантия.
- `words`, `hangman`, `wordsearch`, `anagrams`, `quizflags`, `quizcapitals`,
  `truefalse` — словари/данные ВШИТЫ в начало файла (константы DICT/WORDS/DATA);
  расширять — просто дописать слова, формат очевиден.
- `rhythm` — музыка синтезируется WebAudio (lookahead-scheduler);
  AudioContext создаётся лениво по первому тапу; есть беззвучный fallback.
- Симуляторы (`tycoon`, `farm`, `mining`, `clicker`, `petcare`) — персистентные,
  офлайн-начисления капятся 8 часами, у всех кнопка «cash out» → gameOver.
- Игры сами тестируемы в node: многие экспортируют ядро через
  `typeof module !== 'undefined'` — паттерн виден в chess/unblock/words.

---

## 4. Сервер и БД

Запуск: `cd ClaudeGames && npm install && npm start` → порт 3000
(приложение `/`, админка `/admin`, пароль по умолчанию `admin`).

**SQLite** (файл `data/minigames.db`, создаётся автоматически; WAL). Таблицы
(`server/db.js`): `users` (tg_id, имя, язык, first/last_seen, blocked),
`plays` (user_id, game_id, score, duration, ts — источник всей игровой
статистики), `events` (сырые события: app_open, game_open, ad_click…),
`game_overrides` (enabled/featured/sort для каталога), `settings` (key-value:
bot_token, webapp_url, bot_welcome_ru/en, bot_button_text, adsense_client,
adsense_enabled, adsense_slots, admin_password), `banners`, `banner_stats`
(показы/клики по дням), `admin_sessions`.

**Настройки читаются так:** значение из таблицы `settings` перекрывает
переменную из `.env`. Токен бота можно вставить в админке на лету — бот
перезапустится без рестарта сервера.

**Аутентификация Telegram:** `telegram-auth.js` — HMAC initData по спецификации
(secret = HMAC('WebAppData', token)), протухание 24 ч. Если токена нет —
demo-режим: initData принимается без проверки, пустой initData = анонимный
пользователь (события пишутся с user_id NULL, в лидерборды не попадают).

---

## 5. API (все маршруты)

Публичное (`server/api.js`):
| Метод | Путь | Что делает |
|---|---|---|
| GET | `/api/games` | каталог + overrides админки (выключенные скрыты, featured первыми) |
| GET | `/api/config` | активные баннеры (по окну дат) + настройки AdSense |
| POST | `/api/track` | пачка событий `{initData, lang, events:[{type,data,ts}]}`; ad_impression/ad_click инкрементят banner_stats |
| POST | `/api/score` | завершённая партия `{initData, game, score, duration}` → plays |
| GET | `/api/leaderboard/:game` | топ-10 за 30 дней |
| GET | `/api/health` | ok |

Админ (`server/admin.js`), всё под `Authorization: Bearer <token>` после
`POST /api/admin/login {password}`:
`/games` GET/PUT — управление каталогом; `/stats/summary`, `/stats/timeseries`,
`/stats/games`, `/stats/game/:id` — статистика (параметр `?days=`);
`/users` — игроки; `/banners` CRUD + `/banners/:id/stats`; `/adsense` GET/PUT;
`/bot/status`, `/bot/settings` PUT (token, webapp_url, welcome_ru/en,
button_text), `/bot/start|stop`, `/bot/broadcast` POST/GET/cancel;
`/password` PUT; `/logout`.

---

## 6. Реклама

- **Свои баннеры:** создаются в админке (текст и/или картинка по URL, ссылка,
  слот, вес ротации, вкл/выкл, окно дат). Слоты: `catalog_top`,
  `catalog_bottom`, `game_over`, `any`. Показы/клики/CTR считаются по дням.
- **AdSense:** в админке вводится client id (`ca-pub-…`) + slot id на каждый
  слот + тумблер. Скрипт adsbygoogle подключается только когда включено.
  Логика в `app.js` → `renderAd()`: свой баннер имеет приоритет, AdSense
  заполняет слот, если баннера под слот нет. Пустые ID ничего не ломают.

---

## 7. Как проверять (методика, которой всё проверялось)

1. `node --check` на каждый изменённый game.js.
2. Смоук-тест всех игр: скрипт лежал в scratch-каталоге сессии
   (`smoke-all.js`) — контейнер эфемерный, поэтому его надо пересоздать; суть:
   Playwright/Chromium (предустановлен, `executablePath: '/opt/pw-browsers/chromium'`),
   для каждого id из catalog.json открыть `http://localhost:3000/?game=<id>`
   (390×780), подождать 2.5 с, тапнуть центр, нажать стрелки/пробел, собрать
   `pageerror` (игнорируя telegram.org/googlesyndication/favicon — их режет
   прокси окружения), проверить что `#game-container` не пуст. Критерий: 0 ошибок.
3. API — curl-сценарий: login → banners CRUD → track (в т.ч. пустой initData —
   должен приниматься) → score → stats/summary.
4. Экран смотреть скриншотами Playwright (каталог, пара игр, админка).

Параметр `?game=<id>` в URL открывает игру напрямую — сделан и для тестов, и
как deep-link (в Telegram то же самое делает `startapp=<id>`).

---

## 8. Что осталось сделать (кандидаты на продолжение)

Функционально платформа завершена по ТЗ. Возможные следующие шаги:

1. **Деплой**: VPS/Railway/Fly + HTTPS (nginx/caddy). Шаги подключения бота —
   в README («Подключение к Telegram»). После деплоя: вставить токен и URL в
   админке, `/newapp` у BotFather.
2. **Ручной прогон геймплея**: смоук-тест ловит краши, но не «скучность»;
   стоит поиграть в каждую премиум-игру руками, подкрутить сложность.
3. **Лидерборды в UI приложения**: API `/api/leaderboard/:game` готов, но в
   webapp пока не показывается (только рекорды локально). Добавить вкладку на
   экране Game Over.
4. **Больше языков**: es/pt/hi/id — по одному JSON в `webapp/i18n/` + LANGS в
   app.js; словесные игры и викторины потребуют своих данных на новых языках.
5. **Расширение словарей** words/hangman/wordsearch/anagrams (сейчас 300-700
   слов на язык — играбельно, но больше = лучше).
6. **Пуш-акции через бота**: рассылка есть; можно добавить планировщик.
7. **Иконки игр**: сейчас эмодзи (мгновенно и 0 КБ); при желании заменить на
   рисованные SVG-тайлы.
8. Мелочь: `webapp/index.html` не имеет favicon/манифеста PWA — добавить при
   желании «установки на домашний экран».

## 9. Известные нюансы

- Флаги-эмодзи в `quizflags` не рендерятся на части старых Android — в игре
  есть детект и fallback (показ буквенного кода страны).
- В окружении разработки исходящий HTTPS идёт через прокси, который режет
  telegram.org — поэтому смоук-тест игнорирует эти ошибки; в проде их нет.
- `better-sqlite3` — нативный модуль: на новом сервере нужен `npm install`
  (соберётся сам), Node ≥18 обязателен (используется глобальный fetch в bot.js).
- История коммитов: серия «Add wave-2 games batch» — это пачки игр от
  параллельных агентов; финальный коммит каталога — «Complete the 106-game
  catalog…».
- Пароль админки по умолчанию `admin` — сменить до публичного деплоя
  (в админке → Настройки, или ADMIN_PASSWORD в .env).
