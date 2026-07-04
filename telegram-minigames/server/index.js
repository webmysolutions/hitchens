'use strict';
/* Mini Games platform server.
   Serves the webapp (Telegram Mini App), the admin panel and the REST API.
   Works with zero configuration (demo mode); the bot starts when a token is set. */
const { loadEnv } = require('./env');
loadEnv();

const path = require('path');
const express = require('express');
const api = require('./api');
const admin = require('./admin');
const bot = require('./bot');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

/* API */
app.use('/api/admin', admin);
app.use('/api', api);

/* Static: webapp at /, admin panel at /admin */
const WEBAPP_DIR = path.join(__dirname, '..', 'webapp');
const ADMIN_DIR = path.join(__dirname, '..', 'admin');
app.use('/admin', express.static(ADMIN_DIR, { maxAge: '1h' }));
app.use(express.static(WEBAPP_DIR, {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, () => {
  console.log('Mini Games server on http://localhost:' + PORT);
  console.log('Webapp:  http://localhost:' + PORT + '/');
  console.log('Admin:   http://localhost:' + PORT + '/admin/');
  bot.start().then(s => {
    console.log(s.configured
      ? (s.running ? 'Bot: polling as @' + (s.bot && s.bot.username) : 'Bot: token set but failed to start — ' + s.lastError)
      : 'Bot: no token configured — running in demo mode (set it in the admin panel or .env)');
  });
});
