import type { Db } from './client';

import type {
  AirInfo,
  MediaType,
  NewTitle,
  NewWatchEntry,
  Title,
  TitleWithProgress,
  WatchEntry,
} from './types';

/** `YYYY-MM-DD` in the device's local timezone, not UTC. */
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

const PROGRESS_COLUMNS = `
  COALESCE(e.watch_count, 0)      AS watch_count,
  COALESCE(e.episodes_watched, 0) AS episodes_watched,
  COALESCE(e.minutes_watched, 0)  AS minutes_watched,
  e.last_watched_on,
  e.avg_rating
`;

const PROGRESS_JOIN = `
  LEFT JOIN (
    SELECT
      title_id,
      COUNT(*)                                                AS watch_count,
      COUNT(season_number)                                    AS episodes_watched,
      COALESCE(SUM(runtime), 0)                               AS minutes_watched,
      MAX(watched_on)                                         AS last_watched_on,
      AVG(rating)                                             AS avg_rating
    FROM watch_entries
    GROUP BY title_id
  ) e ON e.title_id = t.id
`;

/**
 * Inserts the title, or refreshes the cached TMDB metadata if it is already
 * saved. Either way it returns the local row id. Preserves user_rating.
 */
export async function upsertTitle(
  db: Db,
  title: NewTitle
): Promise<number> {
  await db.runAsync(
    `INSERT INTO titles
       (tmdb_id, media_type, title, poster_path, backdrop_path, year, overview,
        runtime, total_seasons, total_episodes, genres, user_rating, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (tmdb_id, media_type) DO UPDATE SET
       title          = excluded.title,
       poster_path    = excluded.poster_path,
       backdrop_path  = excluded.backdrop_path,
       year           = excluded.year,
       overview       = excluded.overview,
       runtime        = excluded.runtime,
       total_seasons  = excluded.total_seasons,
       total_episodes = excluded.total_episodes,
       genres         = excluded.genres`,
    title.tmdb_id,
    title.media_type,
    title.title,
    title.poster_path,
    title.backdrop_path,
    title.year,
    title.overview,
    title.runtime,
    title.total_seasons,
    title.total_episodes,
    title.genres,
    title.user_rating,
    new Date().toISOString()
  );

  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM titles WHERE tmdb_id = ? AND media_type = ?',
    title.tmdb_id,
    title.media_type
  );
  if (!row) throw new Error(`Failed to save "${title.title}"`);
  return row.id;
}

export type LibraryFilter = {
  mediaType?: MediaType;
  /** Case-insensitive substring match on the title. */
  search?: string;
  sort?: 'recent' | 'rating' | 'alpha';
};

export async function getLibrary(
  db: Db,
  filter: LibraryFilter = {}
): Promise<TitleWithProgress[]> {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.mediaType) {
    where.push('t.media_type = ?');
    params.push(filter.mediaType);
  }
  if (filter.search?.trim()) {
    where.push('t.title LIKE ?');
    params.push(`%${filter.search.trim()}%`);
  }

  const orderBy =
    filter.sort === 'rating'
      ? 'COALESCE(t.user_rating, e.avg_rating) DESC NULLS LAST, t.title ASC'
      : filter.sort === 'alpha'
        ? 't.title COLLATE NOCASE ASC'
        : 'e.last_watched_on DESC NULLS LAST, t.added_at DESC';

  return db.getAllAsync<TitleWithProgress>(
    `SELECT t.*, ${PROGRESS_COLUMNS}
     FROM titles t
     ${PROGRESS_JOIN}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}`,
    ...params
  );
}

export async function getTitle(
  db: Db,
  id: number
): Promise<TitleWithProgress | null> {
  return db.getFirstAsync<TitleWithProgress>(
    `SELECT t.*, ${PROGRESS_COLUMNS}
     FROM titles t
     ${PROGRESS_JOIN}
     WHERE t.id = ?`,
    id
  );
}

export async function findTitleByTmdbId(
  db: Db,
  tmdbId: number,
  mediaType: MediaType
): Promise<Title | null> {
  return db.getFirstAsync<Title>(
    'SELECT * FROM titles WHERE tmdb_id = ? AND media_type = ?',
    tmdbId,
    mediaType
  );
}

