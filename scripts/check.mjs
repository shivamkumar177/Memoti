// npm run check — asserts the pure logic: TV Time import parsing and up-next.
import assert from 'node:assert/strict';
import { extractTvTime, importLabel, parseCsv, toDay } from '../src/import/tvtime.ts';
import { packEpisode, upNext } from '../src/upNext.ts';

assert.deepEqual(parseCsv('a,b\r\n"x, ""y""",2\n"multi\nline",3\n'), [
  { a: 'x, "y"', b: '2' },
  { a: 'multi\nline', b: '3' },
]);
assert.deepEqual(parseCsv('﻿a\n1\n\n'), [{ a: '1' }]);

assert.equal(toDay('2024-03-09'), '2024-03-09');
assert.match(toDay('2024-03-09 12:00:00'), /^2024-03-(08|09|10)$/);
assert.equal(toDay('nonsense'), null);

const out = extractTvTime({
  'followed_tv_show.csv':
    'tv_show_name,tv_show_id,archived\nLost,73739,1\nDark,328724,0\n',
  'tracking-prod-records-v2.csv':
    's_id,series_name,season_number,episode_number,s_no,ep_no,created_at,is_special\n' +
    '328724,Dark,1,1,,,2024-01-02 10:00:00,0\n' +
    '328724,Dark,,,1,2,2024-01-03 10:00:00,0\n' +
    '328724,Dark,0,1,,,2024-01-03 10:00:00,1\n' + // special: skipped
    '328724,Dark,1,1,,,2023-12-30 10:00:00,0\n' + // rewatch, earlier date kept
    '328724,Dark,,,,,2024-01-01 10:00:00,0\n', // follow row: skipped
  'tracking-prod-records.csv':
    'series_id,series_name,movie_name,release_date,watch_date,created_at,season_number,episode_number,type,watch_count\n' +
    ',,Heat,1995-12-15,2024-02-01,,,,watch,1\n' +
    ',,Heat,1995-12-15,2024-02-01,,,,watch,1\n' + // same day: one watch
    ',,Heat,1995-12-15,2025-05-05,,,,watch,1\n' + // rewatch
    ',,Wishlist Film,2020-01-01,,,,,follow,0\n' + // followed, not watched: skipped
    ',,Someday Film,2020-01-01,,,,,towatch,0\n' + // watch list: skipped
    ',,Heat,1995-12-15,,2025-06-01,,,rewatch_count,2\n' + // counter row: skipped
    ',,Heat,1995-12-15,,2025-07-07 10:00:00,,,rewatch,\n' + // a rewatch is a viewing
    '73739,Lost,,,2010-05-01,,6,18,watch,\n' +
    '73739,Lost,,,2010-06-01,,6,17,last-episode-watched,\n', // pointer, not a watch
});

const dark = out.shows.find((s) => s.tvdbId === '328724');
const lost = out.shows.find((s) => s.tvdbId === '73739');
assert.equal(dark.archived, false);
assert.equal(lost.archived, true);
assert.deepEqual(
  dark.episodes.map((e) => `${e.s}x${e.e}`).sort(),
  ['1x1', '1x2']
);
assert.match(dark.episodes.find((e) => e.e === 1).date, /^2023-12-(29|30|31)$/);
assert.deepEqual(lost.episodes.map((e) => [e.s, e.e, e.date]), [[6, 18, '2010-05-01']]);
assert.equal(out.movies.length, 1);
assert.equal(out.movies[0].name, 'Heat');
assert.deepEqual(out.movies[0].dates.slice(0, 2), ['2024-02-01', '2025-05-05']);
assert.match(out.movies[0].dates[2], /^2025-07-0[678]$/);
assert.equal(out.movies[0].dates.length, 3);
assert.deepEqual(out.matches, {});
assert.equal(importLabel(lost), 'Lost');
assert.equal(importLabel({ tvdbId: '9', name: '', archived: false, episodes: [] }), 'TVDB 9');
assert.deepEqual(
  extractTvTime({
    'memoti-matches.csv':
      'name,tmdb_id,type\nगजनी,14070,\nAlex Strangelove,511785,movie\nBad,,movie\n',
  }).matches,
  {
    'गजनी': { tmdbId: 14070, type: null },
    'Alex Strangelove': { tmdbId: 511785, type: 'movie' },
  }
);


// --- upNext ---
const info = {
  status: 'Returning Series',
  seasons: [{ n: 2, count: 10 }, { n: 1, count: 3 }], // unsorted on purpose
  last: { s: 2, e: 4, date: '2026-10-30', name: 'Four', runtime: 50 },
  next: { s: 2, e: 5, date: '2026-11-06', name: null, runtime: null },
};
// Nothing watched: everything aired is ahead, starting at S1E1.
const since = '2026-10-01';
assert.deepEqual(upNext(info, null, null, since), { next: { s: 1, e: 1 }, remaining: 7, isNew: false });
// Half-way through S1: S1E3 next; announced-but-unaired S2E5+ don't count.
assert.deepEqual(upNext(info, packEpisode(1, 2), '2026-01-01', since), { next: { s: 1, e: 3 }, remaining: 5, isNew: true });
// Caught up before the latest episode dropped: new.
assert.deepEqual(upNext(info, packEpisode(2, 3), '2026-10-25', since), { next: { s: 2, e: 4 }, remaining: 1, isNew: true });
// Watched it after it aired: still up next, but not "new".
assert.equal(upNext(info, packEpisode(2, 3), '2026-10-31', since).isNew, false);
// Fully caught up.
assert.deepEqual(upNext(info, packEpisode(2, 4), '2026-10-31', since), { next: null, remaining: 0, isNew: false });
// Started at S2 (skipped S1): progress is the furthest episode, so S1 isn't up next.
assert.deepEqual(upNext(info, packEpisode(2, 1), '2026-10-31', since).next, { s: 2, e: 2 });
// No airing info yet.
assert.deepEqual(upNext(null, null, null, since), { next: null, remaining: 0, isNew: false });

// Fell behind long ago and it kept airing, but nothing aired recently: backlog, not new.
assert.equal(upNext(info, packEpisode(1, 2), '2020-01-01', '2026-11-01').isNew, false);

console.log('checks: ok');
