import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'memoti.db';

/** Bump this and add a matching block below when the schema changes. */
const LATEST_VERSION = 2;

/**
 * Runs pending migrations. Passed to <SQLiteProvider onInit>, so it is the only
 * place that touches DDL — screens never create tables.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  let version = row?.user_version ?? 0;

  if (version >= LATEST_VERSION) return;

  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE titles (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        tmdb_id        INTEGER NOT NULL,
        media_type     TEXT    NOT NULL CHECK (media_type IN ('movie', 'tv')),
        title          TEXT    NOT NULL,
        poster_path    TEXT,
        backdrop_path  TEXT,
        year           INTEGER,
        overview       TEXT,
        runtime        INTEGER,
        total_seasons  INTEGER,
        total_episodes INTEGER,
        genres         TEXT,
        user_rating    INTEGER CHECK (user_rating IS NULL OR user_rating BETWEEN 1 AND 10),
        added_at       TEXT    NOT NULL,
        UNIQUE (tmdb_id, media_type)
      );

      CREATE TABLE watch_entries (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title_id       INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
        watched_on     TEXT    NOT NULL,
        rating         INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 10),
        notes          TEXT,
        season_number  INTEGER,
        episode_number INTEGER,
        episode_name   TEXT,
        runtime        INTEGER,
        created_at     TEXT    NOT NULL
      );

      CREATE INDEX idx_entries_title   ON watch_entries (title_id);
      CREATE INDEX idx_entries_watched ON watch_entries (watched_on DESC);

      -- An episode is either watched or not, so logging it twice is a no-op.
      -- Movies are exempt from this so rewatches can accumulate.
      CREATE UNIQUE INDEX idx_entries_episode
        ON watch_entries (title_id, season_number, episode_number)
        WHERE season_number IS NOT NULL;
    `);
    version = 1;
  }

  // Blocks run in sequence, so a fresh database walks through every step.
  if (version === 1) {
    await db.execAsync(`
      ALTER TABLE titles ADD COLUMN review TEXT;
      ALTER TABLE titles ADD COLUMN reviewed_at TEXT;
    `);
    version = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${version}`);
}
