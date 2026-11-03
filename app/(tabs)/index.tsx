import { Ionicons } from '@expo/vector-icons';
import { Link, useNavigation, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useDb } from '../../src/db/client';
import { getShowAirInfo, hasApiKey, mapWithLimit } from '../../src/api/tmdb';
import { Poster } from '../../src/components/Poster';
import { Tappable } from '../../src/components/Tappable';
import {
  getHomeShows,
  logWatch,
  setAirInfo,
  today,
  type HomeShow,
} from '../../src/db/queries';
import type { AirInfo } from '../../src/db/types';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import {
  importTvTime,
  pickCsvFiles,
  type ImportProgress,
  type ImportSummary,
} from '../../src/import/runImport';
import { extractTvTime } from '../../src/import/tvtime';
import {
  colors,
  formatDate,
  radius,
  spacing,
  useIsWide,
} from '../../src/theme';
import { episodeCode, upNext, type UpNext } from '../../src/upNext';

type Row = UpNext & { show: HomeShow; info: AirInfo | null };

const HOUR = 3600 * 1000;
/** An episode counts as "new" for this long after it airs. */
const NEW_DAYS = 30;
/** Cards per section before "Show all". */
const PREVIEW = 12;
const canImport = Platform.OS === 'web';

/** Ended shows rarely change, so they're re-checked weekly instead of twice a day. */
function isStale(show: HomeShow, info: AirInfo | null, now: number): boolean {
  if (!show.air_checked_at) return true;
  const ended = info?.status === 'Ended' || info?.status === 'Canceled';
  return now - Date.parse(show.air_checked_at) > (ended ? 7 * 24 : 12) * HOUR;
}

function parseInfo(raw: string | null): AirInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AirInfo;
  } catch {
    return null;
  }
}

/** `Today`, `Tomorrow`, `Fri`, or `14 Nov 2026` for anything further out. */
function formatAirDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const days = Math.round(
    (new Date(y, m - 1, d).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      (24 * HOUR)
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) {
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'long',
    });
  }
  return formatDate(iso);
}

