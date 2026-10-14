const https = require('https');
const { getOrCreateTrack, getTrackRatingSummary, getListenerVote } = require('./db');

const METADATA_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/metadatav2.json';
const COVER_ART_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/cover.jpg';
const POLL_INTERVAL_MS = 15000;
const HISTORY_SIZE = 5;

let currentState = {
  artist: null,
  title: null,
  album: null,
  date: null,
  bitDepth: null,
  sampleRate: null,
  trackId: null,
};

let currentHistory = [];

function fetchMetadata() {
  return new Promise((resolve, reject) => {
    https
      .get(METADATA_URL, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function buildHistory(meta, currentArtist, currentTitle) {
  const history = [];
  for (let i = 1; i <= HISTORY_SIZE; i++) {
    const artist = meta[`prev_artist_${i}`];
    const title = meta[`prev_title_${i}`];
    if (!artist || !title) continue;
    if (artist === currentArtist && title === currentTitle) continue;
    history.push({ artist, title });
  }
  return history.slice(0, HISTORY_SIZE);
}

async function poll() {
  try {
    const meta = await fetchMetadata();
    const { artist, title, album, date, bit_depth, sample_rate } = meta;
    if (!artist || !title) return;

    if (artist !== currentState.artist || title !== currentState.title) {
      const track = getOrCreateTrack(artist, title, album || null);
      currentState = {
        artist,
        title,
        album: album || null,
        date: date || null,
        bitDepth: bit_depth || null,
        sampleRate: sample_rate || null,
        trackId: track.id,
      };
    }

    currentHistory = buildHistory(meta, artist, title);
  } catch (err) {
    console.error('Metadata poll failed:', err.message);
  }
}

function startPolling() {
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

function getNowPlaying(listenerId) {
  if (!currentState.trackId) {
    return {
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
    };
  }
  return {
    ...currentState,
    coverUrl: COVER_ART_URL,
    rating: getTrackRatingSummary(currentState.trackId),
    myVote: getListenerVote(currentState.trackId, listenerId),
  };
}

function getHistory() {
  return currentHistory;
}

module.exports = { startPolling, getNowPlaying, getHistory };
