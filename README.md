# Memoti

A phone app for tracking the films and TV shows you have watched. Local-first —
everything lives in SQLite on the device; metadata comes from TMDB.

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

## How it works

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
  _layout.tsx            SQLiteProvider + stack, runs migrations on boot
  (tabs)/                library, explore, search, stats
  title/[id].tsx         detail, rating, review, episode tracker
  person/[id].tsx        actor/director credits
  log/[id].tsx           modal: log a watch on a past date
  review/[id].tsx        modal: write a rating + review
src/
  api/tmdb.ts            TMDB client (search, feeds, genres, people)
  db/schema.ts           migrations (bump LATEST_VERSION to change the schema)
  db/queries.ts          all SQL lives here
  hooks/useDbQuery.ts    read + refetch on screen focus
  hooks/useAddTitle.ts   shared "tap a result to save it" behaviour
  components/            Poster, TitleCard, RatingPicker, FadeIn, Tappable
  theme.ts               palette, spacing, formatters
```

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

## Checks

```bash
npm run typecheck
```
