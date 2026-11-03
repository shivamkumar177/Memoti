export type MediaType = 'movie' | 'tv';

/** A film or show the user has in their library. One row per TMDB entity. */
export type Title = {
  id: number;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  year: number | null;
  overview: string | null;
  runtime: number | null;
  total_seasons: number | null;
  total_episodes: number | null;
  genres: string | null;
  /** The user's overall score for the title, 1–10. Separate from per-watch ratings. */
  user_rating: number | null;
  /** Free-text review of the whole title. */
  review: string | null;
  reviewed_at: string | null;
  added_at: string;
  /** Shows only: JSON `AirInfo` cached from TMDB, refreshed by the Home screen. */
  air_info: string | null;
  air_checked_at: string | null;
  /** 1 when the user stopped watching; keeps the show off Home. */
  archived: number;
};

/** An aired (or announced) episode position. */
export type AirEpisode = {
  s: number;
  e: number;
  date: string | null;
  name: string | null;
  runtime: number | null;
};

export type AirInfo = {
  /** TMDB status, e.g. "Returning Series", "Ended". */
  status: string | null;
  /** Episode count per season, specials excluded. */
  seasons: { n: number; count: number }[];
  last: AirEpisode | null;
  next: AirEpisode | null;
};

/**
 * A single viewing. Movies get one row per watch (so rewatches stack up);
 * TV gets one row per episode, with season/episode set.
 */
export type WatchEntry = {
  id: number;
  title_id: number;
  watched_on: string;
  rating: number | null;
  notes: string | null;
  season_number: number | null;
  episode_number: number | null;
  episode_name: string | null;
  runtime: number | null;
  created_at: string;
};

/** A library row joined with the aggregates the list and detail screens need. */
export type TitleWithProgress = Title & {
  watch_count: number;
  episodes_watched: number;
  last_watched_on: string | null;
  avg_rating: number | null;
  /** Summed runtime of every logged watch for this title, in minutes. */
  minutes_watched: number;
};

/**
 * A title as TMDB describes it. Reviews are user-authored and never arrive from
 * the API, so they are not part of the insert shape — the columns default to
 * NULL and `upsertTitle` leaves them alone.
 */
export type NewTitle = Omit<
  Title,
  | 'id'
  | 'added_at'
  | 'review'
  | 'reviewed_at'
  | 'air_info'
  | 'air_checked_at'
  | 'archived'
>;

export type NewWatchEntry = Omit<WatchEntry, 'id' | 'created_at'>;
