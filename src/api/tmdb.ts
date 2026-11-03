import type { AirInfo, MediaType, NewTitle } from '../db/types';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * Read at module load. EXPO_PUBLIC_* vars are inlined into the bundle at build
 * time, so this key ships inside the app — fine for a personal build, but it is
 * not a secret. Put it in .env (see .env.example).
 */
const API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;

export const hasApiKey = Boolean(API_KEY);

export class TmdbError extends Error {}

/**
 * In-flight and recent responses, keyed by URL. Makes retyping a search,
 * reopening a title, and the several screens that read `/tv/{id}` instant, and
 * collapses duplicate concurrent requests into one.
 */
// ponytail: unbounded per-session cache, add eviction if a session ever grows huge.
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();
const CACHE_MS = 10 * 60 * 1000;

function request<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  if (!API_KEY) {
    return Promise.reject(
      new TmdbError(
        'No TMDB API key. Add EXPO_PUBLIC_TMDB_API_KEY to .env and restart the bundler.'
      )
    );
  }

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api_key', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise as Promise<T>;

  const promise = fetchJson<T>(key);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new TmdbError('Could not reach TMDB. Check your connection.');
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new TmdbError('TMDB rejected the API key.');
    }
    if (response.status === 429) {
      throw new TmdbError('Rate limited by TMDB. Try again in a moment.');
    }
    throw new TmdbError(`TMDB request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

/** Poster/backdrop URL, or null when TMDB has no image for the title. */
export function imageUrl(
  path: string | null | undefined,
  size: 'w154' | 'w342' | 'w500' | 'original' = 'w342'
): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

export type SearchHit = {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  overview: string | null;
  popularity: number;
};

type RawSearchResult = {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  popularity?: number;
};

function parseYear(date: string | undefined): number | null {
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** Multi-search, with people and other non-watchable results dropped. */
export async function searchTitles(query: string): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const data = await request<{ results: RawSearchResult[] }>('/search/multi', {
    query: trimmed,
    include_adult: 'false',
  });

  return data.results
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) => ({
      tmdbId: r.id,
      mediaType: r.media_type as MediaType,
      title: r.title ?? r.name ?? 'Untitled',
      year: parseYear(r.release_date ?? r.first_air_date),
      posterPath: r.poster_path ?? null,
      overview: r.overview?.trim() || null,
      popularity: r.popularity ?? 0,
    }))
    .sort((a, b) => b.popularity - a.popularity);
}

type RawDetails = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  genres?: { id: number; name: string }[];
  seasons?: RawSeason[];
  status?: string;
  last_episode_to_air?: RawAirEpisode | null;
  next_episode_to_air?: RawAirEpisode | null;
};

type RawAirEpisode = {
  season_number: number;
  episode_number: number;
  air_date?: string | null;
  name?: string;
  runtime?: number | null;
};

type RawSeason = {
  season_number: number;
  episode_count: number;
  name: string;
};

/** Full metadata for one title, shaped for direct insertion into `titles`. */
export async function getTitleDetails(
  tmdbId: number,
  mediaType: MediaType
): Promise<NewTitle> {
  const data = await request<RawDetails>(`/${mediaType}/${tmdbId}`);

  // Movies report `runtime`; shows report a per-episode runtime array.
  const runtime =
    mediaType === 'movie'
      ? (data.runtime ?? null)
      : (data.episode_run_time?.[0] ?? null);

  return {
    tmdb_id: data.id,
    media_type: mediaType,
    title: data.title ?? data.name ?? 'Untitled',
    poster_path: data.poster_path ?? null,
    backdrop_path: data.backdrop_path ?? null,
    year: parseYear(data.release_date ?? data.first_air_date),
    overview: data.overview?.trim() || null,
    runtime,
    total_seasons: data.number_of_seasons ?? null,
    total_episodes: data.number_of_episodes ?? null,
    genres: data.genres?.length
      ? JSON.stringify(data.genres.map((g) => g.name))
      : null,
    user_rating: null,
  };
}

export type Season = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
};

/** Season list for a show, with season 0 (specials) dropped. */
export async function getSeasons(tmdbId: number): Promise<Season[]> {
  const data = await request<RawDetails>(`/tv/${tmdbId}`);
  return (data.seasons ?? [])
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .map((s) => ({
      seasonNumber: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
    }));
}

/**
 * Where a show's airing stands: per-season episode counts plus the last and
 * next episode to air. One request per show, enough to work out "up next" and
 * "new episode" without fetching every season.
 */
export async function getShowAirInfo(tmdbId: number): Promise<AirInfo> {
  const data = await request<RawDetails>(`/tv/${tmdbId}`);
  const ep = (raw: RawAirEpisode | null | undefined) =>
    raw && raw.season_number > 0
      ? {
          s: raw.season_number,
          e: raw.episode_number,
          date: raw.air_date ?? null,
          name: raw.name?.trim() || null,
          runtime: raw.runtime ?? null,
        }
      : null;
  return {
    status: data.status ?? null,
    seasons: (data.seasons ?? [])
      .filter((s) => s.season_number > 0 && s.episode_count > 0)
      .map((s) => ({ n: s.season_number, count: s.episode_count })),
    last: ep(data.last_episode_to_air),
    next: ep(data.next_episode_to_air),
  };
}

/** TMDB id for a show given its TVDB id (what TV Time exports use), or null. */
export async function findTvByTvdbId(tvdbId: string): Promise<number | null> {
  const data = await request<{ tv_results?: { id: number }[] }>(
    `/find/${tvdbId}`,
    { external_source: 'tvdb_id' }
  );
  return data.tv_results?.[0]?.id ?? null;
}

/** Best TMDB match for a title by name, optionally pinned to a year. */
export async function findByName(
  mediaType: MediaType,
  name: string,
  year?: number | null
): Promise<number | null> {
  const params: Record<string, string> = { query: name, include_adult: 'false' };
  if (year) {
    params[mediaType === 'movie' ? 'primary_release_year' : 'first_air_date_year'] =
      String(year);
  }
  const data = await request<{ results: { id: number }[] }>(
    `/search/${mediaType}`,
    params
  );
  if (data.results[0]) return data.results[0].id;
  return year ? findByName(mediaType, name) : null;
}

/** Runs `fn` over `items` with at most `limit` in flight, to stay under TMDB's rate limit. */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

/**
 * Every episode of a show, across all seasons. Season requests run in parallel;
 * a season that fails is skipped rather than failing the whole call, so "mark
 * show watched" still works when one season is unavailable.
 */
export async function getAllEpisodes(tmdbId: number): Promise<Episode[]> {
  const seasons = await getSeasons(tmdbId);
  const results = await Promise.all(
    seasons.map((season) =>
      getEpisodes(tmdbId, season.seasonNumber).catch(() => [] as Episode[])
    )
  );
  return results.flat();
}

export type Episode = {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string | null;
  runtime: number | null;
  overview: string | null;
};

export async function getEpisodes(
  tmdbId: number,
  seasonNumber: number
): Promise<Episode[]> {
  const data = await request<{
    episodes?: {
      season_number: number;
      episode_number: number;
      name?: string;
      air_date?: string | null;
      runtime?: number | null;
      overview?: string;
    }[];
  }>(`/tv/${tmdbId}/season/${seasonNumber}`);

  return (data.episodes ?? []).map((e) => ({
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    name: e.name?.trim() || `Episode ${e.episode_number}`,
    airDate: e.air_date ?? null,
    runtime: e.runtime ?? null,
    overview: e.overview?.trim() || null,
  }));
}

/**
 * Maps a TMDB list payload to SearchHits. `fallbackType` covers the endpoints
 * that omit `media_type` because the type is implied by the path (for example
 * /movie/now_playing).
 */
function mapResults(
  results: RawSearchResult[],
  fallbackType?: MediaType
): SearchHit[] {
  return results
    .map((r) => {
      const mediaType = (r.media_type as MediaType) ?? fallbackType;
      if (mediaType !== 'movie' && mediaType !== 'tv') return null;
      return {
        tmdbId: r.id,
        mediaType,
        title: r.title ?? r.name ?? 'Untitled',
        year: parseYear(r.release_date ?? r.first_air_date),
        posterPath: r.poster_path ?? null,
        overview: r.overview?.trim() || null,
        popularity: r.popularity ?? 0,
      } satisfies SearchHit;
    })
    .filter((hit): hit is SearchHit => hit !== null);
}

export type FeedKind =
  | 'trending'
  | 'in_theaters'
  | 'on_air'
  | 'popular_movies'
  | 'popular_shows';

const FEEDS: Record<
  FeedKind,
  { path: string; label: string; fallbackType?: MediaType }
> = {
  trending: { path: '/trending/all/week', label: 'Trending this week' },
  in_theaters: {
    path: '/movie/now_playing',
    label: 'In theaters',
    fallbackType: 'movie',
  },
  on_air: {
    path: '/tv/on_the_air',
    label: 'On air now',
    fallbackType: 'tv',
  },
  popular_movies: {
    path: '/movie/popular',
    label: 'Popular films',
    fallbackType: 'movie',
  },
  popular_shows: {
    path: '/tv/popular',
    label: 'Popular shows',
    fallbackType: 'tv',
  },
};

export function feedLabel(kind: FeedKind): string {
  return FEEDS[kind].label;
}

/** One of the Explore rows. Order is preserved as TMDB ranked it. */
export async function getFeed(kind: FeedKind): Promise<SearchHit[]> {
  const feed = FEEDS[kind];
  const data = await request<{ results: RawSearchResult[] }>(feed.path);
  return mapResults(data.results, feed.fallbackType);
}

export type Genre = { id: number; name: string };

export async function getGenres(mediaType: MediaType): Promise<Genre[]> {
  const data = await request<{ genres: Genre[] }>(`/genre/${mediaType}/list`);
  return data.genres;
}

/** Highest-rated-first discovery within one genre. */
export async function discoverByGenre(
  mediaType: MediaType,
  genreId: number
): Promise<SearchHit[]> {
  const data = await request<{ results: RawSearchResult[] }>(
    `/discover/${mediaType}`,
    {
      with_genres: String(genreId),
      sort_by: 'popularity.desc',
      include_adult: 'false',
    }
  );
  return mapResults(data.results, mediaType);
}

export type Person = {
  id: number;
  name: string;
  profilePath: string | null;
  knownFor: string;
  department: string | null;
};

export async function searchPeople(query: string): Promise<Person[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const data = await request<{
    results: {
      id: number;
      name: string;
      profile_path?: string | null;
      known_for_department?: string;
      known_for?: { title?: string; name?: string }[];
      popularity?: number;
    }[];
  }>('/search/person', { query: trimmed, include_adult: 'false' });

  return data.results
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      profilePath: p.profile_path ?? null,
      department: p.known_for_department ?? null,
      knownFor:
        p.known_for
          ?.map((k) => k.title ?? k.name)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ') ?? '',
    }));
}

export type PersonCredits = {
  name: string;
  profilePath: string | null;
  biography: string | null;
  department: string | null;
  /** Acting and crew credits merged, most popular first, duplicates removed. */
  credits: SearchHit[];
};

export async function getPersonCredits(
  personId: number
): Promise<PersonCredits> {
  const [person, credits] = await Promise.all([
    request<{
      name: string;
      profile_path?: string | null;
      biography?: string;
      known_for_department?: string;
    }>(`/person/${personId}`),
    request<{ cast?: RawSearchResult[]; crew?: RawSearchResult[] }>(
      `/person/${personId}/combined_credits`
    ),
  ]);

  const merged = mapResults([
    ...(credits.cast ?? []),
    ...(credits.crew ?? []),
  ]);

  // The same title can appear as both a cast and a crew credit.
  const seen = new Set<string>();
  const unique = merged.filter((hit) => {
    const key = `${hit.mediaType}:${hit.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    name: person.name,
    profilePath: person.profile_path ?? null,
    biography: person.biography?.trim() || null,
    department: person.known_for_department ?? null,
    credits: unique.sort((a, b) => b.popularity - a.popularity),
  };
}
