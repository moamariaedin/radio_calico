# Radio Calico

Prototype online radio web app. No build pipeline, no frontend framework — kept intentionally lightweight.

## Stack

- **Backend:** Node.js + Express
- **Database:** built-in `node:sqlite` (`DatabaseSync`) — requires Node ≥22.5
- **Frontend:** plain HTML/CSS/JS, no framework. Audio playback via `hls.js` (loaded from CDN)

## Run

```
npm install
npm start
```

Serves on `http://localhost:3000`. There is no test suite, lint config, or build step — `npm start` is the only script.

## Features

- Live HLS audio stream playback (lossless FLAC or AAC hi-fi variants)
- Current track info with cover art
- Thumbs up/down rating per track (one vote per listener, tracked via an anonymous cookie)
- "Previously played" list of the last 5 tracks

## API

- `GET /api/now-playing` — current track + cover art URL + like/dislike counts + the listener's current vote
- `GET /api/history` — last 5 previously played tracks
- `POST /api/tracks/:id/vote` body `{vote: 1|-1}` — like/dislike

## File layout

```
server/
  index.js            # Express app, static serving, routes, starts poller on listen
  db.js               # schema (tracks, ratings) + query helpers
  metadataPoller.js   # polls stream metadata every 15s; tracks current song + last-5 history
public/
  index.html
  styles.css
  app.js
  images/radio-calico-logo.png
```

See `CLAUDE.md` for architecture notes, design tokens, and details on the external stream dependency.

## License

Prototype project, no license specified.
