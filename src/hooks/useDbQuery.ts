import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { useDb, type Db } from '../db/client';

type Result<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
};

/**
 * Runs a read against the database and re-runs it whenever the screen regains
 * focus, so navigating back from a detail screen shows fresh data. `reload`
 * covers in-screen mutations.
 */
export function useDbQuery<T>(
  run: (db: Db) => Promise<T>,
  deps: readonly unknown[] = []
): Result<T> {
  const db = useDb();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Kept in a ref so an inline `run` closure doesn't retrigger the effect.
  const runRef = useRef(run);
  runRef.current = run;

  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await runRef.current(db);
      if (!aliveRef.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [db, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      aliveRef.current = true;
      void load();
      return () => {
        aliveRef.current = false;
      };
    }, [load])
  );

  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload };
}
