# Memoti

A phone and web app for tracking the films and TV shows you watch. Local-first —
everything lives in SQLite on the device (in the browser, SQLite runs as
WebAssembly over OPFS); metadata comes from TMDB.

## Setup

```bash
npm install
cp .env.example .env     # then paste your TMDB key into it
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) — the QR only renders when the
server runs in a real terminal, so don't background it. Without a TMDB key the
app runs fine but the Search tab shows setup instructions instead of results.

Get a free key at <https://www.themoviedb.org/settings/api> (v3 auth, "API Key").
`.env` is `KEY=value`, not `KEY: value`. After changing it, restart with
`npx expo start -c` — the key is inlined at bundle time.

**Web:** `npx expo start --web` (or press `w`), then open <http://localhost:8081>.
Phone and browser each keep their own database; nothing syncs between them, and
the browser's copy is tied to that origin (host + port).

## How it works

- **Home** — the watch list. *New episodes* (aired in the last 30 days, after you
  last watched), *Continue watching* (your next episode and how many are left),
  *Coming soon* (next air dates), and *Haven't started*. The check button logs
  the next episode. Airing info is one TMDB request per show, cached in
  `titles.air_info` and refreshed in the background (12h, weekly once ended).
  Progress is the furthest episode watched, so starting at S2 doesn't leave S1
  as "up next". "Stop watching" on a show's page takes it off Home.
- **Import from TV Time** (web) — Home → *Import TV Time*, then pick the CSVs
  from TV Time's GDPR export (selecting the whole folder's files is fine).
  Reads `tracking-prod-records-v2.csv`, `tracking-prod-records.csv` and
  `followed_tv_show.csv`; shows are matched to TMDB by TVDB id with a name
  search fallback, films by name + year. Archived shows import as "stopped
  watching". Re-running it adds nothing twice. For titles listed as "Not
  found", add a `memoti-matches.csv` (`name,tmdb_id,type`, name as listed,
  type `movie` when TV Time filed a film as a show) to the picked files and
  import again.
- **Library** — everything you have saved, filterable by type and sortable by
  recency, rating, or title. TV rows show episode progress; films get a one-tap
  "watched today" button. Footer totals the time watched for the current filter.
- **Explore** — trending, in theaters, on air, and popular rows straight from
  TMDB. Pull to refresh. Tapping a poster saves it and opens it.
- **Search** — three modes. *Titles* searches films and shows. *People* finds an
  actor or director and opens their full credits. *Genre* browses by genre for
  films or TV.
- **Detail** — rate 1–10, write a review, and see time watched for that title.
  Films get a watch log (rewatches stack up, each with an optional date,
  per-watch rating, and notes). Shows get a per-season episode checklist plus
  "mark season watched" and "mark whole show watched".
- **Stats** — counts, total time watched split between films and TV, average
  rating, reviews written, watches per month, and most-watched genres.

## Layout

```
app/                     routes (expo-router)
  _layout.tsx            stack; sign-in gate (API) or on-device SQLite + migrations
  (tabs)/                home (index), library, explore, search, stats
  title/[id].tsx         detail, rating, review, episode tracker
  person/[id].tsx        actor/director credits
  log/[id].tsx           modal: log a watch on a past date
  review/[id].tsx        modal: write a rating + review
src/
  api/tmdb.ts            TMDB client (search, feeds, genres, people, airing);
                         responses cached in memory for 10 minutes
  db/schema.ts           migrations (append a step to MIGRATIONS)
  db/client.ts           useDb(): on-device SQLite, or the Memoti API (D1); session
  db/queries.ts          all SQL lives here
  hooks/useDbQuery.ts    read + refetch on screen focus
  hooks/useAddTitle.ts   shared "tap a result to save it" behaviour
  components/            Poster, TitleCard, RatingPicker, FadeIn, Tappable, SignIn
  upNext.ts              next episode / remaining / "new" from airing info
  import/tvtime.ts       TV Time export → watch history (pure)
  import/runImport.ts    TMDB matching + DB writes, web file picker
  theme.ts               palette, spacing, formatters, useIsWide breakpoint
