/**
 * Reads a TV Time GDPR export (the CSVs from "Request my data") into plain
 * watch history. Pure, so `scripts/check-tvtime.mjs` can exercise it in Node.
 *
 * Files used, by name — any others are ignored:
 *   tracking-prod-records-v2.csv  episode watches (s_id = TVDB show id)
 *   tracking-prod-records.csv     older records: episode and movie watches
 *   followed_tv_show.csv          followed shows, with the archived flag
 *   memoti-matches.csv            optional, yours: name,tmdb_id,type rows that
 *                                 pin titles TMDB search can't find (type is
 *                                 movie or tv; only needed for a film TV Time
 *                                 filed as a show). name is as the import's
 *                                 "Not found" list shows it.
 *
 * Several columns come in pairs (season_number / s_no, watch_date /
 * created_at); whichever is filled wins.
 */

export type ImportEpisode = { s: number; e: number; date: string };

export type ImportShow = {
  /** TVDB id, as TV Time stores it. */
  tvdbId: string;
  name: string;
  /** Stopped watching in TV Time. */
  archived: boolean;
  episodes: ImportEpisode[];
};

export type ImportMovie = { name: string; year: number | null; dates: string[] };

export type ImportMatch = { tmdbId: number; type: 'movie' | 'tv' | null };

export type TvTimeExport = {
  shows: ImportShow[];
  movies: ImportMovie[];
  /** Pinned TMDB matches, by "Not found" label. */
  matches: Record<string, ImportMatch>;
};

/** How a title reads in the import's "Not found" list, and the matches key. */
export const importLabel = (item: ImportShow | ImportMovie) =>
  'tvdbId' in item ? item.name || `TVDB ${item.tvdbId}` : item.name;

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') field += src[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const truthy = (v: string | undefined) => /^(1|true|t|yes)$/i.test(v?.trim() ?? '');

/**
 * Any TV Time timestamp to a local `YYYY-MM-DD`. Naive date-times are taken as
 * UTC, which is how the export writes them.
 */
export function toDay(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  let d: Date;
  if (/^\d{9,13}$/.test(v)) d = new Date(Number(v) * (v.length <= 10 ? 1000 : 1));
  else {
    const iso = v.replace(' ', 'T');
    const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso);
    d = new Date(naive ? `${iso}Z` : iso);
  }
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `files` maps file name to its text. */
export function extractTvTime(files: Record<string, string>): TvTimeExport {
  const shows = new Map<string, ImportShow & { seen: Map<string, ImportEpisode> }>();
  const movies = new Map<string, ImportMovie>();

  const show = (tvdbId: string, name: string) => {
    let entry = shows.get(tvdbId);
    if (!entry) {
      entry = { tvdbId, name, archived: false, episodes: [], seen: new Map() };
      shows.set(tvdbId, entry);
    }
    if (!entry.name && name) entry.name = name;
    return entry;
  };

  const addEpisode = (
    tvdbId: string | undefined,
    name: string,
    s: number | null,
    e: number | null,
    date: string | null
  ) => {
    // Specials (season 0) and rows without a position are follows, not watches.
    if (!tvdbId?.trim() || s === null || e === null || s <= 0 || e <= 0) return;
    const entry = show(tvdbId.trim(), name);
    const key = `${s}:${e}`;
    const day = date ?? '1970-01-01';
    const prev = entry.seen.get(key);
    // Rewatches collapse into the first watch: an episode is watched or not.
    if (!prev || day < prev.date) entry.seen.set(key, { s, e, date: day });
  };

  for (const r of parseCsv(files['followed_tv_show.csv'] ?? '')) {
    if (!r.tv_show_id?.trim()) continue;
    show(r.tv_show_id.trim(), r.tv_show_name ?? '').archived = truthy(r.archived);
  }

  for (const r of parseCsv(files['tracking-prod-records-v2.csv'] ?? '')) {
    if (truthy(r.is_special)) continue;
    addEpisode(
      r.s_id,
      r.series_name ?? '',
      num(r.season_number) ?? num(r.s_no),
      num(r.episode_number) ?? num(r.ep_no),
      toDay(r.created_at) ?? toDay(r.updated_at)
    );
  }

  for (const r of parseCsv(files['tracking-prod-records.csv'] ?? '')) {
    // This file mixes real watches ('watch', 'rewatch') with follows, the
    // 'towatch' list, and counters ('rewatch_count', 'last-episode-watched',
    // 'count-watch-…'). Only the first two are viewings.
    if (!/^(watch|rewatch)$/.test(r.type?.trim() ?? '')) continue;
    const date = toDay(r.watch_date) ?? toDay(r.created_at);
    if (r.movie_name?.trim()) {
      const year = num(r.release_date?.slice(0, 4));
      const key = `${r.movie_name.trim().toLowerCase()}|${year ?? ''}`;
      const movie = movies.get(key) ?? { name: r.movie_name.trim(), year, dates: [] };
      const day = date ?? '1970-01-01';
      if (!movie.dates.includes(day)) movie.dates.push(day);
      movies.set(key, movie);
    } else {
      addEpisode(
        r.series_id,
        r.series_name ?? '',
        num(r.season_number),
        num(r.episode_number),
        date
      );
    }
  }

  const matches: Record<string, ImportMatch> = {};
  for (const r of parseCsv(files['memoti-matches.csv'] ?? '')) {
    const tmdbId = num(r.tmdb_id);
    const type = r.type?.trim();
    if (!r.name?.trim() || !tmdbId) continue;
    matches[r.name.trim()] = { tmdbId, type: type === 'movie' || type === 'tv' ? type : null };
  }

  return {
    matches,
    shows: [...shows.values()].map(({ seen, ...rest }) => ({
      ...rest,
      episodes: [...seen.values()],
    })),
    movies: [...movies.values()],
  };
}
