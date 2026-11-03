import type { AirInfo } from './db/types';

/** Season/episode packed into one sortable number, as stored by the Home query. */
export const packEpisode = (s: number, e: number) => s * 10000 + e;

export type UpNext = {
  /** First aired episode after the furthest one you have watched. */
  next: { s: number; e: number } | null;
  /** Aired episodes after the furthest one you have watched. */
  remaining: number;
  /** The latest episode aired recently and after your last watch: it just dropped. */
  isNew: boolean;
};

/**
 * Where you are in a show. Progress is "furthest episode watched", the way a
 * tracker reads it: skipping S1 and starting at S2 doesn't leave S1 as up next.
 *
 * Aired counts come from TMDB's season episode counts, capped at the last
 * episode to air. That season's later episodes are announced but not out yet.
 */
export function upNext(
  info: AirInfo | null,
  furthest: number | null,
  lastWatchedOn: string | null,
  /**
   * `YYYY-MM-DD`; only episodes aired on or after this count as new. Without a
   * window, every show you fell behind on years ago would read as "new".
   */
  newSince: string
): UpNext {
  const last = info?.last;
  if (!info || !last) return { next: null, remaining: 0, isNew: false };

  let next: UpNext['next'] = null;
  let remaining = 0;
  for (const season of [...info.seasons].sort((a, b) => a.n - b.n)) {
    if (season.n > last.s) break;
    const aired = season.n === last.s ? last.e : season.count;
    for (let e = 1; e <= aired; e++) {
      if (furthest !== null && packEpisode(season.n, e) <= furthest) continue;
      remaining++;
      next ??= { s: season.n, e };
    }
  }

  const isNew =
    remaining > 0 &&
    lastWatchedOn !== null &&
    last.date !== null &&
    last.date > lastWatchedOn &&
    last.date >= newSince;

  return { next, remaining, isNew };
}

/** `S02E05` */
export function episodeCode(s: number, e: number): string {
  return `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
}
