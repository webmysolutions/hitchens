'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'minigames.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  tg_id INTEGER UNIQUE,
  username TEXT,
  first_name TEXT,
  lang TEXT,
  first_seen INTEGER,
  last_seen INTEGER,
  blocked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plays (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  game_id TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  duration INTEGER DEFAULT 0,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plays_ts ON plays(ts);
CREATE INDEX IF NOT EXISTS idx_plays_game ON plays(game_id, ts);
CREATE INDEX IF NOT EXISTS idx_plays_user ON plays(user_id);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  type TEXT NOT NULL,
  data TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, ts);
CREATE TABLE IF NOT EXISTS game_overrides (
  game_id TEXT PRIMARY KEY,
  enabled INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  text TEXT,
  image_url TEXT,
  target_url TEXT,
  placement TEXT DEFAULT 'any',
  weight INTEGER DEFAULT 1,
  active INTEGER DEFAULT 1,
  starts INTEGER,
  ends INTEGER,
  created INTEGER
);
CREATE TABLE IF NOT EXISTS banner_stats (
  banner_id INTEGER,
  day TEXT,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  PRIMARY KEY (banner_id, day)
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created INTEGER
);
`);

/* ---------- settings (DB overrides .env defaults) ---------- */
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key, fallback) {
  const row = getSettingStmt.get(key);
  return row ? row.value : (fallback !== undefined ? fallback : null);
}
function setSetting(key, value) {
  setSettingStmt.run(key, value === null || value === undefined ? '' : String(value));
}

/* ---------- users ---------- */
const upsertUserStmt = db.prepare(`
INSERT INTO users (tg_id, username, first_name, lang, first_seen, last_seen)
VALUES (@tg_id, @username, @first_name, @lang, @now, @now)
ON CONFLICT(tg_id) DO UPDATE SET
  username = excluded.username,
  first_name = excluded.first_name,
  lang = excluded.lang,
  last_seen = excluded.last_seen
`);
function upsertUser(tgUser, lang) {
  if (!tgUser || !tgUser.id) return null;
  upsertUserStmt.run({
    tg_id: tgUser.id,
    username: tgUser.username || null,
    first_name: tgUser.first_name || null,
    lang: lang || tgUser.language_code || null,
    now: Date.now()
  });
  return db.prepare('SELECT id FROM users WHERE tg_id = ?').get(tgUser.id).id;
}

/* ---------- banner stats ---------- */
const bumpBanner = db.prepare(`
INSERT INTO banner_stats (banner_id, day, impressions, clicks)
VALUES (@id, @day, @imp, @clk)
ON CONFLICT(banner_id, day) DO UPDATE SET
  impressions = impressions + @imp,
  clicks = clicks + @clk
`);
function bumpBannerStat(bannerId, kind) {
  const day = new Date().toISOString().slice(0, 10);
  bumpBanner.run({ id: bannerId, day, imp: kind === 'impression' ? 1 : 0, clk: kind === 'click' ? 1 : 0 });
}

module.exports = { db, getSetting, setSetting, upsertUser, bumpBannerStat, DB_PATH };
