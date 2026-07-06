'use strict';
/* Admin API: auth, game management, statistics, ads (banners + AdSense), bot control. */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, getSetting, setSetting } = require('./db');
const bot = require('./bot');

const router = express.Router();

/* ---------- auth ---------- */
function adminPassword() {
  return getSetting('admin_password', process.env.ADMIN_PASSWORD || 'admin');
}

router.post('/login', express.json(), (req, res) => {
  const pass = String((req.body || {}).password || '');
  const expected = adminPassword();
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'wrong password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO admin_sessions (token, created) VALUES (?, ?)').run(token, Date.now());
  // Keep only recent sessions
  db.prepare('DELETE FROM admin_sessions WHERE created < ?').run(Date.now() - 30 * 86400000);
  res.json({ token });
});

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !db.prepare('SELECT 1 FROM admin_sessions WHERE token = ?').get(token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
router.use(requireAuth);
router.use(express.json());

router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

/* ---------- games ---------- */
const CATALOG_PATH = path.join(__dirname, '..', 'webapp', 'games', 'catalog.json');

router.get('/games', (req, res) => {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const overrides = {};
  for (const row of db.prepare('SELECT * FROM game_overrides').all()) overrides[row.game_id] = row;
  const since30 = Date.now() - 30 * 86400000;
  const playsByGame = {};
  for (const row of db.prepare('SELECT game_id, COUNT(*) c FROM plays WHERE ts > ? GROUP BY game_id').all(since30)) {
    playsByGame[row.game_id] = row.c;
  }
  res.json({
    categories: catalog.categories,
    games: catalog.games.map(g => {
      const o = overrides[g.id] || {};
      return {
        id: g.id, cat: g.cat, icon: g.icon, name: g.name,
        enabled: o.enabled === undefined ? true : !!o.enabled,
        featured: !!o.featured,
        sort: o.sort || 0,
        plays30d: playsByGame[g.id] || 0
      };
    })
  });
});

router.put('/games/:id', (req, res) => {
  const id = String(req.params.id).slice(0, 32);
  const b = req.body || {};
  db.prepare(`
    INSERT INTO game_overrides (game_id, enabled, featured, sort) VALUES (?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET enabled = excluded.enabled, featured = excluded.featured, sort = excluded.sort
  `).run(id, b.enabled === false ? 0 : 1, b.featured ? 1 : 0, Number(b.sort) || 0);
  res.json({ ok: true });
});

/* ---------- statistics ---------- */
function sinceDays(req, def) {
  const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || def));
  return { days, since: Date.now() - days * 86400000 };
}

router.get('/stats/summary', (req, res) => {
  const { since } = sinceDays(req, 30);
  const dayAgo = Date.now() - 86400000;
  res.json({
    totalUsers: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    newUsers: db.prepare('SELECT COUNT(*) c FROM users WHERE first_seen > ?').get(since).c,
    dau: db.prepare('SELECT COUNT(*) c FROM users WHERE last_seen > ?').get(dayAgo).c,
    plays: db.prepare('SELECT COUNT(*) c FROM plays WHERE ts > ?').get(since).c,
    avgDuration: Math.round(db.prepare('SELECT AVG(duration) a FROM plays WHERE ts > ? AND duration > 0').get(since).a || 0),
    appOpens: db.prepare("SELECT COUNT(*) c FROM events WHERE type = 'app_open' AND ts > ?").get(since).c,
    topGames: db.prepare(`
      SELECT game_id, COUNT(*) plays, COUNT(DISTINCT user_id) players
      FROM plays WHERE ts > ? GROUP BY game_id ORDER BY plays DESC LIMIT 10
    `).all(since)
  });
});

