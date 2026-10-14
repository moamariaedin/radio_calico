process.env.RC_DB_PATH = ':memory:';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addVote } = require('../server/db');
const {
  buildHistory,
  poll,
  getNowPlaying,
  getHistory,
  COVER_ART_URL,
} = require('../server/metadataPoller');

test('buildHistory maps prev_artist_N/prev_title_N in order', () => {
  const meta = {
    prev_artist_1: 'A1', prev_title_1: 'T1',
    prev_artist_2: 'A2', prev_title_2: 'T2',
    prev_artist_3: 'A3', prev_title_3: 'T3',
    prev_artist_4: 'A4', prev_title_4: 'T4',
    prev_artist_5: 'A5', prev_title_5: 'T5',
  };
  assert.deepEqual(buildHistory(meta, 'Now', 'Playing'), [
    { artist: 'A1', title: 'T1' },
    { artist: 'A2', title: 'T2' },
    { artist: 'A3', title: 'T3' },
    { artist: 'A4', title: 'T4' },
    { artist: 'A5', title: 'T5' },
  ]);
});

test('buildHistory skips entries missing artist or title', () => {
  const meta = {
    prev_artist_1: 'A1', prev_title_1: 'T1',
    prev_artist_2: 'A2',
    prev_title_3: 'T3',
    prev_artist_4: '', prev_title_4: 'T4',
  };
  assert.deepEqual(buildHistory(meta, 'Now', 'Playing'), [
    { artist: 'A1', title: 'T1' },
  ]);
});

test('buildHistory filters out the currently playing track', () => {
  const meta = {
    prev_artist_1: 'Now', prev_title_1: 'Playing',
    prev_artist_2: 'A2', prev_title_2: 'T2',
    prev_artist_3: 'Now', prev_title_3: 'Other',
  };
  assert.deepEqual(buildHistory(meta, 'Now', 'Playing'), [
    { artist: 'A2', title: 'T2' },
    { artist: 'Now', title: 'Other' },
  ]);
});

test('buildHistory ignores entries beyond the 5th', () => {
  const meta = { prev_artist_6: 'A6', prev_title_6: 'T6' };
  assert.deepEqual(buildHistory(meta, 'Now', 'Playing'), []);
});

// The tests below share the poller's module-level state and run in order.

test('getNowPlaying returns an empty state before any poll', () => {
  assert.deepEqual(getNowPlaying('listener-1'), {
    artist: null,
    title: null,
    album: null,
    date: null,
    bitDepth: null,
    sampleRate: null,
    trackId: null,
    coverUrl: COVER_ART_URL,
    rating: { likes: 0, dislikes: 0 },
    myVote: null,
  });
  assert.deepEqual(getHistory(), []);
});

test('poll updates now-playing and history from metadata', async () => {
  await poll(async () => ({
    artist: 'Artist',
    title: 'Title',
    album: 'Album',
    date: '2020',
    bit_depth: 24,
    sample_rate: 48000,
    prev_artist_1: 'Prev', prev_title_1: 'Song',
  }));

  const now = getNowPlaying('listener-1');
  assert.equal(now.artist, 'Artist');
  assert.equal(now.title, 'Title');
  assert.equal(now.album, 'Album');
  assert.equal(now.date, '2020');
  assert.equal(now.bitDepth, 24);
  assert.equal(now.sampleRate, 48000);
  assert.equal(typeof now.trackId, 'number');
  assert.equal(now.coverUrl, COVER_ART_URL);
  assert.deepEqual(now.rating, { likes: 0, dislikes: 0 });
  assert.equal(now.myVote, null);
  assert.deepEqual(getHistory(), [{ artist: 'Prev', title: 'Song' }]);
});

test('getNowPlaying includes ratings and the listener\'s own vote', () => {
  const { trackId } = getNowPlaying('listener-1');
  addVote(trackId, 'listener-1', 1);
  addVote(trackId, 'listener-2', -1);

  const now = getNowPlaying('listener-1');
  assert.deepEqual(now.rating, { likes: 1, dislikes: 1 });
  assert.equal(now.myVote, 1);
  assert.equal(getNowPlaying('listener-2').myVote, -1);
  assert.equal(getNowPlaying('listener-3').myVote, null);
});

test('poll keeps the same track when artist+title are unchanged', async () => {
  const before = getNowPlaying('listener-1');
  await poll(async () => ({
    artist: 'Artist',
    title: 'Title',
    prev_artist_1: 'Newer', prev_title_1: 'History',
  }));
  const after = getNowPlaying('listener-1');
  assert.equal(after.trackId, before.trackId);
  assert.equal(after.album, 'Album');
  assert.deepEqual(getHistory(), [{ artist: 'Newer', title: 'History' }]);
});

test('poll switches to a new track and normalises missing fields to null', async () => {
  const before = getNowPlaying('listener-1');
  await poll(async () => ({ artist: 'Next', title: 'Track' }));
  const now = getNowPlaying('listener-1');
  assert.notEqual(now.trackId, before.trackId);
  assert.equal(now.artist, 'Next');
  assert.equal(now.album, null);
  assert.equal(now.date, null);
  assert.equal(now.bitDepth, null);
  assert.equal(now.sampleRate, null);
  assert.deepEqual(now.rating, { likes: 0, dislikes: 0 });
  assert.deepEqual(getHistory(), []);
});

test('poll ignores metadata without artist or title', async () => {
  const before = getNowPlaying('listener-1');
  await poll(async () => ({ artist: '', title: 'Nope', prev_artist_1: 'X', prev_title_1: 'Y' }));
  assert.deepEqual(getNowPlaying('listener-1'), before);
  assert.deepEqual(getHistory(), []);
});

test('poll survives a failing fetch and keeps the previous state', async (t) => {
  t.mock.method(console, 'error', () => {});
  const before = getNowPlaying('listener-1');
  await poll(async () => {
    throw new Error('network down');
  });
  assert.deepEqual(getNowPlaying('listener-1'), before);
  assert.equal(console.error.mock.callCount(), 1);
});
