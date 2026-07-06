'use strict';
/* Telegram bot via raw Bot API (no SDK dependency). Long polling.
   Runs only when a token is configured (env BOT_TOKEN or set from the admin panel).
   Without a token the platform works in demo mode and this module stays idle. */
const { db, getSetting, setSetting, upsertUser } = require('./db');

const API = 'https://api.telegram.org/bot';

let running = false;
let offset = 0;
let me = null;
let lastError = null;
let pollAbort = null;

function token() {
  return getSetting('bot_token', process.env.BOT_TOKEN || '') || '';
}
function webappUrl() {
  return getSetting('webapp_url', process.env.WEBAPP_URL || '') || '';
}

async function call(method, params) {
  const tk = token();
  if (!tk) throw new Error('no bot token configured');
  const res = await fetch(API + tk + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error('telegram ' + method + ': ' + (json.description || res.status));
  return json.result;
}

function welcomeText(lang) {
  const key = lang === 'ru' ? 'bot_welcome_ru' : 'bot_welcome_en';
  const def = lang === 'ru'
    ? '🎮 Привет! Здесь собраны десятки мини-игр: аркады, головоломки, шахматы, гонки и симуляторы.\nЖми кнопку и играй — всё грузится быстро даже на слабом интернете!'
    : '🎮 Hi! Dozens of mini-games in one place: arcade, puzzles, chess, racing and sims.\nTap the button and play — loads fast even on slow connections!';
  return getSetting(key, def) || def;
}

async function handleUpdate(u) {
  const msg = u.message;
  if (!msg || !msg.from) return;
  upsertUser(msg.from, msg.from.language_code);
  const lang = (msg.from.language_code || 'en').slice(0, 2) === 'ru' ? 'ru' : 'en';
  const text = msg.text || '';

  if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/games')) {
    const url = webappUrl();
    const btnText = getSetting('bot_button_text', lang === 'ru' ? '🎮 Играть' : '🎮 Play');
    const replyMarkup = url
      ? { inline_keyboard: [[{ text: btnText, web_app: { url } }]] }
      : undefined;
    await call('sendMessage', {
      chat_id: msg.chat.id,
      text: welcomeText(lang) + (url ? '' : (lang === 'ru' ? '\n\n⚠️ URL приложения ещё не настроен.' : '\n\n⚠️ Webapp URL is not configured yet.')),
      reply_markup: replyMarkup
    });
  }
}

async function pollLoop() {
  while (running) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      lastError = null;
      for (const u of updates) {
        offset = u.update_id + 1;
        handleUpdate(u).catch(e => { lastError = String(e.message || e); });
      }
    } catch (e) {
      lastError = String(e.message || e);
      if (!running) break;
      await new Promise(r => { pollAbort = r; setTimeout(r, 5000); });
    }
  }
}

async function start() {
  if (running) return status();
  if (!token()) { lastError = 'no token'; return status(); }
  try {
    me = await call('getMe');
    // Menu button opens the mini app when a URL is configured
    const url = webappUrl();
    if (url) {
      call('setChatMenuButton', {
        menu_button: { type: 'web_app', text: getSetting('bot_button_text', '🎮 Play'), web_app: { url } }
      }).catch(() => {});
    }
    running = true;
    lastError = null;
    pollLoop();
  } catch (e) {
    lastError = String(e.message || e);
    me = null;
  }
  return status();
}

function stop() {
  running = false;
  if (pollAbort) { pollAbort(); pollAbort = null; }
  return status();
}

async function restart() {
  stop();
  await new Promise(r => setTimeout(r, 300));
  return start();
}

function status() {
  return {
    configured: !!token(),
    running,
    bot: me ? { id: me.id, username: me.username, first_name: me.first_name } : null,
    lastError,
    webappUrl: webappUrl()
  };
}

/* ---------- broadcast ---------- */
let broadcast = { active: false, total: 0, sent: 0, failed: 0, startedAt: 0 };

async function startBroadcast(text) {
  if (broadcast.active) throw new Error('broadcast already running');
  if (!token()) throw new Error('no bot token configured');
  const users = db.prepare('SELECT tg_id FROM users WHERE tg_id IS NOT NULL AND blocked = 0').all();
  broadcast = { active: true, total: users.length, sent: 0, failed: 0, startedAt: Date.now() };
  (async () => {
    for (const u of users) {
      if (!broadcast.active) break;
      try {
        await call('sendMessage', { chat_id: u.tg_id, text });
        broadcast.sent++;
      } catch (e) {
        broadcast.failed++;
        if (/blocked|deactivated|chat not found/i.test(String(e.message))) {
          db.prepare('UPDATE users SET blocked = 1 WHERE tg_id = ?').run(u.tg_id);
        }
      }
      await new Promise(r => setTimeout(r, 40)); // ~25 msg/sec, under Telegram limits
    }
    broadcast.active = false;
  })();
  return broadcastStatus();
}
function cancelBroadcast() { broadcast.active = false; return broadcastStatus(); }
function broadcastStatus() { return Object.assign({}, broadcast); }

module.exports = { start, stop, restart, status, call, startBroadcast, broadcastStatus, cancelBroadcast };
