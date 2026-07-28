import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { imageUrl } from '../api/tmdb';
import { colors, radius, POSTER_RATIO } from '../theme';
import type { MediaType } from '../db/types';

type Props = {
  path: string | null;
  width: number;
  mediaType?: MediaType;
  size?: 'w154' | 'w342' | 'w500';
};

/** Poster with a typed placeholder for titles TMDB has no artwork for. */
export function Poster({ path, width, mediaType, size = 'w342' }: Props) {
  const height = width / POSTER_RATIO;
  const url = imageUrl(path, size);

  if (!url) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <Ionicons
          name={mediaType === 'tv' ? 'tv-outline' : 'film-outline'}
          size={Math.max(16, width * 0.3)}
          color={colors.textFaint}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width, height, borderRadius: radius.sm }}
      contentFit="cover"
      transition={180}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