router.get('/stats/timeseries', (req, res) => {
  const { since } = sinceDays(req, 30);
  const q = (sql) => db.prepare(sql).all(since);
  res.json({
    plays: q(`SELECT date(ts/1000, 'unixepoch') day, COUNT(*) v FROM plays WHERE ts > ? GROUP BY day ORDER BY day`),
    activeUsers: q(`SELECT date(ts/1000, 'unixepoch') day, COUNT(DISTINCT user_id) v FROM events WHERE ts > ? AND user_id IS NOT NULL GROUP BY day ORDER BY day`),
    newUsers: q(`SELECT date(first_seen/1000, 'unixepoch') day, COUNT(*) v FROM users WHERE first_seen > ? GROUP BY day ORDER BY day`)
  });
});

router.get('/stats/games', (req, res) => {
  const { since } = sinceDays(req, 30);
  res.json({
    games: db.prepare(`
      SELECT game_id, COUNT(*) plays, COUNT(DISTINCT user_id) players,
             ROUND(AVG(score)) avgScore, MAX(score) maxScore, ROUND(AVG(duration)) avgDuration
      FROM plays WHERE ts > ? GROUP BY game_id ORDER BY plays DESC
    `).all(since)
  });
});

router.get('/stats/game/:id', (req, res) => {
  const { since } = sinceDays(req, 30);
  const id = String(req.params.id).slice(0, 32);
  res.json({
    daily: db.prepare(`
      SELECT date(ts/1000, 'unixepoch') day, COUNT(*) plays, COUNT(DISTINCT user_id) players
      FROM plays WHERE game_id = ? AND ts > ? GROUP BY day ORDER BY day
    `).all(id, since),
    top: db.prepare(`
      SELECT COALESCE(u.first_name, u.username, 'Player') name, MAX(p.score) score
      FROM plays p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.game_id = ? AND p.ts > ? AND p.user_id IS NOT NULL
      GROUP BY p.user_id ORDER BY score DESC LIMIT 20
    `).all(id, since)
  });
});

router.get('/users', (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  res.json({
    users: db.prepare(`
      SELECT u.id, u.tg_id, u.username, u.first_name, u.lang, u.first_seen, u.last_seen, u.blocked,
             (SELECT COUNT(*) FROM plays p WHERE p.user_id = u.id) plays
      FROM users u ORDER BY u.last_seen DESC LIMIT ?
    `).all(limit)
  });
});

/* ---------- banners ---------- */
router.get('/banners', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY id DESC').all();
  const stats = {};
  for (const s of db.prepare('SELECT banner_id, SUM(impressions) i, SUM(clicks) c FROM banner_stats GROUP BY banner_id').all()) {
    stats[s.banner_id] = { impressions: s.i, clicks: s.c };
  }
  res.json({ banners: banners.map(b => Object.assign(b, { stats: stats[b.id] || { impressions: 0, clicks: 0 } })) });
});

