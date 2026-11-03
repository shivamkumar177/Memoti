import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getStats, type Stats } from '../../src/db/queries';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import {
  colors,
  formatMonth,
  formatTotalRuntime,
  radius,
  spacing,
} from '../../src/theme';

export default function StatsScreen() {
  const { data, loading, error } = useDbQuery(
    useCallback((db) => getStats(db), []),
    []
  );

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error.message}</Text>
      </View>
    );
  }

  const stats = data;
  const nothingLogged =
    !stats || (stats.movies === 0 && stats.shows === 0);

  if (nothingLogged) {
    return (
      <View style={styles.centered}>
        <Ionicons name="stats-chart-outline" size={44} color={colors.textFaint} />
        <Text style={styles.emptyTitle}>Nothing to count yet</Text>
        <Text style={styles.emptyBody}>
          Log a few watches and your numbers will show up here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.tileGrid}>
        <Tile
          icon="film-outline"
          label="Films"
          value={stats.movies.toLocaleString()}
          sub={
            stats.movieWatches > stats.movies
              ? `${stats.movieWatches} watches`
              : undefined
          }
        />
        <Tile icon="tv-outline" label="Shows" value={stats.shows.toLocaleString()} />
        <Tile
          icon="albums-outline"
          label="Episodes"
          value={stats.episodes.toLocaleString()}
        />
        <Tile
          icon="time-outline"
          label="Time watched"
          value={formatTotalRuntime(stats.minutes)}
        />
      </View>

      <Card title="Your ratings">
        {stats.ratedCount === 0 ? (
          <Text style={styles.dim}>Nothing rated yet.</Text>
        ) : (
          <View style={styles.ratingSummary}>
            <Text style={styles.bigNumber}>
              {stats.avgRating?.toFixed(1) ?? '—'}
            </Text>
            <View>
              <Text style={styles.dim}>average score</Text>
              <Text style={styles.dim}>
                across {stats.ratedCount} rated{' '}
                {stats.ratedCount === 1 ? 'title' : 'titles'}
              </Text>
              <Text style={styles.dim}>
                {stats.reviewedCount} reviewed
              </Text>
            </View>
          </View>
        )}
      </Card>

      {stats.minutes > 0 && (
        <Card title="Where the time went">
          <TimeSplit
            movieMinutes={stats.movieMinutes}
            tvMinutes={stats.tvMinutes}
            total={stats.minutes}
          />
        </Card>
      )}

      <Card title="Last 12 months">
        <MonthChart byMonth={stats.byMonth} />
      </Card>

      {stats.topGenres.length > 0 && (
        <Card title="Most watched genres">
          <View style={styles.genreList}>
            {stats.topGenres.map((entry) => {
              const max = stats.topGenres[0].count;
              return (
                <View key={entry.genre} style={styles.genreRow}>
                  <Text style={styles.genreName} numberOfLines={1}>
                    {entry.genre}
                  </Text>
                  <View style={styles.genreTrack}>
                    <View
                      style={[
                        styles.genreFill,
                        { width: `${(entry.count / max) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.genreCount}>{entry.count}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

/** Films-vs-TV split as a single stacked bar. */
function TimeSplit({
  movieMinutes,
  tvMinutes,
  total,
}: {
  movieMinutes: number;
  tvMinutes: number;
  total: number;
}) {
  // Anything not attributable to a media type (entries logged with no runtime)
  // is left out of the bar rather than silently folded into one side.
  const known = movieMinutes + tvMinutes;
  const moviePct = known > 0 ? (movieMinutes / known) * 100 : 0;

  return (
    <View style={styles.splitWrap}>
      <View style={styles.splitBar}>
        {moviePct > 0 && (
          <View style={[styles.splitFilm, { width: `${moviePct}%` }]} />
        )}
        {moviePct < 100 && (
          <View style={[styles.splitTv, { width: `${100 - moviePct}%` }]} />
        )}
      </View>
      <View style={styles.splitLegend}>
        <LegendItem
          color={colors.accent}
          label="Films"
          value={formatTotalRuntime(movieMinutes)}
        />
        <LegendItem
          color={colors.positive}
          label="TV"
          value={formatTotalRuntime(tvMinutes)}
        />
      </View>
      <Text style={styles.dim}>
        {formatTotalRuntime(total)} total
        {known < total
          ? ` · ${formatTotalRuntime(total - known)} without runtime data`
          : ''}
      </Text>
    </View>
  );
}

function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

/** Simple bar chart. Bars are Views — no charting dependency needed. */
function MonthChart({ byMonth }: { byMonth: Stats['byMonth'] }) {
  if (byMonth.length === 0) {
    return <Text style={styles.dim}>No watches logged yet.</Text>;
  }

  const max = Math.max(...byMonth.map((m) => m.count), 1);

  return (
    <View style={styles.chart}>
      {byMonth.map((month) => (
        <View key={month.month} style={styles.chartColumn}>
          <Text style={styles.chartValue}>{month.count || ''}</Text>
          <View
            style={[
              styles.chartBar,
              {
                height: Math.max(3, (month.count / max) * 90),
                backgroundColor:
                  month.count > 0 ? colors.accent : colors.surfaceAlt,
              },
            ]}
          />
          <Text style={styles.chartLabel} numberOfLines={1}>
            {formatMonth(month.month).split(' ')[0]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.tile}>
      <Ionicons name={icon} size={17} color={colors.accent} />
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {sub && <Text style={styles.tileSub}>{sub}</Text>}
    </View>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  tileValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  tileLabel: {
    color: colors.textDim,
    fontSize: 13,
  },
  tileSub: {
    color: colors.textFaint,
    fontSize: 11,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  bigNumber: {
    color: colors.accent,
    fontSize: 40,
    fontWeight: '800',
  },
  splitWrap: {
    gap: spacing.md,
  },
  splitBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  splitFilm: {
    backgroundColor: colors.accent,
  },
  splitTv: {
    backgroundColor: colors.positive,
  },
  splitLegend: {
    gap: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendLabel: {
    color: colors.textDim,
    fontSize: 13,
    flex: 1,
  },
  legendValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 2,
    height: 130,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  chartValue: {
    color: colors.textFaint,
    fontSize: 9,
    height: 12,
  },
  chartBar: {
    width: '72%',
    borderRadius: 3,
  },
  chartLabel: {
    color: colors.textFaint,
    fontSize: 9,
  },
  genreList: {
    gap: spacing.md,
  },
  genreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  genreName: {
    color: colors.text,
    fontSize: 13,
    width: 90,
  },
  genreTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  genreFill: {
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  genreCount: {
    color: colors.textDim,
    fontSize: 12,
    width: 22,
    textAlign: 'right',
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
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
  dim: {
    color: colors.textDim,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
  },
});
