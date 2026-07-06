'use strict';
/* Telegram Mini App initData validation (HMAC per https://core.telegram.org/bots/webapps).
   With no bot token configured the platform runs in demo mode: the user payload is
   parsed but marked unverified. */
const crypto = require('crypto');
const { getSetting } = require('./db');

function parseInitData(initData) {
  if (!initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const out = {};
    for (const [k, v] of params) out[k] = v;
    if (out.user) out.user = JSON.parse(out.user);
    return out;
  } catch (e) { return null; }
}

function verifyInitData(initData) {
  const token = getSetting('bot_token', process.env.BOT_TOKEN || '') || '';
  // No initData at all (plain browser / demo mode): allow as anonymous.
  if (!initData) return { ok: true, verified: false, user: null };
  const data = parseInitData(initData);
  if (!data) return { ok: false, verified: false, user: null };
  if (!token) return { ok: true, verified: false, user: data.user || null }; // demo mode

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, verified: false, user: null };
    params.delete('hash');
    const pairs = [];
    for (const [k, v] of params) pairs.push(k + '=' + v);
    pairs.sort();
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calc = crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
    const ok = crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
    // Reject stale auth (older than 24h) to limit replay
    const fresh = !data.auth_date || (Date.now() / 1000 - Number(data.auth_date)) < 86400;
    return { ok: ok && fresh, verified: ok && fresh, user: ok && fresh ? (data.user || null) : null };
  } catch (e) {
    return { ok: false, verified: false, user: null };
  }
}

module.exports = { verifyInitData, parseInitData };
