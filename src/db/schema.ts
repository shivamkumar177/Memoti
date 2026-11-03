import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'memoti.db';

/**
 * Ordered schema steps. Step N takes the database from user_version N to N+1.
 * To change the schema, append a step — never edit one that has shipped.
 */
export const MIGRATIONS: string[] = [
  // 0 → 1
  `
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
  `,
  // 1 → 2
  `
  ALTER TABLE titles ADD COLUMN review TEXT;
  ALTER TABLE titles ADD COLUMN reviewed_at TEXT;
  `,
  // 2 → 3: airing state for Home (up next / new episodes) and "stopped watching".
  `
  ALTER TABLE titles ADD COLUMN air_info TEXT;
  ALTER TABLE titles ADD COLUMN air_checked_at TEXT;
  ALTER TABLE titles ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
  `,
];

/**
 * Runs pending migrations. Passed to <SQLiteProvider onInit>, so it is the only
 * place that touches DDL — screens never create tables.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  // Per-connection setting, so it has to run on every launch, not only when
  // there is something to migrate.
  await db.execAsync('PRAGMA foreign_keys = ON');

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const current = row?.user_version ?? 0;
  if (current >= MIGRATIONS.length) return;

  await db.execAsync('PRAGMA journal_mode = WAL');

  // Each step commits together with its version bump, so a crash mid-way
  // resumes at the step that failed instead of re-running finished ones.
  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