router.post('/banners', (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare(`
    INSERT INTO banners (name, text, image_url, target_url, placement, weight, active, starts, ends, created)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(b.name).slice(0, 100), b.text ? String(b.text).slice(0, 300) : null,
    b.image_url ? String(b.image_url).slice(0, 500) : null,
    b.target_url ? String(b.target_url).slice(0, 500) : null,
    ['catalog_top', 'catalog_bottom', 'game_over', 'any'].includes(b.placement) ? b.placement : 'any',
    Math.max(1, Math.min(100, Number(b.weight) || 1)),
    b.active === false ? 0 : 1,
    b.starts ? Number(b.starts) : null,
    b.ends ? Number(b.ends) : null,
    Date.now()
  );
  res.json({ ok: true, id: r.lastInsertRowid });
});

router.put('/banners/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM banners WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`
    UPDATE banners SET name=?, text=?, image_url=?, target_url=?, placement=?, weight=?, active=?, starts=?, ends=? WHERE id=?
  `).run(
    b.name !== undefined ? String(b.name).slice(0, 100) : cur.name,
    b.text !== undefined ? (b.text ? String(b.text).slice(0, 300) : null) : cur.text,
    b.image_url !== undefined ? (b.image_url ? String(b.image_url).slice(0, 500) : null) : cur.image_url,
    b.target_url !== undefined ? (b.target_url ? String(b.target_url).slice(0, 500) : null) : cur.target_url,
    b.placement !== undefined ? b.placement : cur.placement,
    b.weight !== undefined ? Math.max(1, Math.min(100, Number(b.weight) || 1)) : cur.weight,
    b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
    b.starts !== undefined ? (b.starts ? Number(b.starts) : null) : cur.starts,
    b.ends !== undefined ? (b.ends ? Number(b.ends) : null) : cur.ends,
    cur.id
  );
  res.json({ ok: true });
});

router.delete('/banners/:id', (req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM banner_stats WHERE banner_id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/banners/:id/stats', (req, res) => {
  res.json({
    daily: db.prepare('SELECT day, impressions, clicks FROM banner_stats WHERE banner_id = ? ORDER BY day DESC LIMIT 60').all(req.params.id)
  });
});

/* ---------- AdSense ---------- */
router.get('/adsense', (req, res) => {
  let slots = {};
  try { slots = JSON.parse(getSetting('adsense_slots', '{}')); } catch (e) {}
  res.json({
    client: getSetting('adsense_client', process.env.ADSENSE_CLIENT || ''),
    enabled: getSetting('adsense_enabled', '0') === '1',
    slots
  });
});

router.put('/adsense', (req, res) => {
  const b = req.body || {};
  if (b.client !== undefined) setSetting('adsense_client', String(b.client).slice(0, 64));
  if (b.enabled !== undefined) setSetting('adsense_enabled', b.enabled ? '1' : '0');
  if (b.slots !== undefined && typeof b.slots === 'object') {
    const clean = {};
    for (const k of ['catalog_top', 'catalog_bottom', 'game_over']) {
      if (b.slots[k]) clean[k] = String(b.slots[k]).slice(0, 32);
    }
    setSetting('adsense_slots', JSON.stringify(clean));
  }
  res.json({ ok: true });
});

/* ---------- bot ---------- */
router.get('/bot/status', (req, res) => {
  res.json(Object.assign(bot.status(), {
    welcome_ru: getSetting('bot_welcome_ru', ''),
    welcome_en: getSetting('bot_welcome_en', ''),
    button_text: getSetting('bot_button_text', ''),
    broadcast: bot.broadcastStatus()
  }));
});

router.put('/bot/settings', async (req, res) => {
  const b = req.body || {};
  let restart = false;
  if (b.token !== undefined) { setSetting('bot_token', String(b.token).trim()); restart = true; }
  if (b.webapp_url !== undefined) { setSetting('webapp_url', String(b.webapp_url).trim().slice(0, 300)); restart = true; }
  if (b.welcome_ru !== undefined) setSetting('bot_welcome_ru', String(b.welcome_ru).slice(0, 2000));
  if (b.welcome_en !== undefined) setSetting('bot_welcome_en', String(b.welcome_en).slice(0, 2000));
  if (b.button_text !== undefined) setSetting('bot_button_text', String(b.button_text).slice(0, 64));
  const status = restart ? await bot.restart() : bot.status();
  res.json({ ok: true, status });
});

router.post('/bot/start', async (req, res) => res.json(await bot.start()));
router.post('/bot/stop', (req, res) => res.json(bot.stop()));

router.post('/bot/broadcast', async (req, res) => {
  try {
    res.json(await bot.startBroadcast(String((req.body || {}).text || '').slice(0, 4000)));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});
router.get('/bot/broadcast', (req, res) => res.json(bot.broadcastStatus()));
router.post('/bot/broadcast/cancel', (req, res) => res.json(bot.cancelBroadcast()));

/* ---------- settings ---------- */
router.put('/password', (req, res) => {
  const p = String((req.body || {}).password || '');
  if (p.length < 4) return res.status(400).json({ error: 'too short' });
  setSetting('admin_password', p);
  res.json({ ok: true });
});

module.exports = router;