scripts/check.mjs        assert-based checks for the pure logic
scripts/d1-migrations.mjs  MIGRATIONS → worker/migrations/*.sql
worker/                  Cloudflare Worker: web app + sign-in + SQL on D1
metro.config.js          web: .wasm assets + cross-origin isolation headers
```

## Cloud data and the hosted web app (Cloudflare, free plan)

By default data stays on the device (SQLite; in the browser it lives in that
browser's storage only). Set `EXPO_PUBLIC_MEMOTI_API_URL` in `.env` (e.g.
`https://memoti.<you>.workers.dev/api`) and the app signs in and reads and
writes Cloudflare D1 through `worker/` instead, so every device shares one
database. The same Worker serves the exported web app.

- `POST /api/login` checks the one account (`MEMOTI_USERNAME`,
  `MEMOTI_PASSWORD` secrets) and returns a session token signed with
  `SESSION_SECRET`, valid 90 days. Five attempts a minute per IP.
- `POST /api/query` runs the app's SQL (D1 is SQLite, so `queries.ts` is
  unchanged) for a signed-in session. D1 migrations are generated from
  `src/db/schema.ts`.
- Sessions are stateless: changing `SESSION_SECRET` signs every device out.
  The phone keeps its token in SecureStore, the web in localStorage.

Local (no account): `worker/.dev.vars` holds `MEMOTI_USERNAME`,
`MEMOTI_PASSWORD` and `SESSION_SECRET`, then

```sh
npm run db:migrations     # regenerate + apply migrations to the local D1
npm run api               # Worker + local D1 on http://localhost:8787
```

First deploy, after `npx wrangler login`:

```sh
npx wrangler d1 create memoti --location apac   # id → worker/wrangler.jsonc
npx wrangler d1 migrations apply memoti --remote --config worker/wrangler.jsonc
npm run deploy                                    # web export + Worker
npx wrangler secret put SESSION_SECRET  --config worker/wrangler.jsonc
npx wrangler secret put MEMOTI_USERNAME --config worker/wrangler.jsonc
npx wrangler secret put MEMOTI_PASSWORD --config worker/wrangler.jsonc
```

After that, `npm run deploy` ships changes (it exports with `--clear`, because
Metro otherwise reuses bundles with old `EXPO_PUBLIC_*` values). Free limits:
5M rows read / 100k written per day (indexes count as writes); static files
are free. A full TV Time import fits in one day's writes.

The web bundle is public, including the TMDB key; your data is not.

## Data model notes

Two tables. `titles` is one row per TMDB entity; `watch_entries` is one row per
viewing.

- **TV is tracked per episode** — one `watch_entries` row per episode, with a
  partial unique index on `(title_id, season_number, episode_number)` so logging
  the same episode twice is a no-op.
- **Films can be rewatched** — that index is partial (`WHERE season_number IS NOT
  NULL`), so movie rows are exempt and each rewatch is its own row.
- **Ratings live in two places on purpose.** `titles.user_rating` is your overall
  score for the film or show; `watch_entries.rating` is an optional score for one
  particular viewing. Stats use the title-level rating.
- Re-adding a title from search refreshes its cached TMDB metadata but preserves
  `user_rating` and `review`.
- **Watch time is summed from `watch_entries.runtime`**, captured per entry when
  logged — not recomputed from the title. So editing a show's runtime upstream
  won't retroactively change your history. Entries logged when TMDB reported no
  runtime contribute zero, and the Stats screen calls that out rather than
  hiding it.

## Gotchas

- **Pinned to SDK 54 on purpose** (RN 0.81.5). Expo Go pins one SDK per release
  and refuses to load a project built for a newer one, so the SDK here tracks
  whatever Expo Go on the phone supports — not the latest. Check that before
  upgrading, and see `AGENTS.md`: read
  <https://docs.expo.dev/versions/v54.0.0/> rather than the unversioned docs.
- **Only `expo-router` and `expo-sqlite` belong in `plugins`.** `expo-status-bar`
  and `expo-image` ship no config plugin on SDK 54, and listing them makes
  `expo start` fail with `PluginError: Unable to resolve a valid config plugin`.
- **`EXPO_PUBLIC_TMDB_API_KEY` is baked into the bundle** at build time, so the
  key ships inside the app. Fine for a personal build; do not reuse a key you
  care about. `.env` is gitignored.
- Dark theme only. No color-scheme switching is wired up.
- **Web needs cross-origin isolation.** expo-sqlite's web worker uses
  `SharedArrayBuffer`, so the HTML page must be served with
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`. `metro.config.js` adds them in
  dev (SDK 54's dev server serves the page before `server.enhanceMiddleware`, so
  it patches `writeHead`). Any host for `npx expo export --platform web` must
  send both headers itself.
- **Wide layout** (≥768px, i.e. desktop/tablet): left sidebar instead of the
  bottom tab bar, centered content, two-column cards.
- **Inside `<Link asChild>`, pass one style object, never an array** — the slot
  spreads the child's style, and an array turns into `{0: …, 1: …}` and crashes
  on web. Buttons nested in a Link card call `e.preventDefault()` so a click
  doesn't also navigate on web.

## Checks

```bash
npm run typecheck
npm run check        # TV Time parser + up-next logic
```
