process.env.RC_DB_PATH = ':memory:';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getOrCreateTrack,
  addVote,
  getListenerVote,
  getTrackRatingSummary,
} = require('../server/db');

test('getOrCreateTrack creates a new track', () => {
  const track = getOrCreateTrack('Artist A', 'Song A', 'Album A');
  assert.equal(typeof track.id, 'number');
  assert.equal(track.artist, 'Artist A');
  assert.equal(track.title, 'Song A');
  assert.equal(track.album, 'Album A');
});

test('getOrCreateTrack returns the existing row for the same artist+title', () => {
  const first = getOrCreateTrack('Artist B', 'Song B', 'Album B');
  const second = getOrCreateTrack('Artist B', 'Song B', 'Other Album');
  assert.equal(second.id, first.id);
  assert.equal(second.album, 'Album B');
});

test('getOrCreateTrack accepts a null album', () => {
  const track = getOrCreateTrack('Artist C', 'Song C', null);
  assert.equal(track.album, null);
});

test('getTrackRatingSummary returns zeros for a track without votes', () => {
  const track = getOrCreateTrack('Artist D', 'Song D', null);
  assert.deepEqual(getTrackRatingSummary(track.id), { likes: 0, dislikes: 0 });
});

test('addVote counts likes and dislikes from different listeners', () => {
  const track = getOrCreateTrack('Artist E', 'Song E', null);
  addVote(track.id, 'listener-1', 1);
  addVote(track.id, 'listener-2', 1);
  const summary = addVote(track.id, 'listener-3', -1);
  assert.deepEqual(summary, { likes: 2, dislikes: 1 });
});

test('addVote from the same listener switches the vote instead of adding one', () => {
  const track = getOrCreateTrack('Artist F', 'Song F', null);
  addVote(track.id, 'listener-1', 1);
  assert.deepEqual(addVote(track.id, 'listener-1', 1), { likes: 1, dislikes: 0 });
  assert.deepEqual(addVote(track.id, 'listener-1', -1), { likes: 0, dislikes: 1 });
});

test('votes are scoped per track', () => {
  const t1 = getOrCreateTrack('Artist G', 'Song G1', null);
  const t2 = getOrCreateTrack('Artist G', 'Song G2', null);
  addVote(t1.id, 'listener-1', 1);
  addVote(t2.id, 'listener-1', -1);
  assert.deepEqual(getTrackRatingSummary(t1.id), { likes: 1, dislikes: 0 });
  assert.deepEqual(getTrackRatingSummary(t2.id), { likes: 0, dislikes: 1 });
});

test('addVote rejects votes other than 1 and -1', () => {
  const track = getOrCreateTrack('Artist H', 'Song H', null);
  assert.throws(() => addVote(track.id, 'listener-1', 5));
});

test('getListenerVote returns the listener\'s current vote', () => {
  const track = getOrCreateTrack('Artist I', 'Song I', null);
  assert.equal(getListenerVote(track.id, 'listener-1'), null);
  addVote(track.id, 'listener-1', -1);
  assert.equal(getListenerVote(track.id, 'listener-1'), -1);
  assert.equal(getListenerVote(track.id, 'listener-2'), null);
});

test('getListenerVote returns null when trackId or listenerId is missing', () => {
  assert.equal(getListenerVote(null, 'listener-1'), null);
  assert.equal(getListenerVote(1, undefined), null);
});
