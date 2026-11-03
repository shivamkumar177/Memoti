import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import {
  getShowAirInfo,
  getTitleDetails,
  TmdbError,
  type SearchHit,
} from '../api/tmdb';
import { useDb } from '../db/client';
import { findTitleByTmdbId, setAirInfo, upsertTitle } from '../db/queries';

type Result = {
  /** Fetches full metadata, saves the title, then opens its detail screen. */
  add: (hit: SearchHit) => Promise<void>;
  /** `mediaType:tmdbId` of the title currently being added, if any. */
  pending: string | null;
  error: string | null;
  clearError: () => void;
};

export function hitKey(hit: Pick<SearchHit, 'mediaType' | 'tmdbId'>): string {
  return `${hit.mediaType}:${hit.tmdbId}`;
}

/**
 * Shared "tap a TMDB result to save it" behaviour. Used by Search, Explore and
 * the person credits screen so all three behave identically.
 */
export function useAddTitle(): Result {
  const db = useDb();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (hit: SearchHit) => {
      // Already saved: open it straight from the database and refresh the
      // cached metadata in the background, instead of waiting on TMDB.
      const existing = await findTitleByTmdbId(db, hit.tmdbId, hit.mediaType);
      if (existing) {
        router.push(`/title/${existing.id}`);
        getTitleDetails(hit.tmdbId, hit.mediaType)
          .then((details) => upsertTitle(db, details))
          .catch(() => {});
        return;
      }

      const key = hitKey(hit);
      setPending(key);
      try {
        const details = await getTitleDetails(hit.tmdbId, hit.mediaType);
        const localId = await upsertTitle(db, details);
        // Same /tv/{id} response from the request cache, so a new show lands
        // on Home straight away instead of after the next refresh.
        if (hit.mediaType === 'tv') {
          await setAirInfo(db, localId, await getShowAirInfo(hit.tmdbId));
        }
        router.push(`/title/${localId}`);
      } catch (e) {
        setError(
          e instanceof TmdbError ? e.message : `Could not add ${hit.title}.`
        );
      } finally {
        setPending(null);
      }
    },
    [db, router]
  );

  return {
    add,
    pending,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
