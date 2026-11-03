import * as SecureStore from 'expo-secure-store';
import { useSQLiteContext } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export type Param = string | number | null;

/**
 * The slice of expo-sqlite's API the queries use. The on-device SQLite
 * database satisfies it as is, and so does the Memoti API (Cloudflare D1).
 */
export type Db = {
  getAllAsync<T>(sql: string, ...params: Param[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: Param[]): Promise<T | null>;
  runAsync(sql: string, ...params: Param[]): Promise<unknown>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
};

/** e.g. `https://memoti.example.workers.dev/api`; unset = data stays on the device. */
const apiUrl = process.env.EXPO_PUBLIC_MEMOTI_API_URL;

// --- session ------------------------------------------------------------
// A signed token from /api/login, kept in the Keychain/Keystore on phones and
// localStorage on the web (SecureStore has no web implementation).

const SESSION_KEY = 'memoti.session';
const saved =
  Platform.OS === 'web'
    ? {
        get: async () => {
          try {
            return localStorage.getItem(SESSION_KEY);
          } catch {
            return null;
          }
        },
        set: async (token: string | null) => {
          try {
            if (token) localStorage.setItem(SESSION_KEY, token);
            else localStorage.removeItem(SESSION_KEY);
          } catch {}
        },
      }
    : {
        get: () => SecureStore.getItemAsync(SESSION_KEY),
        set: (token: string | null) =>
          token
            ? SecureStore.setItemAsync(SESSION_KEY, token)
            : SecureStore.deleteItemAsync(SESSION_KEY),
      };

export type SessionState = 'loading' | 'signedIn' | 'signedOut';
let token: string | null = null;
let state: SessionState = 'loading';
const listeners = new Set<() => void>();

function publish(next: string | null) {
  token = next;
  state = next ? 'signedIn' : 'signedOut';
  listeners.forEach((listener) => listener());
}

function setSession(next: string | null) {
  publish(next);
  saved.set(next).catch(() => undefined);
}

if (apiUrl) saved.get().then(publish, () => publish(null));

export function useSession(): SessionState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state
  );
}

export async function signIn(username: string, password: string): Promise<void> {
  const res = await fetch(`${apiUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.token !== 'string') {
    throw new Error(body?.error ?? `Sign-in failed (${res.status})`);
  }
  setSession(body.token);
}

export function signOut(): void {
  setSession(null);
}

// --- remote database ----------------------------------------------------

type Statement = { sql: string; params: Param[] };
type StatementResult = { rows: unknown[] };

/**
 * Talks to worker/index.js. D1 has no interactive transactions, so inside
 * withTransactionAsync writes are queued and sent as one atomic batch; that
 * only works for write-only transactions, which is all the queries use.
 */
function createRemoteDb(url: string): Db {
  const send = async (statements: Statement[]): Promise<StatementResult[]> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ statements }),
    });
    // Expired or revoked session: back to the sign-in screen.
    if (res.status === 401) setSession(null);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? `Memoti API error ${res.status}`);
    return body;
  };
  // D1 rejects undefined binds; SQLite would have stored NULL.
  const clean = (params: Param[]) => params.map((p) => p ?? null);
  const one = async (sql: string, params: Param[]) =>
    (await send([{ sql, params: clean(params) }]))[0];

  let queued: Statement[] | null = null;
  return {
    async getAllAsync<T>(sql: string, ...params: Param[]) {
      return (await one(sql, params)).rows as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: Param[]) {
      return ((await one(sql, params)).rows[0] as T | undefined) ?? null;
    },
    async runAsync(sql: string, ...params: Param[]) {
      if (queued) queued.push({ sql, params: clean(params) });
      else await one(sql, params);
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      if (queued) return fn(); // already inside one: join it
      queued = [];
      try {
        await fn();
        const batch = queued;
        queued = null;
        if (batch.length) await send(batch);
      } finally {
        queued = null;
      }
    },
  };
}

/** Set when .env points at the Memoti API; otherwise data stays on the device. */
export const remoteDb = apiUrl ? createRemoteDb(`${apiUrl}/query`) : null;

export const useDb: () => Db = remoteDb ? () => remoteDb : useSQLiteContext;
