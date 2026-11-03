import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  feedLabel,
  getFeed,
  hasApiKey,
  TmdbError,
  type FeedKind,
  type SearchHit,
} from '../../src/api/tmdb';
import { FadeIn } from '../../src/components/FadeIn';
import { TitleCard, useCardWidth } from '../../src/components/TitleCard';
import { getSavedTmdbIds } from '../../src/db/queries';
import { hitKey, useAddTitle } from '../../src/hooks/useAddTitle';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import { colors, radius, spacing, useIsWide } from '../../src/theme';

const ROWS: FeedKind[] = [
  'trending',
  'in_theaters',
  'on_air',
  'popular_movies',
  'popular_shows',
];

export default function ExploreScreen() {
  const [feeds, setFeeds] = useState<Record<string, SearchHit[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { add, pending, error: addError } = useAddTitle();
  const cardWidth = useCardWidth();
  const wide = useIsWide();

  // Saved set comes from the database and refreshes on focus, so returning from
  // a detail screen updates the check badges.
  const { data: savedIds, reload: reloadSaved } = useDbQuery(
    useCallback((db) => getSavedTmdbIds(db), []),
    []
  );

  const load = useCallback(async () => {
    if (!hasApiKey) {
      setLoading(false);
      return;
    }
    try {
      // Rows load together; one failing row shouldn't blank the screen.
      const results = await Promise.all(
        ROWS.map(async (kind) => {
          try {
            return [kind, await getFeed(kind)] as const;
          } catch {
            return [kind, [] as SearchHit[]] as const;
          }
        })
      );
      const next = Object.fromEntries(results);
      setFeeds(next);
      const anyLoaded = Object.values(next).some((row) => row.length > 0);
      setError(anyLoaded ? null : 'Could not reach TMDB. Pull to retry.');
    } catch (e) {
      setError(e instanceof TmdbError ? e.message : 'Could not load Explore.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), reloadSaved()]);
    setRefreshing(false);
  }, [load, reloadSaved]);

  if (!hasApiKey) {
    return (
      <View style={styles.centered}>
        <Ionicons name="key-outline" size={44} color={colors.accent} />
        <Text style={styles.emptyTitle}>TMDB key needed</Text>
        <Text style={styles.emptyBody}>
          Explore pulls live data from TMDB. Add EXPO_PUBLIC_TMDB_API_KEY to
          .env, then restart with npx expo start -c.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const saved = savedIds ?? new Set<string>();
  const message = addError ?? error;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.textDim}
        />
      }
    >
      {message && (
        <View style={styles.banner}>
          <Ionicons name="warning-outline" size={15} color={colors.danger} />
          <Text style={styles.bannerText}>{message}</Text>
        </View>
      )}

      {ROWS.map((kind, rowIndex) => {
        const hits = feeds[kind] ?? [];
        if (hits.length === 0) return null;
        return (
          <FadeIn key={kind} index={rowIndex}>
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{feedLabel(kind)}</Text>
              <ScrollView
                horizontal
                // A visible scrollbar is the only horizontal handle a mouse has.
                showsHorizontalScrollIndicator={wide}
                contentContainerStyle={styles.rowContent}
                decelerationRate="fast"
                snapToInterval={cardWidth + spacing.md}
                snapToAlignment="start"
              >
                {hits.map((hit) => {
                  const key = hitKey(hit);
                  return (
                    <TitleCard
                      key={key}
                      hit={hit}
                      saved={saved.has(key)}
                      busy={pending === key}
                      onPress={() => add(hit)}
                    />
                  );
                })}
              </ScrollView>
            </View>
          </FadeIn>
        );
      })}

      <Text style={styles.footnote}>
        Tapping a poster saves it to your library and opens it.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingVertical: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  row: {
    gap: spacing.md,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
  },
  rowContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  bannerText: {
    color: colors.danger,
    fontSize: 12,
    flex: 1,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  emptyBody: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