/** tmdb_id set of everything already in the library, for flagging search hits. */
export async function getSavedTmdbIds(
  db: Db
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ tmdb_id: number; media_type: MediaType }>(
    'SELECT tmdb_id, media_type FROM titles'
  );
  return new Set(rows.map((r) => `${r.media_type}:${r.tmdb_id}`));
}

export async function setAirInfo(
  db: Db,
  titleId: number,
  info: AirInfo
): Promise<void> {
  await db.runAsync(
    'UPDATE titles SET air_info = ?, air_checked_at = ? WHERE id = ?',
    JSON.stringify(info),
    new Date().toISOString(),
    titleId
  );
}

/** "Stopped watching" — the show stays in the library but leaves Home. */
export async function setArchived(
  db: Db,
  titleId: number,
  archived: boolean
): Promise<void> {
  await db.runAsync(
    'UPDATE titles SET archived = ? WHERE id = ?',
    archived ? 1 : 0,
    titleId
  );
}

export type HomeShow = TitleWithProgress & {
  /** Furthest watched episode as `packEpisode(s, e)`, or null if none. */
  furthest: number | null;
};

/** Shows still being followed, with how far you've got in each. */
export async function getHomeShows(db: Db): Promise<HomeShow[]> {
  return db.getAllAsync<HomeShow>(
    `SELECT t.*, ${PROGRESS_COLUMNS}, f.furthest
     FROM titles t
     ${PROGRESS_JOIN}
     LEFT JOIN (
       SELECT title_id, MAX(season_number * 10000 + episode_number) AS furthest
       FROM watch_entries
       WHERE season_number > 0
       GROUP BY title_id
     ) f ON f.title_id = t.id
     WHERE t.media_type = 'tv' AND t.archived = 0`
  );
}

/** Dates a film already has a watch on, so a re-import doesn't double them. */
export async function getWatchDates(
  db: Db,
  titleId: number
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ watched_on: string }>(
    'SELECT watched_on FROM watch_entries WHERE title_id = ?',
    titleId
  );
  return new Set(rows.map((r) => r.watched_on));
}

export async function setUserRating(
  db: Db,
  titleId: number,
  rating: number | null
): Promise<void> {
  await db.runAsync(
    'UPDATE titles SET user_rating = ? WHERE id = ?',
    rating,
    titleId
  );
}

/**
 * Saves or clears the written review. Passing empty text clears both the review
 * and its timestamp so "has a review" stays a single check.
 */
export async function setReview(
  db: Db,
  titleId: number,
  review: string
): Promise<void> {
  const trimmed = review.trim();
  await db.runAsync(
    'UPDATE titles SET review = ?, reviewed_at = ? WHERE id = ?',
    trimmed || null,
    trimmed ? new Date().toISOString() : null,
    titleId
  );
}

export async function deleteTitle(
  db: Db,
  titleId: number
): Promise<void> {
  // watch_entries cascade, but only when foreign keys are on for this connection.
  await db.runAsync('DELETE FROM watch_entries WHERE title_id = ?', titleId);
  await db.runAsync('DELETE FROM titles WHERE id = ?', titleId);
}

/**
 * Records a watch. Re-logging an episode is silently ignored (the partial
 * unique index makes it a no-op); movie rewatches insert a new row each time.
 */
export async function logWatch(
  db: Db,
  entry: NewWatchEntry
): Promise<void> {
  await db.runAsync(
    `INSERT INTO watch_entries
       (title_id, watched_on, rating, notes, season_number, episode_number,
        episode_name, runtime, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (title_id, season_number, episode_number)
       WHERE season_number IS NOT NULL DO NOTHING`,
    entry.title_id,
    entry.watched_on,
    entry.rating,
    entry.notes,
    entry.season_number,
    entry.episode_number,
    entry.episode_name,
    entry.runtime,
    new Date().toISOString()
  );
}

/** Logs many episodes in one transaction — used by "mark season watched". */
export async function logEpisodes(
  db: Db,
  entries: NewWatchEntry[]
): Promise<void> {
  if (!entries.length) return;
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await logWatch(db, entry);
    }
  });
}

export async function unlogEpisode(
  db: Db,
  titleId: number,
  season: number,
  episode: number
): Promise<void> {
  await db.runAsync(
    `DELETE FROM watch_entries
     WHERE title_id = ? AND season_number = ? AND episode_number = ?`,
    titleId,
    season,
    episode
  );
}

