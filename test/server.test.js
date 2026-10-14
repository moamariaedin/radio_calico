process.env.RC_DB_PATH = ':memory:';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { getOrCreateTrack } = require('../server/db');
const { app, parseCookies, LISTENER_COOKIE } = require('../server/index');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function vote(trackId, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${baseUrl}/api/tracks/${trackId}/vote`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('parseCookies handles empty and missing headers', () => {
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies(''), {});
});

test('parseCookies parses multiple cookies, trims and decodes values', () => {
  assert.deepEqual(parseCookies('a=1; b = hello%20world ;c=x=y'), {
    a: '1',
    b: 'hello world',
    c: 'x=y',
  });
});

test('parseCookies ignores malformed pairs', () => {
  assert.deepEqual(parseCookies('novalue; =empty; ok=1'), { ok: '1' });
});

test('a new listener gets an rc_listener_id cookie', async () => {
  const res = await fetch(`${baseUrl}/api/history`);
  const setCookie = res.headers.get('set-cookie');
  assert.match(
    setCookie,
    new RegExp(`^${LISTENER_COOKIE}=[0-9a-f-]{36}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax$`)
  );
});

test('an existing listener cookie is kept and not re-issued', async () => {
  const res = await fetch(`${baseUrl}/api/history`, {
    headers: { Cookie: `${LISTENER_COOKIE}=existing-id` },
  });
  assert.equal(res.headers.get('set-cookie'), null);
});

test('GET /api/now-playing returns the empty state before polling', async () => {
  const res = await fetch(`${baseUrl}/api/now-playing`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.trackId, null);
  assert.deepEqual(body.rating, { likes: 0, dislikes: 0 });
  assert.equal(body.myVote, null);
});

test('GET /api/history returns an array', async () => {
  const res = await fetch(`${baseUrl}/api/history`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('POST /api/tracks/:id/vote records a vote', async () => {
  const track = getOrCreateTrack('Server', 'Vote', null);
  const res = await vote(track.id, { vote: 1 }, `${LISTENER_COOKIE}=listener-1`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    trackId: track.id,
    rating: { likes: 1, dislikes: 0 },
  });
});

test('POST /api/tracks/:id/vote switches a repeat vote from the same listener', async () => {
  const track = getOrCreateTrack('Server', 'Switch', null);
  const cookie = `${LISTENER_COOKIE}=listener-1`;
  await vote(track.id, { vote: 1 }, cookie);
  const res = await vote(track.id, { vote: -1 }, cookie);
  assert.deepEqual((await res.json()).rating, { likes: 0, dislikes: 1 });

  const other = await vote(track.id, { vote: 1 }, `${LISTENER_COOKIE}=listener-2`);
  assert.deepEqual((await other.json()).rating, { likes: 1, dislikes: 1 });
});

test('POST /api/tracks/:id/vote accepts a numeric string vote', async () => {
  const track = getOrCreateTrack('Server', 'String', null);
  const res = await vote(track.id, { vote: '-1' }, `${LISTENER_COOKIE}=listener-1`);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).rating, { likes: 0, dislikes: 1 });
});

test('POST /api/tracks/:id/vote rejects invalid votes', async () => {
  const track = getOrCreateTrack('Server', 'Invalid', null);
  for (const body of [{ vote: 0 }, { vote: 2 }, { vote: 'abc' }, {}]) {
    const res = await vote(track.id, body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('POST /api/tracks/:id/vote rejects a non-numeric track id', async () => {
  const res = await vote('abc', { vote: 1 });
  assert.equal(res.status, 400);
});
