import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { SearchHit } from '../api/tmdb';
import { colors, radius, spacing, useIsWide } from '../theme';
import { Poster } from './Poster';
import { Tappable } from './Tappable';

/** Poster width for TitleCard: phone-sized by default, roomier on wide screens. */
export function useCardWidth(): number {
  return useIsWide() ? 150 : 104;
}

type Props = {
  hit: SearchHit;
  saved: boolean;
  busy: boolean;
  onPress: () => void;
};

/** Poster tile for the horizontal Explore rows and person credit grids. */
export function TitleCard({ hit, saved, busy, onPress }: Props) {
  const width = useCardWidth();
  return (
    <Tappable onPress={onPress} disabled={busy} style={[styles.card, { width }]}>
      <View>
        <Poster
          path={hit.posterPath}
          width={width}
          mediaType={hit.mediaType}
          size="w342"
        />
        {(saved || busy) && (
          <View style={styles.badge}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Ionicons name="checkmark" size={13} color={colors.bg} />
            )}
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {hit.title}
      </Text>
      <Text style={styles.meta}>
        {[hit.mediaType === 'tv' ? 'TV' : 'Film', hit.year ?? '—'].join(' · ')}
      </Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  meta: {
    color: colors.textFaint,
    fontSize: 11,
  },
});
