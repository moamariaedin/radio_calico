# Radio Calico

Prototype online radio web app. No build pipeline, no frontend framework — kept intentionally lightweight.

## Stack

- **Backend:** Node.js + Express
- **Database:** built-in `node:sqlite` (`DatabaseSync`) — **not** `better-sqlite3`. On this machine, `better-sqlite3` fails to install (node-gyp error: no Visual Studio C++ build tools). `node:sqlite`'s API is close enough (`.exec()` with multi-statement SQL, `.prepare().get/.all/.run()`, `lastInsertRowid`) to use directly. Requires Node ≥22.5.
- **Frontend:** plain HTML/CSS/JS, no framework. Audio playback via `hls.js` (loaded from CDN in `index.html`).

## Run

```
npm install
npm start
npm test
```

Serves on `http://localhost:3000`. There is no lint config or build step.

## Tests

Unit tests live in `test/*.test.js` and use Node's built-in `node:test` runner (`npm test` → `node --test`) — no test framework dependency. Each test file sets `RC_DB_PATH=':memory:'` before requiring `server/db.js`, so tests never touch `radio_calico.db`. `server/index.js` only calls `app.listen` when run directly (`require.main === module`) and exports `app`, so `test/server.test.js` binds it to a random port and hits the routes with `fetch`. `poll()` in `metadataPoller.js` takes an optional fetcher so tests can feed metadata without the network.

## Notes

- UI copy in `public/index.html` and `public/app.js` (status messages, labels) is written in Swedish (`lang="sv"`), while code, comments, and this doc are in English. Keep new user-facing strings consistent with that if editing the UI.

## File layout

```
server/
  index.js            # Express app, static serving, routes, starts poller on listen
  db.js               # schema (tracks, ratings) + query helpers — current-track voting only
  metadataPoller.js   # polls stream metadata every 15s; tracks current song + last-5 history (no DB)
test/
  db.test.js              # track creation, voting, one-vote-per-listener
  metadataPoller.test.js  # buildHistory + poll/now-playing state (fake fetcher)
  server.test.js          # cookie parsing, listener cookie, API routes
public/
  index.html
  styles.css
  app.js
  images/radio-calico-logo.png   # official logo asset
```

## API

- `GET /api/now-playing` — current track + cover art URL + like/dislike counts + `myVote` (this listener's current vote on the track, `1`/`-1`/`null`)
- `GET /api/history` — last 5 previously played tracks (`{artist, title}` only, no ratings), excluding whatever is currently playing. Not stored in the DB — read straight from the stream's own `metadatav2.json` on each poll (see below).
- `POST /api/tracks/:id/vote` body `{vote: 1|-1}` — like/dislike

Rating UI is thumbs up/down, not 5-star — matches the official layout mockup (see Design below).

**One vote per listener per track.** Listeners aren't logged in — a listener is identified by an anonymous UUID the server sets in the `rc_listener_id` cookie (`listenerIdMiddleware` in `server/index.js`, 1-year `HttpOnly`/`SameSite=Lax` cookie, no extra dependency — cookies are parsed manually). `ratings` has a `UNIQUE(track_id, listener_id)` index; `addVote` in `server/db.js` does an `INSERT ... ON CONFLICT DO UPDATE` so a second vote from the same listener on the same track overwrites (switches) rather than adding a new row. SQLite version bundled with `node:sqlite` here is 3.53, which supports `ON CONFLICT`.

## External stream dependency

Stream is hosted on CloudFront at `https://d3d4yli4hf5bmh.cloudfront.net/`. No auth required.

| Endpoint | Purpose |
|---|---|
| `hls/live.m3u8` | HLS master playlist (variants: `flac_hires.m3u8` lossless, `aac_hifi.m3u8`) |
| `metadatav2.json` | Current track (`artist, title, album, date, bit_depth, sample_rate`) **and** last 5 previous tracks (`prev_artist_1..5`/`prev_title_1..5`) |
| `cover.jpg` | Current track's album art |

`server/metadataPoller.js` polls `metadatav2.json` every 15s. On artist+title change it looks up/creates the track row (`getOrCreateTrack` in `db.js`, needed only so voting has a `track_id` to attach to). The `prev_artist_N`/`prev_title_N` fields are reshaped into the history list on every poll — this is the app's entire "previously played" feature; there's no `plays` table and nothing is persisted for history. If the stream ever lists the current track among its own `prev_*` fields, that entry is filtered out so "now playing" never duplicates into the history list.

## Design

Brand assets came from `http://media.sundog-soft.com/Claude/RadioCalicoStyle.zip` (style guide text, logo PNG, layout mockup PNG, stream URL file). Key tokens used in `public/styles.css`:

- Colors: Mint `#D8F2D5`, Forest Green `#1F4E23`, Teal `#38A29D`, Calico Orange `#EFA63C`, Charcoal `#231F20`, Cream `#F5EADA`
- Fonts: Montserrat (headings), Open Sans (body), loaded via Google Fonts
- Layout: teal top nav with centered logo; large album art left + track info right; thumbs up/down rating; "Previous tracks:" list on mint background below

If redesigning, re-fetch the zip rather than relying on this summary — it's a one-time snapshot, not a live reference.
