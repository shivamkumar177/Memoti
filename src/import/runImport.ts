
import {
  findByName,
  findTvByTvdbId,
  getShowAirInfo,
  getTitleDetails,
  mapWithLimit,
} from '../api/tmdb';
import type { Db } from '../db/client';
import {
  getWatchDates,
  logEpisodes,
  logWatch,
  setAirInfo,
  setArchived,
  upsertTitle,
} from '../db/queries';
import { importLabel, type TvTimeExport } from './tvtime';

export type ImportProgress = { done: number; total: number; current: string };

export type ImportSummary = {
  shows: number;
  episodes: number;
  movies: number;
  movieWatches: number;
  /** Titles TMDB had no match for. */
  unmatched: string[];
};

/**
 * Matches every show and film against TMDB and writes the history. Safe to run
 * twice: episodes dedupe on the unique index and film watches on their date.
 *
 * TMDB lookups run 6 at a time; database writes are queued one at a time,
 * because a single connection can't hold overlapping transactions.
 */
export async function importTvTime(
  db: Db,
  data: TvTimeExport,
  onProgress: (p: ImportProgress) => void
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    shows: 0,
    episodes: 0,
    movies: 0,
    movieWatches: 0,
    unmatched: [],
  };
  const total = data.shows.length + data.movies.length;
  let done = 0;
  const tick = (current: string) => onProgress({ done: ++done, total, current });

  let queue: Promise<unknown> = Promise.resolve();
  const write = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  await mapWithLimit(data.shows, 6, async (show) => {
    const label = importLabel(show);
    try {
      const pinned = data.matches[label];
      // TV Time files some films as shows; a pinned film just joins the library.
      if (pinned?.type === 'movie') {
        const details = await getTitleDetails(pinned.tmdbId, 'movie');
        await write(() => upsertTitle(db, details));
        summary.movies++;
        return;
      }
      const tmdbId =
        pinned?.tmdbId ??
        (await findTvByTvdbId(show.tvdbId).catch(() => null)) ??
        (show.name ? await findByName('tv', show.name) : null);
      if (!tmdbId) {
        summary.unmatched.push(label);
        return;
      }
      // Same /tv/{id} response, served from the request cache the second time.
      const [details, info] = await Promise.all([
        getTitleDetails(tmdbId, 'tv'),
        getShowAirInfo(tmdbId),
      ]);
      const runtime = details.runtime ?? info.last?.runtime ?? null;
      await write(async () => {
        const titleId = await upsertTitle(db, details);
        await setArchived(db, titleId, show.archived);
        await setAirInfo(db, titleId, info);
        await logEpisodes(
          db,
          show.episodes.map((ep) => ({
            title_id: titleId,
            watched_on: ep.date,
            rating: null,
            notes: null,
            season_number: ep.s,
            episode_number: ep.e,
            episode_name: null,
            runtime,
          }))
        );
      });
      summary.shows++;
      summary.episodes += show.episodes.length;
    } catch {
      summary.unmatched.push(label);
    } finally {
      tick(show.name);
    }
  });

  await mapWithLimit(data.movies, 6, async (movie) => {
    try {
      const tmdbId =
        data.matches[importLabel(movie)]?.tmdbId ??
        (await findByName('movie', movie.name, movie.year));
      if (!tmdbId) {
        summary.unmatched.push(movie.name);
        return;
      }
      const details = await getTitleDetails(tmdbId, 'movie');
      await write(async () => {
        const titleId = await upsertTitle(db, details);
        const existing = await getWatchDates(db, titleId);
        for (const date of movie.dates) {
          if (existing.has(date)) continue;
          await logWatch(db, {
            title_id: titleId,
            watched_on: date,
            rating: null,
            notes: null,
            season_number: null,
            episode_number: null,
            episode_name: null,
            runtime: details.runtime,
          });
          summary.movieWatches++;
        }
      });
      summary.movies++;
    } catch {
      summary.unmatched.push(movie.name);
    } finally {
      tick(movie.name);
    }
  });

  return summary;
}

/**
 * Web only: opens the file picker and resolves file name → text, or null if the
 * user cancels. Picking the whole export folder's files is fine; unknown names
 * are ignored downstream.
 */
export function pickCsvFiles(): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.csv,text/csv';
    // Attached while open: some browsers (Safari) ignore click() on a detached input.
    input.style.display = 'none';
    document.body.appendChild(input);
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    input.onchange = async () => {
      input.remove();
      const files = Array.from(input.files ?? []);
      if (!files.length) return resolve(null);
      const entries = await Promise.all(
        files.map(async (f) => [f.name, await f.text()] as const)
      );
      resolve(Object.fromEntries(entries));
    };
    input.click();
  });
}