export async function deleteEntry(
  db: Db,
  entryId: number
): Promise<void> {
  await db.runAsync('DELETE FROM watch_entries WHERE id = ?', entryId);
}

export async function getEntriesForTitle(
  db: Db,
  titleId: number
): Promise<WatchEntry[]> {
  return db.getAllAsync<WatchEntry>(
    `SELECT * FROM watch_entries
     WHERE title_id = ?
     ORDER BY season_number NULLS FIRST, episode_number, watched_on DESC`,
    titleId
  );
}

/** `"S1E4"` keys for every logged episode of a show. */
export async function getWatchedEpisodeKeys(
  db: Db,
  titleId: number
): Promise<Set<string>> {
  const rows = await db.getAllAsync<{
    season_number: number;
    episode_number: number;
  }>(
    `SELECT season_number, episode_number FROM watch_entries
     WHERE title_id = ? AND season_number IS NOT NULL`,
    titleId
  );
  return new Set(rows.map((r) => `S${r.season_number}E${r.episode_number}`));
}

export type Stats = {
  movies: number;
  shows: number;
  episodes: number;
  movieWatches: number;
  minutes: number;
  movieMinutes: number;
  tvMinutes: number;
  ratedCount: number;
  reviewedCount: number;
  avgRating: number | null;
  byMonth: { month: string; count: number }[];
  topGenres: { genre: string; count: number }[];
};

export async function getStats(db: Db): Promise<Stats> {
  const counts = await db.getFirstAsync<{
    movies: number;
    shows: number;
  }>(
    `SELECT
       SUM(media_type = 'movie') AS movies,
       SUM(media_type = 'tv')    AS shows
     FROM titles`
  );

  const entries = await db.getFirstAsync<{
    episodes: number;
    movie_watches: number;
    minutes: number;
  }>(
    `SELECT
       COUNT(season_number)                       AS episodes,
       COUNT(*) - COUNT(season_number)            AS movie_watches,
       COALESCE(SUM(runtime), 0)                  AS minutes
     FROM watch_entries`
  );

  const ratings = await db.getFirstAsync<{
    rated: number;
    reviewed: number;
    avg: number | null;
  }>(
    `SELECT
       COUNT(user_rating) AS rated,
       COUNT(review)      AS reviewed,
       AVG(user_rating)   AS avg
     FROM titles`
  );

  // Split time by media type so the stats screen can break the total down.
  const split = await db.getFirstAsync<{
    movie_minutes: number;
    tv_minutes: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN t.media_type = 'movie' THEN w.runtime END), 0) AS movie_minutes,
       COALESCE(SUM(CASE WHEN t.media_type = 'tv'    THEN w.runtime END), 0) AS tv_minutes
     FROM watch_entries w
     JOIN titles t ON t.id = w.title_id`
  );

  const byMonth = await db.getAllAsync<{ month: string; count: number }>(
    `SELECT substr(watched_on, 1, 7) AS month, COUNT(*) AS count
     FROM watch_entries
     GROUP BY month
     ORDER BY month DESC
     LIMIT 12`
  );

  const genreRows = await db.getAllAsync<{ genres: string | null }>(
    `SELECT genres FROM titles WHERE genres IS NOT NULL`
  );
  const tally = new Map<string, number>();
  for (const row of genreRows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.genres ?? '[]');
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const genre of parsed) {
      if (typeof genre !== 'string') continue;
      tally.set(genre, (tally.get(genre) ?? 0) + 1);
    }
  }
  const topGenres = [...tally.entries()]
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    movies: counts?.movies ?? 0,
    shows: counts?.shows ?? 0,
    episodes: entries?.episodes ?? 0,
    movieWatches: entries?.movie_watches ?? 0,
    minutes: entries?.minutes ?? 0,
    movieMinutes: split?.movie_minutes ?? 0,
    tvMinutes: split?.tv_minutes ?? 0,
    ratedCount: ratings?.rated ?? 0,
    reviewedCount: ratings?.reviewed ?? 0,
    avgRating: ratings?.avg ?? null,
    byMonth: byMonth.reverse(),
    topGenres,
  };
}
