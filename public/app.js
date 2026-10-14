const STREAM_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8';
const POLL_INTERVAL_MS = 15000;

const audio = document.getElementById('audio');
const playBtn = document.getElementById('play-btn');
const volumeSlider = document.getElementById('volume-slider');
const statusEl = document.getElementById('status');
const equalizerEl = document.getElementById('equalizer');

const coverArtEl = document.getElementById('cover-art');
const artistEl = document.getElementById('np-artist');
const titleEl = document.getElementById('np-title');
const albumEl = document.getElementById('np-album');
const sourceQualityEl = document.getElementById('np-source-quality');

const voteUpBtn = document.getElementById('vote-up');
const voteDownBtn = document.getElementById('vote-down');
const likeCountEl = document.getElementById('like-count');
const dislikeCountEl = document.getElementById('dislike-count');

const historyListEl = document.getElementById('history-list');

let isPlaying = false;
let currentTrackId = null;
let currentVote = null; // 1, -1, or null
let hls = null;

function setupHls() {
  if (window.Hls && window.Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(STREAM_URL);
    hls.attachMedia(audio);
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        statusEl.textContent = 'Strömmen kunde inte laddas.';
      }
    });
  } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
    audio.src = STREAM_URL;
  } else {
    statusEl.textContent = 'Din webbläsare stödjer inte HLS-uppspelning.';
  }
}

// Live stream: while paused, the "nu spelas" info keeps advancing (it's polled
// independently), but the audio buffer stays frozen at the paused position.
// Jump back to the live edge before resuming so the audio matches what's
// currently shown instead of replaying whatever was buffered before pause.
function seekToLiveEdge() {
  try {
    if (hls && Number.isFinite(hls.liveSyncPosition)) {
      audio.currentTime = hls.liveSyncPosition;
    } else if (audio.seekable && audio.seekable.length > 0) {
      audio.currentTime = audio.seekable.end(audio.seekable.length - 1);
    }
  } catch (err) {
    // Seeking isn't critical to playback - ignore if the browser refuses.
  }
}

function togglePlay() {
  if (isPlaying) {
    audio.pause();
  } else {
    seekToLiveEdge();
    audio.play().catch(() => {
      statusEl.textContent = 'Kunde inte starta uppspelning.';
    });
  }
}

audio.addEventListener('play', () => {
  isPlaying = true;
  playBtn.textContent = '⏸';
  equalizerEl.classList.add('playing');
  statusEl.textContent = 'Spelar live';
});

audio.addEventListener('pause', () => {
  isPlaying = false;
  playBtn.textContent = '▶';
  equalizerEl.classList.remove('playing');
  statusEl.textContent = 'Pausad';
});

playBtn.addEventListener('click', togglePlay);

volumeSlider.addEventListener('input', () => {
  audio.volume = volumeSlider.value / 100;
});
audio.volume = volumeSlider.value / 100;

function renderRating(rating) {
  likeCountEl.textContent = rating.likes;
  dislikeCountEl.textContent = rating.dislikes;
}

async function sendVote(vote) {
  if (!currentTrackId) return;
  try {
    const res = await fetch(`/api/tracks/${currentTrackId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote }),
    });
    if (!res.ok) return;
    const data = await res.json();
    currentVote = vote;
    voteUpBtn.classList.toggle('active', vote === 1);
    voteDownBtn.classList.toggle('active', vote === -1);
    renderRating(data.rating);
    refreshHistory();
  } catch (err) {
    console.error('Vote failed', err);
  }
}

voteUpBtn.addEventListener('click', () => sendVote(1));
voteDownBtn.addEventListener('click', () => sendVote(-1));

function formatQuality(np) {
  if (!np.bitDepth || !np.sampleRate) return '–';
  const khz = (np.sampleRate / 1000).toFixed(1).replace(/\.0$/, '');
  return `${np.bitDepth}-bit ${khz}kHz`;
}

async function refreshNowPlaying() {
  try {
    const res = await fetch('/api/now-playing');
    const np = await res.json();

    if (np.trackId !== currentTrackId) {
      currentTrackId = np.trackId;
      coverArtEl.src = `${np.coverUrl}?t=${Date.now()}`;
    }

    currentVote = np.myVote;
    voteUpBtn.classList.toggle('active', currentVote === 1);
    voteDownBtn.classList.toggle('active', currentVote === -1);

    artistEl.textContent = np.artist || 'Radio Calico';
    titleEl.textContent = np.title || 'Live-sändning';
    albumEl.textContent = np.album ? `${np.album}${np.date ? ' (' + np.date + ')' : ''}` : '';
    sourceQualityEl.textContent = formatQuality(np);
    renderRating(np.rating);

    refreshHistory();
  } catch (err) {
    console.error('Now playing fetch failed', err);
  }
}

function renderHistory(items) {
  if (!items.length) {
    historyListEl.innerHTML = '<li class="history__empty">Ingen historik ännu.</li>';
    return;
  }

  historyListEl.innerHTML = items
    .map(
      (item) => `<li class="history__item">
        <strong>${escapeHtml(item.artist)}</strong>:
        <em>${escapeHtml(item.title)}</em>
      </li>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function refreshHistory() {
  try {
    const res = await fetch('/api/history');
    const items = await res.json();
    renderHistory(items);
  } catch (err) {
    console.error('History fetch failed', err);
  }
}

setupHls();
refreshNowPlaying();
setInterval(refreshNowPlaying, POLL_INTERVAL_MS);
