import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useDb } from '../../src/db/client';
import { FadeIn } from '../../src/components/FadeIn';
import { Poster } from '../../src/components/Poster';
import { Tappable } from '../../src/components/Tappable';
import {
  getLibrary,
  logWatch,
  today,
  type LibraryFilter,
} from '../../src/db/queries';
import type { TitleWithProgress } from '../../src/db/types';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import {
  colors,
  formatDate,
  formatTotalRuntime,
  radius,
  spacing,
  useIsWide,
} from '../../src/theme';

type Tab = 'all' | 'movie' | 'tv';
type Sort = NonNullable<LibraryFilter['sort']>;

const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'rating', label: 'Rating' },
  { key: 'alpha', label: 'A–Z' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [search, setSearch] = useState('');

  const db = useDb();
  const wide = useIsWide();

  const { data, loading, error, reload } = useDbQuery(
    useCallback(
      (database) =>
        getLibrary(database, {
          mediaType: tab === 'all' ? undefined : tab,
          sort,
          search,
        }),
      [tab, sort, search]
    ),
    [tab, sort, search]
  );

  const titles = data ?? [];
  const totalMinutes = titles.reduce((sum, t) => sum + t.minutes_watched, 0);

  /** Quick-log a film as watched today without opening its detail screen. */
  const quickLog = useCallback(
    async (title: TitleWithProgress) => {
      await logWatch(db, {
        title_id: title.id,
        watched_on: today(),
        rating: null,
        notes: null,
        season_number: null,
        episode_number: null,
        episode_name: null,
        runtime: title.runtime,
      });
      reload();
    },
    [db, reload]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Filter your library"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={16}
                color={colors.textFaint}
              />
            </Pressable>
          )}
        </View>

        <View style={styles.chipRow}>
          <Chip
            label="All"
            active={tab === 'all'}
            onPress={() => setTab('all')}
          />
          <Chip
            label="Movies"
            active={tab === 'movie'}
            onPress={() => setTab('movie')}
          />
          <Chip
            label="TV"
            active={tab === 'tv'}
            onPress={() => setTab('tv')}
          />
          <View style={styles.spacer} />
          {SORTS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={sort === s.key}
              onPress={() => setSort(s.key)}
            />
          ))}
        </View>
      </View>

      {loading && titles.length === 0 ? (
        <ActivityIndicator style={styles.centered} color={colors.accent} />
      ) : error ? (
        <Text style={styles.error}>{error.message}</Text>
      ) : titles.length === 0 ? (
        <Empty
          filtered={search.length > 0 || tab !== 'all'}
          onSearch={() => router.push('/search')}
        />
      ) : (
        <FlatList
          // numColumns can't change on a mounted FlatList, so remount on resize.
          key={wide ? 'grid' : 'list'}
          numColumns={wide ? 2 : 1}
          data={titles}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, wide && styles.gridList]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item, index }) => (
            <FadeIn index={index} style={wide ? styles.gridCell : undefined}>
              <LibraryRow
                title={item}
                card={wide}
                onQuickLog={() => quickLog(item)}
              />
            </FadeIn>
          )}
          ListFooterComponent={
            totalMinutes > 0 ? (
              <Text style={styles.footer}>
                {titles.length} {titles.length === 1 ? 'title' : 'titles'} ·{' '}
                {formatTotalRuntime(totalMinutes)} watched
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

function LibraryRow({
  title,
  card,
  onQuickLog,
}: {
  title: TitleWithProgress;
  /** Wide layout: render as a boxed card in the two-column grid. */
  card: boolean;
  onQuickLog: () => void;
}) {
  const isTv = title.media_type === 'tv';
  const rating = title.user_rating ?? title.avg_rating;
  const progress =
    isTv && title.total_episodes
      ? Math.min(1, title.episodes_watched / title.total_episodes)
      : null;

  return (
    <Link href={`/title/${title.id}`} asChild>
      {/* One style object, not an array: Link asChild spreads the child's style. */}
      <Tappable style={card ? styles.cardRow : styles.row} scaleTo={0.98}>
        <Poster
          path={title.poster_path}
          width={card ? 72 : 58}
          mediaType={title.media_type}
          size="w154"
        />
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title.title}
          </Text>
          <Text style={styles.rowMeta}>
            {[
              isTv ? 'TV' : 'Movie',
              title.year ? String(title.year) : null,
              isTv && title.total_episodes
                ? `${title.episodes_watched}/${title.total_episodes} eps`
                : title.watch_count > 1
                  ? `${title.watch_count} watches`
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {progress !== null && (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
          )}
          <Text style={styles.rowDate}>
            {title.last_watched_on
              ? `Last watched ${formatDate(title.last_watched_on)}`
              : 'Not logged yet'}
          </Text>
        </View>
        <View style={styles.rowRight}>
          {rating !== null && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={11} color={colors.accent} />
              <Text style={styles.ratingText}>
                {Number(rating).toFixed(rating % 1 === 0 ? 0 : 1)}
              </Text>
            </View>
          )}
          {title.review && (
            <Ionicons
              name="chatbox-ellipses"
              size={13}
              color={colors.textFaint}
            />
          )}
          {/*
            Films get a one-tap "watched today" here. Shows are left out: a
            single tap can't say which episode, so they go through the detail
            screen.
          */}
          {!isTv && (
            <Pressable
              // On web the row is an <a>; without this the click also navigates.
              onPress={(e) => {
                e.preventDefault();
                onQuickLog();
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${title.title} watched today`}
              style={({ pressed }) => [
                styles.quickLog,
                pressed && styles.rowPressed,
              ]}
            >
              <Ionicons
                name="add-circle"
                size={22}
                color={colors.accentDim}
              />
            </Pressable>
          )}
        </View>
      </Tappable>
    </Link>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Empty({
  filtered,
  onSearch,
}: {
  filtered: boolean;
  onSearch: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons name="albums-outline" size={44} color={colors.textFaint} />
      <Text style={styles.emptyTitle}>
        {filtered ? 'Nothing matches' : 'Your library is empty'}
      </Text>
      <Text style={styles.emptyBody}>
        {filtered
          ? 'Try a different filter.'
          : 'Search for a film or show to start tracking what you watch.'}
      </Text>
      {!filtered && (
        <Pressable onPress={onSearch} style={styles.emptyButton}>
          <Ionicons name="search" size={15} color={colors.bg} />
          <Text style={styles.emptyButtonText}>Find something</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  controls: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 16, // under 16px, iOS Safari zooms in on focus
    padding: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  spacer: {
    flex: 1,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.bg,
  },
  list: {
    padding: spacing.lg,
  },
  // Grid cells are exactly half width with the gutter inside them, so an odd
  // last card doesn't stretch across the row.
  gridList: {
    paddingHorizontal: spacing.sm,
  },
  gridCell: {
    width: '50%',
    paddingHorizontal: spacing.sm,
  },
  separator: {
    height: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  rowDate: {
    color: colors.textFaint,
    fontSize: 11,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    marginVertical: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.positive,
    borderRadius: radius.pill,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickLog: {
    padding: 2,
  },
  footer: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  ratingText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  emptyBody: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    marginTop: spacing.md,
  },
  emptyButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 14,
  },
  error: {
    color: colors.danger,
    padding: spacing.xl,
    textAlign: 'center',
  },
});