export default function HomeScreen() {
  const db = useDb();
  const router = useRouter();
  const navigation = useNavigation();
  const wide = useIsWide();

  const { data, loading, reload } = useDbQuery(
    useCallback((database) => getHomeShows(database), []),
    []
  );

  const rows: Row[] = useMemo(() => {
    const since = new Date(Date.now() - NEW_DAYS * 24 * HOUR);
    const newSince = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
    return (data ?? []).map((show) => {
      const info = parseInfo(show.air_info);
      return {
        show,
        info,
        ...upNext(info, show.furthest, show.last_watched_on, newSince),
      };
    });
  }, [data]);

  // --- background refresh of airing info -------------------------------
  const [checking, setChecking] = useState(false);
  // One attempt per show per session, so a failing lookup can't loop.
  const attempted = useRef(new Set<number>());

  useEffect(() => {
    if (!hasApiKey) return;
    const now = Date.now();
    const stale = rows.filter(
      (r) => !attempted.current.has(r.show.id) && isStale(r.show, r.info, now)
    );
    if (!stale.length) return;
    stale.forEach((r) => attempted.current.add(r.show.id));
    setChecking(true);
    void (async () => {
      let updated = 0;
      await mapWithLimit(stale, 6, async ({ show }) => {
        try {
          await setAirInfo(db, show.id, await getShowAirInfo(show.tmdb_id));
          updated++;
        } catch {
          // Offline or TMDB hiccup: the old info stays, retried next session.
        }
      });
      setChecking(false);
      if (updated) reload();
    })();
  }, [rows, db, reload]);

  // --- TV Time import ---------------------------------------------------
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const runImport = useCallback(async () => {
    const files = await pickCsvFiles();
    if (!files) return;
    const parsed = extractTvTime(files);
    setSummary(null);
    if (!parsed.shows.length && !parsed.movies.length) {
      setNotice(
        'No watch history in those files. Pick tracking-prod-records-v2.csv, tracking-prod-records.csv and followed_tv_show.csv from your TV Time export.'
      );
      return;
    }
    setNotice(null);
    setProgress({
      done: 0,
      total: parsed.shows.length + parsed.movies.length,
      current: '',
    });
    try {
      setSummary(await importTvTime(db, parsed, setProgress));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setProgress(null);
      reload();
    }
  }, [db, reload]);

  useLayoutEffect(() => {
    if (!canImport) return;
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={runImport}
          disabled={progress !== null}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Import TV Time"
        >
          <Ionicons name="cloud-upload-outline" size={16} color={colors.text} />
          <Text style={styles.headerButtonText}>{wide ? 'Import TV Time' : 'Import'}</Text>
        </Pressable>
      ),
    });
  }, [navigation, runImport, progress, wide]);

  // --- marking the next episode -----------------------------------------
  const [marking, setMarking] = useState<number | null>(null);
  const markNext = useCallback(
    async (row: Row) => {
      if (!row.next) return;
      setMarking(row.show.id);
      try {
        const isLatest =
          row.info?.last?.s === row.next.s && row.info.last.e === row.next.e;
        await logWatch(db, {
          title_id: row.show.id,
          watched_on: today(),
          rating: null,
          notes: null,
          season_number: row.next.s,
          episode_number: row.next.e,
          episode_name: isLatest ? (row.info?.last?.name ?? null) : null,
          runtime: row.show.runtime ?? row.info?.last?.runtime ?? null,
        });
        reload();
      } finally {
        setMarking(null);
      }
    },
    [db, reload]
  );

  // --- sections ---------------------------------------------------------
  const todayIso = today();
  const fresh = rows
    .filter((r) => r.isNew)
    .sort((a, b) => (b.info?.last?.date ?? '').localeCompare(a.info?.last?.date ?? ''));
  const watching = rows
    .filter((r) => !r.isNew && r.remaining > 0 && r.show.furthest !== null)
    .sort((a, b) => (b.show.last_watched_on ?? '').localeCompare(a.show.last_watched_on ?? ''));
  const notStarted = rows
    .filter((r) => r.remaining > 0 && r.show.furthest === null)
    .sort((a, b) => b.show.added_at.localeCompare(a.show.added_at));
  const soon = rows
    .filter((r) => r.info?.next?.date && r.info.next.date >= todayIso)
    .sort((a, b) => a.info!.next!.date!.localeCompare(b.info!.next!.date!));

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const nothing = !fresh.length && !watching.length && !notStarted.length && !soon.length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {progress && (
        <View style={styles.banner}>
          <View style={styles.bannerHead}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.bannerTitle}>
              Importing {progress.done} of {progress.total}
            </Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.trackFill,
                { width: `${(progress.done / Math.max(1, progress.total)) * 100}%` },
              ]}
            />
          </View>
          {progress.current ? (
            <Text style={styles.bannerBody} numberOfLines={1}>
              {progress.current}
            </Text>
          ) : null}
        </View>
      )}

      {summary && (
        <View style={styles.banner}>
          <View style={styles.bannerHead}>
            <Ionicons name="checkmark-circle" size={18} color={colors.positive} />
            <Text style={styles.bannerTitle}>Import finished</Text>
            <View style={styles.flex} />
            <Pressable onPress={() => setSummary(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textFaint} />
            </Pressable>
          </View>
          <Text style={styles.bannerBody}>
            {summary.shows} shows · {summary.episodes.toLocaleString()} episodes
            · {summary.movies} films ({summary.movieWatches} watches)
          </Text>
          {summary.unmatched.length > 0 && (
            <Text style={styles.bannerFaint}>
              Not found on TMDB ({summary.unmatched.length}):{' '}
              {summary.unmatched.slice(0, 20).join(', ')}
              {summary.unmatched.length > 20 ? '…' : ''}
            </Text>
          )}
        </View>
      )}

      {notice && (
        <View style={styles.banner}>
          <View style={styles.bannerHead}>
            <Ionicons name="warning-outline" size={16} color={colors.danger} />
            <Text style={[styles.bannerBody, styles.flex]}>{notice}</Text>
            <Pressable onPress={() => setNotice(null)} hitSlop={8}>
              <Ionicons name="close" size={16} color={colors.textFaint} />
            </Pressable>
          </View>
        </View>
      )}

      {checking && (
        <View style={styles.checking}>
          <ActivityIndicator size="small" color={colors.textFaint} />
          <Text style={styles.checkingText}>Checking for new episodes…</Text>
        </View>
      )}

      {nothing && !progress ? (
        <View style={styles.empty}>
          <Ionicons name="tv-outline" size={44} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>Nothing to watch yet</Text>
          <Text style={styles.emptyBody}>
            Add the shows you follow and Home lines up your next episode, flags
            new ones as they air, and shows what's coming.
          </Text>
          <View style={styles.emptyButtons}>
            <Pressable
              onPress={() => router.push('/search')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Ionicons name="search" size={15} color={colors.bg} />
              <Text style={styles.primaryButtonText}>Find a show</Text>
            </Pressable>
            {canImport && (
              <Pressable
                onPress={runImport}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Ionicons name="cloud-upload-outline" size={15} color={colors.text} />
                <Text style={styles.secondaryButtonText}>Import from TV Time</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <>
          <Section title="New episodes" icon="sparkles" rows={fresh} wide={wide}>
            {(row) => (
              <ShowCard
                row={row}
                line={`${episodeCode(row.next!.s, row.next!.e)} · ${row.remaining} left`}
                sub={`Aired ${formatDate(row.info?.last?.date)}`}
                badge="NEW"
                busy={marking === row.show.id}
                onMark={() => markNext(row)}
              />
            )}
          </Section>
          <Section title="Continue watching" icon="play-circle" rows={watching} wide={wide}>
            {(row) => (
              <ShowCard
                row={row}
                line={`${episodeCode(row.next!.s, row.next!.e)} · ${row.remaining} left`}
                sub={`Last watched ${formatDate(row.show.last_watched_on)}`}
                busy={marking === row.show.id}
                onMark={() => markNext(row)}
              />
            )}
          </Section>
          <Section title="Coming soon" icon="calendar" rows={soon} wide={wide}>
            {(row) => (
              <ShowCard
                row={row}
                line={`${episodeCode(row.info!.next!.s, row.info!.next!.e)} · ${formatAirDate(row.info!.next!.date!)}`}
                sub={row.info?.next?.name ?? row.info?.status ?? ''}
              />
            )}
          </Section>
          <Section title="Haven't started" icon="bookmark" rows={notStarted} wide={wide}>
            {(row) => (
              <ShowCard
                row={row}
                line={`${row.remaining} episode${row.remaining === 1 ? '' : 's'}`}
                sub={row.info?.status ?? ''}
                busy={marking === row.show.id}
                onMark={() => markNext(row)}
              />
            )}
          </Section>
        </>
      )}
    </ScrollView>
  );
}

function Section({
  title,
  icon,
  rows,
  wide,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  rows: Row[];
  wide: boolean;
  children: (row: Row) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) return null;
  const shown = expanded ? rows : rows.slice(0, PREVIEW);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={16} color={colors.accent} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{rows.length}</Text>
        <View style={styles.flex} />
        {rows.length > PREVIEW && (
          <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
            <Text style={styles.link}>
              {expanded ? 'Show less' : `Show all ${rows.length}`}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={styles.grid}>
        {shown.map((row) => (
          <View key={row.show.id} style={wide ? styles.cellWide : styles.cell}>
            {children(row)}
          </View>
        ))}
      </View>
    </View>
  );
}

function ShowCard({
  row,
  line,
  sub,
  badge,
  busy,
  onMark,
}: {
  row: Row;
  line: string;
  sub: string;
  badge?: string;
  busy?: boolean;
  onMark?: () => void;
}) {
  const { show } = row;
  const progress =
    show.total_episodes && show.furthest !== null
      ? Math.min(1, show.episodes_watched / show.total_episodes)
      : null;

  return (
    <Link href={`/title/${show.id}`} asChild>
      {/* One style object, not an array: Link asChild spreads the child's style. */}
      <Tappable style={styles.card} scaleTo={0.98}>
        <Poster path={show.poster_path} width={56} mediaType="tv" size="w154" />
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {show.title}
            </Text>
            {badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardLine} numberOfLines={1}>
            {line}
          </Text>
          {progress !== null && (
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
            </View>
          )}
          {sub ? (
            <Text style={styles.cardSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        {onMark && row.next && (
          <Pressable
            // On web the card is an <a>; without this the click also navigates.
            onPress={(e) => {
              e.preventDefault();
              onMark();
            }}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${episodeCode(row.next.s, row.next.e)} of ${show.title} watched`}
            style={({ pressed }) => [styles.markButton, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Ionicons name="checkmark" size={18} color={colors.bg} />
            )}
          </Pressable>
        )}
      </Tappable>
    </Link>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.xl,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  headerButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  banner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  bannerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  bannerBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  bannerFaint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
  },
  checking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: -spacing.md,
  },
  checkingText: {
    color: colors.textFaint,
    fontSize: 12,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionCount: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
  },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  // Cells carry the gutter so an odd last card keeps its width.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
    rowGap: spacing.md,
  },
  cell: {
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  cellWide: {
    width: '50%',
    paddingHorizontal: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    color: colors.bg,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardLine: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  cardSub: {
    color: colors.textFaint,
    fontSize: 12,
  },
  track: {
    height: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    marginVertical: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
    backgroundColor: colors.positive,
    borderRadius: radius.pill,
  },
  markButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  emptyBody: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
  },
  emptyButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  primaryButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
});
