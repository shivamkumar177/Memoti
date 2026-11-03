import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getAllEpisodes,
  getEpisodes,
  getSeasons,
  imageUrl,
  TmdbError,
  type Episode,
  type Season,
} from '../../src/api/tmdb';
import { useDb } from '../../src/db/client';
import { Poster } from '../../src/components/Poster';
import { RatingPicker } from '../../src/components/RatingPicker';
import {
  deleteEntry,
  deleteTitle,
  getEntriesForTitle,
  getTitle,
  getWatchedEpisodeKeys,
  logEpisodes,
  logWatch,
  setArchived,
  setUserRating,
  today,
  unlogEpisode,
} from '../../src/db/queries';
import type { WatchEntry } from '../../src/db/types';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import {
  colors,
  formatDate,
  formatRuntime,
  formatTotalRuntime,
  radius,
  spacing,
} from '../../src/theme';

export default function TitleDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const titleId = Number(params.id);
  const db = useDb();
  const router = useRouter();

  const { data, loading, error, reload } = useDbQuery(
    useCallback(
      async (database) => {
        const title = await getTitle(database, titleId);
        if (!title) return null;
        const [entries, watchedKeys] = await Promise.all([
          getEntriesForTitle(database, titleId),
          getWatchedEpisodeKeys(database, titleId),
        ]);
        return { title, entries, watchedKeys };
      },
      [titleId]
    ),
    [titleId]
  );

  const handleRating = useCallback(
    async (rating: number | null) => {
      await setUserRating(db, titleId, rating);
      reload();
    },
    [db, titleId, reload]
  );

  const toggleArchived = useCallback(
    async (archived: boolean) => {
      await setArchived(db, titleId, archived);
      reload();
    },
    [db, titleId, reload]
  );

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Remove from library?',
      'This deletes the title and every watch you logged for it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteTitle(db, titleId);
            router.back();
          },
        },
      ]
    );
  }, [db, titleId, router]);

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

  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.dim}>This title is no longer in your library.</Text>
      </View>
    );
  }

  const { title, entries, watchedKeys } = data;
  const isTv = title.media_type === 'tv';
  const backdrop = imageUrl(title.backdrop_path, 'w500');
  const genres: string[] = title.genres ? safeParseGenres(title.genres) : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {backdrop && (
        <Image source={{ uri: backdrop }} style={styles.backdrop} blurRadius={2} />
      )}

      <View style={styles.head}>
        <Poster
          path={title.poster_path}
          width={92}
          mediaType={title.media_type}
        />
        <View style={styles.headBody}>
          <Text style={styles.title}>{title.title}</Text>
          <Text style={styles.meta}>
            {[
              isTv ? 'TV series' : 'Film',
              title.year ? String(title.year) : null,
              isTv
                ? title.total_seasons
                  ? `${title.total_seasons} season${title.total_seasons === 1 ? '' : 's'}`
                  : null
                : formatRuntime(title.runtime),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {genres.length > 0 && (
            <Text style={styles.genres} numberOfLines={2}>
              {genres.join(', ')}
            </Text>
          )}
        </View>
      </View>

      {title.overview && <Text style={styles.overview}>{title.overview}</Text>}

      <View style={styles.statStrip}>
        <Stat
          label="Time watched"
          value={formatTotalRuntime(title.minutes_watched)}
        />
        <Stat
          label={isTv ? 'Episodes' : 'Watches'}
          value={String(isTv ? title.episodes_watched : title.watch_count)}
        />
        <Stat
          label="Your score"
          value={title.user_rating ? `${title.user_rating}/10` : '—'}
        />
      </View>

      <Section title="Your rating">
        <RatingPicker value={title.user_rating} onChange={handleRating} />
      </Section>

      <Section title="Review">
        {title.review ? (
          <Text style={styles.review}>{title.review}</Text>
        ) : (
          <Text style={styles.dim}>
            You have not written anything about this yet.
          </Text>
        )}
        <Pressable
          onPress={() => router.push(`/review/${titleId}`)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={title.review ? 'create-outline' : 'add'}
            size={16}
            color={colors.text}
          />
          <Text style={styles.secondaryButtonText}>
            {title.review ? 'Edit review' : 'Write a review'}
          </Text>
        </Pressable>
      </Section>

      {isTv ? (
        <EpisodeTracker
          titleId={titleId}
          tmdbId={title.tmdb_id}
          episodeRuntime={title.runtime}
          watchedKeys={watchedKeys}
          onChange={reload}
        />
      ) : (
        <MovieWatches
          titleId={titleId}
          entries={entries}
          onLogged={reload}
          onQuickLog={async () => {
            await logWatch(db, {
              title_id: titleId,
              watched_on: today(),
              rating: null,
              notes: null,
              season_number: null,
              episode_number: null,
              episode_name: null,
              runtime: title.runtime,
            });
            reload();
          }}
        />
      )}

      {isTv && (
        <Pressable
          onPress={() => toggleArchived(!title.archived)}
          style={({ pressed }) => [
            styles.secondaryButton,
            styles.archiveButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={title.archived ? 'play-outline' : 'pause-outline'}
            size={16}
            color={colors.text}
          />
          <Text style={styles.secondaryButtonText}>
            {title.archived ? 'Resume watching' : 'Stop watching'}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={confirmDelete}
        style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
      >
        <Ionicons name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>Remove from library</Text>
      </Pressable>
    </ScrollView>
  );
}

/** Movies: a running list of watches, newest first, each removable. */
function MovieWatches({
  titleId,
  entries,
  onLogged,
  onQuickLog,
}: {
  titleId: number;
  entries: WatchEntry[];
  onLogged: () => void;
  onQuickLog: () => Promise<void>;
}) {
  const db = useDb();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const sorted = [...entries].sort((a, b) =>
    b.watched_on.localeCompare(a.watched_on)
  );

  return (
    <Section title={`Watches (${entries.length})`}>
      <View style={styles.buttonRow}>
        <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onQuickLog();
            } finally {
              setBusy(false);
            }
          }}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="checkmark" size={16} color={colors.bg} />
          <Text style={styles.primaryButtonText}>Watched today</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/log/${titleId}`)}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="calendar-outline" size={16} color={colors.text} />
          <Text style={styles.secondaryButtonText}>Another date</Text>
        </Pressable>
      </View>

      {sorted.length === 0 ? (
        <Text style={styles.dim}>No watches logged yet.</Text>
      ) : (
        <View style={styles.entryList}>
          {sorted.map((entry) => (
            <View key={entry.id} style={styles.entryRow}>
              <Ionicons name="eye-outline" size={15} color={colors.textDim} />
              <View style={styles.entryBody}>
                <Text style={styles.entryDate}>
                  {formatDate(entry.watched_on)}
                </Text>
                {entry.notes && (
                  <Text style={styles.entryNotes}>{entry.notes}</Text>
                )}
              </View>
              {entry.rating !== null && (
                <Text style={styles.entryRating}>{entry.rating}/10</Text>
              )}
              <Pressable
                hitSlop={8}
                onPress={async () => {
                  await deleteEntry(db, entry.id);
                  onLogged();
                }}
              >
                <Ionicons name="close" size={16} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

/** TV: season picker plus a tappable episode checklist. */
function EpisodeTracker({
  titleId,
  tmdbId,
  episodeRuntime,
  watchedKeys,
  onChange,
}: {
  titleId: number;
  tmdbId: number;
  episodeRuntime: number | null;
  watchedKeys: Set<string>;
  onChange: () => void;
}) {
  const db = useDb();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await getSeasons(tmdbId);
        if (!alive) return;
        setSeasons(list);
        setSelected(list[0]?.seasonNumber ?? null);
      } catch (e) {
        if (!alive) return;
        setError(
          e instanceof TmdbError ? e.message : 'Could not load seasons.'
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [tmdbId]);

  useEffect(() => {
    if (selected === null) return;
    let alive = true;
    setLoadingEpisodes(true);
    (async () => {
      try {
        const list = await getEpisodes(tmdbId, selected);
        if (!alive) return;
        setEpisodes(list);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setEpisodes(null);
        setError(
          e instanceof TmdbError ? e.message : 'Could not load episodes.'
        );
      } finally {
        if (alive) setLoadingEpisodes(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tmdbId, selected]);

  const toggle = useCallback(
    async (episode: Episode) => {
      const key = `S${episode.seasonNumber}E${episode.episodeNumber}`;
      if (watchedKeys.has(key)) {
        await unlogEpisode(
          db,
          titleId,
          episode.seasonNumber,
          episode.episodeNumber
        );
      } else {
        await logWatch(db, {
          title_id: titleId,
          watched_on: today(),
          rating: null,
          notes: null,
          season_number: episode.seasonNumber,
          episode_number: episode.episodeNumber,
          episode_name: episode.name,
          runtime: episode.runtime ?? episodeRuntime,
        });
      }
      onChange();
    },
    [db, titleId, watchedKeys, episodeRuntime, onChange]
  );

  const markSeason = useCallback(async () => {
    if (!episodes?.length) return;
    await logEpisodes(
      db,
      episodes.map((e) => ({
        title_id: titleId,
        watched_on: today(),
        rating: null,
        notes: null,
        season_number: e.seasonNumber,
        episode_number: e.episodeNumber,
        episode_name: e.name,
        runtime: e.runtime ?? episodeRuntime,
      }))
    );
    onChange();
  }, [db, titleId, episodes, episodeRuntime, onChange]);

  /**
   * Logs every episode of every season. Confirms first, since it can write
   * hundreds of rows and there is no single undo.
   */
  const markWholeShow = useCallback(() => {
    Alert.alert(
      'Mark the whole show watched?',
      'Every episode of every season gets logged with today as the date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark all',
          onPress: async () => {
            setMarkingAll(true);
            try {
              const all = await getAllEpisodes(tmdbId);
              await logEpisodes(
                db,
                all.map((e) => ({
                  title_id: titleId,
                  watched_on: today(),
                  rating: null,
                  notes: null,
                  season_number: e.seasonNumber,
                  episode_number: e.episodeNumber,
                  episode_name: e.name,
                  runtime: e.runtime ?? episodeRuntime,
                }))
              );
              onChange();
            } catch (e) {
              setError(
                e instanceof TmdbError
                  ? e.message
                  : 'Could not mark the whole show.'
              );
            } finally {
              setMarkingAll(false);
            }
          },
        },
      ]
    );
  }, [db, titleId, tmdbId, episodeRuntime, onChange]);

  if (error && !seasons) {
    return (
      <Section title="Episodes">
        <Text style={styles.error}>{error}</Text>
      </Section>
    );
  }

  if (!seasons) {
    return (
      <Section title="Episodes">
        <ActivityIndicator color={colors.accent} />
      </Section>
    );
  }

  const seasonWatched =
    episodes?.filter((e) =>
      watchedKeys.has(`S${e.seasonNumber}E${e.episodeNumber}`)
    ).length ?? 0;
  const allWatched = episodes ? seasonWatched === episodes.length : false;

  return (
    <Section title="Episodes">
      <Pressable
        onPress={markWholeShow}
        disabled={markingAll}
        style={({ pressed }) => [
          styles.primaryButton,
          markingAll && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {markingAll ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <>
            <Ionicons name="checkmark-done" size={16} color={colors.bg} />
            <Text style={styles.primaryButtonText}>
              Mark whole show watched
            </Text>
          </>
        )}
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.seasonRow}
      >
        {seasons.map((season) => (
          <Pressable
            key={season.seasonNumber}
            onPress={() => setSelected(season.seasonNumber)}
            style={({ pressed }) => [
              styles.seasonChip,
              selected === season.seasonNumber && styles.seasonChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.seasonChipText,
                selected === season.seasonNumber && styles.seasonChipTextActive,
              ]}
            >
              S{season.seasonNumber}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loadingEpisodes ? (
        <ActivityIndicator color={colors.accent} style={styles.episodeLoader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : episodes && episodes.length > 0 ? (
        <>
          <View style={styles.seasonHeader}>
            <Text style={styles.dim}>
              {seasonWatched}/{episodes.length} watched
            </Text>
            {!allWatched && (
              <Pressable onPress={markSeason} hitSlop={6}>
                <Text style={styles.link}>Mark season watched</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.episodeList}>
            {episodes.map((episode) => {
              const watched = watchedKeys.has(
                `S${episode.seasonNumber}E${episode.episodeNumber}`
              );
              return (
                <Pressable
                  key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                  onPress={() => toggle(episode)}
                  style={({ pressed }) => [
                    styles.episodeRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name={watched ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={watched ? colors.positive : colors.textFaint}
                  />
                  <View style={styles.episodeBody}>
                    <Text
                      style={[
                        styles.episodeName,
                        watched && styles.episodeNameWatched,
                      ]}
                      numberOfLines={1}
                    >
                      {episode.episodeNumber}. {episode.name}
                    </Text>
                    <Text style={styles.episodeMeta}>
                      {[
                        episode.airDate ? formatDate(episode.airDate) : null,
                        episode.runtime ? formatRuntime(episode.runtime) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={styles.dim}>No episodes listed for this season.</Text>
      )}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function safeParseGenres(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((g): g is string => typeof g === 'string')
      : [];
  } catch {
    return [];
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.lg,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 170,
    opacity: 0.18,
  },
  head: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  headBody: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  meta: {
    color: colors.textDim,
    fontSize: 13,
  },
  genres: {
    color: colors.textFaint,
    fontSize: 12,
  },
  overview: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
  },
  statStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  stat: {
    flex: 1,
    gap: 2,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textFaint,
    fontSize: 11,
  },
  review: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
  },
  disabled: {
    opacity: 0.5,
  },
  section: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  primaryButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  entryList: {
    gap: spacing.md,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  entryBody: {
    flex: 1,
    gap: 2,
  },
  entryDate: {
    color: colors.text,
    fontSize: 14,
  },
  entryNotes: {
    color: colors.textFaint,
    fontSize: 12,
  },
  entryRating: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  seasonRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  seasonChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  seasonChipActive: {
    backgroundColor: colors.accent,
  },
  seasonChipText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  seasonChipTextActive: {
    color: colors.bg,
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  link: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  episodeLoader: {
    marginVertical: spacing.lg,
  },
  episodeList: {
    gap: spacing.md,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  episodeBody: {
    flex: 1,
    gap: 2,
  },
  episodeName: {
    color: colors.text,
    fontSize: 14,
  },
  episodeNameWatched: {
    color: colors.textDim,
  },
  episodeMeta: {
    color: colors.textFaint,
    fontSize: 11,
  },
  // secondaryButton is flex: 1 for button rows; standalone it must not stretch.
  archiveButton: {
    flex: 0,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dim: {
    color: colors.textDim,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
