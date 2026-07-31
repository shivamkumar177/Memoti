import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getPersonCredits,
  imageUrl,
  TmdbError,
  type PersonCredits,
} from '../../src/api/tmdb';
import { FadeIn } from '../../src/components/FadeIn';
import { TitleCard } from '../../src/components/TitleCard';
import { getSavedTmdbIds } from '../../src/db/queries';
import { hitKey, useAddTitle } from '../../src/hooks/useAddTitle';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import { colors, radius, spacing } from '../../src/theme';

export default function PersonScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const personId = Number(params.id);

  const [data, setData] = useState<PersonCredits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);

  const { add, pending, error: addError } = useAddTitle();
  const { data: savedIds } = useDbQuery(
    useCallback((db) => getSavedTmdbIds(db), []),
    []
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await getPersonCredits(personId);
        if (!alive) return;
        setData(result);
      } catch (e) {
        if (!alive) return;
        setError(
          e instanceof TmdbError ? e.message : 'Could not load this person.'
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [personId]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="warning-outline" size={36} color={colors.danger} />
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const saved = savedIds ?? new Set<string>();
  const avatar = imageUrl(data.profilePath, 'w342');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.head}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={34} color={colors.textFaint} />
          </View>
        )}
        <View style={styles.headBody}>
          <Text style={styles.name}>{data.name}</Text>
          {data.department && (
            <Text style={styles.meta}>{data.department}</Text>
          )}
          <Text style={styles.meta}>
            {data.credits.length} credit{data.credits.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {addError && <Text style={styles.error}>{addError}</Text>}

      {data.biography && (
        <Pressable onPress={() => setBioExpanded((v) => !v)}>
          <Text
            style={styles.bio}
            numberOfLines={bioExpanded ? undefined : 4}
          >
            {data.biography}
          </Text>
          <Text style={styles.link}>
            {bioExpanded ? 'Show less' : 'Show more'}
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Credits</Text>
      {data.credits.length === 0 ? (
        <Text style={styles.dim}>No film or TV credits listed.</Text>
      ) : (
        <View style={styles.grid}>
          {data.credits.map((hit, index) => {
            const key = hitKey(hit);
            return (
              <FadeIn key={key} index={index}>
                <TitleCard
                  hit={hit}
                  saved={saved.has(key)}
                  busy={pending === key}
                  onPress={() => add(hit)}
                />
              </FadeIn>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  head: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headBody: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  meta: {
    color: colors.textDim,
    fontSize: 13,
  },
  bio: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 20,
  },
  link: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  dim: {
    color: colors.textDim,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
});
