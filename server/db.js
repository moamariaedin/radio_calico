const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'radio_calico.db'));

db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artist TEXT NOT NULL,
    title TEXT NOT NULL,
    album TEXT,
    UNIQUE(artist, title)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER NOT NULL REFERENCES tracks(id),
    vote INTEGER NOT NULL CHECK(vote IN (-1, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

const ratingsColumns = db.prepare('PRAGMA table_info(ratings)').all();
if (!ratingsColumns.some((col) => col.name === 'listener_id')) {
  db.exec('ALTER TABLE ratings ADD COLUMN listener_id TEXT');
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_track_listener
  ON ratings(track_id, listener_id);
`);

function getOrCreateTrack(artist, title, album) {
  const existing = db
    .prepare('SELECT * FROM tracks WHERE artist = ? AND title = ?')
    .get(artist, title);
  if (existing) return existing;

  const result = db
    .prepare('INSERT INTO tracks (artist, title, album) VALUES (?, ?, ?)')
    .run(artist, title, album);
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(result.lastInsertRowid);
}

function addVote(trackId, listenerId, vote) {
  db.prepare(
    `INSERT INTO ratings (track_id, listener_id, vote) VALUES (?, ?, ?)
     ON CONFLICT(track_id, listener_id) DO UPDATE SET vote = excluded.vote, created_at = CURRENT_TIMESTAMP`
  ).run(trackId, listenerId, vote);
  return getTrackRatingSummary(trackId);
}

function getListenerVote(trackId, listenerId) {
  if (!trackId || !listenerId) return null;
  const row = db
    .prepare('SELECT vote FROM ratings WHERE track_id = ? AND listener_id = ?')
    .get(trackId, listenerId);
  return row ? row.vote : null;
}

function getTrackRatingSummary(trackId) {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS likes,
         SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS dislikes
       FROM ratings WHERE track_id = ?`
    )
    .get(trackId);
  return { likes: row.likes || 0, dislikes: row.dislikes || 0 };
}

module.exports = {
  db,
  getOrCreateTrack,
  addVote,
  getListenerVote,
  getTrackRatingSummary,
};
