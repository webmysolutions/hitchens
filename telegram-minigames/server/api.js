'use strict';
/* Public API used by the webapp. Everything degrades gracefully:
   the webapp also works with no server at all (static fallback). */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, getSetting, upsertUser, bumpBannerStat } = require('./db');
const { verifyInitData } = require('./telegram-auth');

const router = express.Router();

const CATALOG_PATH = path.join(__dirname, '..', 'webapp', 'games', 'catalog.json');
function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

/* Merged catalog: static file + admin overrides (enabled/featured/order). */
router.get('/games', (req, res) => {
  const catalog = readCatalog();
  const overrides = {};
  for (const row of db.prepare('SELECT * FROM game_overrides').all()) overrides[row.game_id] = row;
  catalog.games = catalog.games
    .map(g => {
      const o = overrides[g.id];
      return Object.assign({}, g, {
        enabled: o ? !!o.enabled : true,
        featured: o ? !!o.featured : false,
        sort: o ? o.sort : 0
      });
    })
    .filter(g => g.enabled)
    .sort((a, b) => (b.featured - a.featured) || (b.sort - a.sort));
  res.json(catalog);
});

/* Runtime config: active banners + AdSense. */
router.get('/config', (req, res) => {
  const now = Date.now();
  const banners = db.prepare('SELECT id, name, text, image_url, target_url, placement, weight FROM banners WHERE active = 1 AND (starts IS NULL OR starts <= ?) AND (ends IS NULL OR ends >= ?)')
    .all(now, now);
  let slots = {};
  try { slots = JSON.parse(getSetting('adsense_slots', '{}')); } catch (e) {}
  res.json({
    banners,
    adsense: {
      client: getSetting('adsense_client', process.env.ADSENSE_CLIENT || ''),
      enabled: getSetting('adsense_enabled', '0') === '1',
      slots
    }
  });
});

/* Event tracking: batched events from the webapp. */
router.post('/track', (req, res) => {
  const body = req.body || {};
  const auth = verifyInitData(body.initData);
  if (!auth.ok) return res.status(403).json({ error: 'bad initData' });
  const userId = auth.user ? upsertUser(auth.user, body.lang) : null;

  const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
  const ins = db.prepare('INSERT INTO events (user_id, type, data, ts) VALUES (?, ?, ?, ?)');
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const ev of events) {
      if (!ev || typeof ev.type !== 'string') continue;
      const ts = (typeof ev.ts === 'number' && ev.ts > 0 && ev.ts <= now + 60000) ? ev.ts : now;
      const data = ev.data && typeof ev.data === 'object' ? ev.data : {};
      ins.run(userId, ev.type.slice(0, 32), JSON.stringify(data).slice(0, 2000), ts);
      if (ev.type === 'ad_impression' && data.banner) bumpBannerStat(data.banner, 'impression');
      if (ev.type === 'ad_click' && data.banner) bumpBannerStat(data.banner, 'click');
    }
  });
  tx();
  res.json({ ok: true });
});

/* Finished play: powers per-game stats and leaderboards. */
router.post('/score', (req, res) => {
  const body = req.body || {};
  const auth = verifyInitData(body.initData);
  if (!auth.ok) return res.status(403).json({ error: 'bad initData' });
  const userId = auth.user ? upsertUser(auth.user) : null;

  const game = String(body.game || '').slice(0, 32);
  const score = Math.max(0, Math.min(1e9, Math.round(Number(body.score) || 0)));
  const duration = Math.max(0, Math.min(86400, Math.round(Number(body.duration) || 0)));
  if (!game) return res.status(400).json({ error: 'no game' });

  db.prepare('INSERT INTO plays (user_id, game_id, score, duration, ts) VALUES (?, ?, ?, ?, ?)')
    .run(userId, game, score, duration, Date.now());
  res.json({ ok: true });
});

/* Top scores for a game (last 30 days). */
router.get('/leaderboard/:game', (req, res) => {
  const since = Date.now() - 30 * 86400000;
  const rows = db.prepare(`
    SELECT COALESCE(u.first_name, u.username, 'Player') AS name, MAX(p.score) AS score
    FROM plays p LEFT JOIN users u ON u.id = p.user_id
    WHERE p.game_id = ? AND p.ts > ? AND p.user_id IS NOT NULL
    GROUP BY p.user_id ORDER BY score DESC LIMIT 10
  `).all(String(req.params.game).slice(0, 32), since);
  res.json({ top: rows });
});

router.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

module.exports = router;
