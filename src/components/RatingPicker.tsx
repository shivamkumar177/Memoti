import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme';

type Props = {
  value: number | null;
  onChange: (rating: number | null) => void;
};

/** 1–10 rating strip. Tapping the current value clears it. */
export function RatingPicker({ value, onChange }: Props) {
  return (
    <View>
      <View style={styles.row}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
          const active = value !== null && score <= value;
          return (
            <Pressable
              key={score}
              onPress={() => onChange(value === score ? null : score)}
              style={({ pressed }) => [styles.dot, pressed && styles.pressed]}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${score} out of 10`}
            >
              <Ionicons
                name={active ? 'star' : 'star-outline'}
                size={22}
                color={active ? colors.accent : colors.textFaint}
              />
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.label}>
        {value === null ? 'Not rated' : `${value}/10`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dot: {
    padding: 2,
    borderRadius: radius.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    color: colors.textDim,
    fontSize: 13,
    marginTop: spacing.sm,
  },
});
