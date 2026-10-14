const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { addVote } = require('./db');
const { startPolling, getNowPlaying, getHistory } = require('./metadataPoller');

const app = express();
const PORT = process.env.PORT || 3000;

const LISTENER_COOKIE = 'rc_listener_id';
const LISTENER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year, in seconds

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function listenerIdMiddleware(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  let listenerId = cookies[LISTENER_COOKIE];

  if (!listenerId) {
    listenerId = crypto.randomUUID();
    res.setHeader(
      'Set-Cookie',
      `${LISTENER_COOKIE}=${listenerId}; Max-Age=${LISTENER_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax`
    );
  }

  req.listenerId = listenerId;
  next();
}

app.use(listenerIdMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/now-playing', (req, res) => {
  res.json(getNowPlaying(req.listenerId));
});

app.get('/api/history', (req, res) => {
  res.json(getHistory());
});

app.post('/api/tracks/:id/vote', (req, res) => {
  const trackId = parseInt(req.params.id, 10);
  const vote = parseInt(req.body.vote, 10);

  if (!Number.isInteger(trackId) || (vote !== 1 && vote !== -1)) {
    return res.status(400).json({ error: 'Invalid track id or vote (must be 1 or -1)' });
  }

  const summary = addVote(trackId, req.listenerId, vote);
  res.json({ trackId, rating: summary });
});

app.listen(PORT, () => {
  console.log(`Radio Calico listening on http://localhost:${PORT}`);
  startPolling();
});
