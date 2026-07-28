import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { getTitleDetails, TmdbError, type SearchHit } from '../api/tmdb';
import { upsertTitle } from '../db/queries';

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
  const db = useSQLiteContext();
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (hit: SearchHit) => {
      const key = hitKey(hit);
      setPending(key);
      try {
        const details = await getTitleDetails(hit.tmdbId, hit.mediaType);
        const localId = await upsertTitle(db, details);
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
