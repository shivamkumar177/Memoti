import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RatingPicker } from '../../src/components/RatingPicker';
import { getTitle, logWatch, today } from '../../src/db/queries';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import { colors, radius, spacing } from '../../src/theme';

/**
 * Manual watch entry for a movie on a past date. Uses a plain text field for the
 * date rather than a native picker so the app has no extra native dependency.
 */
export default function LogWatchScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const titleId = Number(params.id);
  const db = useSQLiteContext();
  const router = useRouter();

  const [date, setDate] = useState(today());
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: title } = useDbQuery(
    useCallback((database) => getTitle(database, titleId), [titleId]),
    [titleId]
  );

  const dateError = validateDate(date);

  const save = useCallback(async () => {
    if (dateError) return;
    setSaving(true);
    try {
      await logWatch(db, {
        title_id: titleId,
        watched_on: date,
        rating,
        notes: notes.trim() || null,
        season_number: null,
        episode_number: null,
        episode_name: null,
        runtime: title?.runtime ?? null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [db, titleId, date, rating, notes, title, router, dateError]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {title && <Text style={styles.title}>{title.title}</Text>}

      <View style={styles.field}>
        <Text style={styles.label}>Date watched</Text>
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, dateError && styles.inputError]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        {dateError ? (
          <Text style={styles.errorText}>{dateError}</Text>
        ) : (
          <View style={styles.presetRow}>
            <Preset label="Today" onPress={() => setDate(today())} />
            <Preset label="Yesterday" onPress={() => setDate(daysAgo(1))} />
            <Preset label="A week ago" onPress={() => setDate(daysAgo(7))} />
          </View>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Rating for this watch</Text>
        <RatingPicker value={rating} onChange={setRating} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Where you saw it, who with, what you thought…"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.notesInput]}
          multiline
        />
      </View>

      <Pressable
        onPress={save}
        disabled={saving || Boolean(dateError)}
        style={({ pressed }) => [
          styles.saveButton,
          (saving || dateError) && styles.saveButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        {saving ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Text style={styles.saveButtonText}>Save watch</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Preset({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.preset, pressed && styles.pressed]}
    >
      <Text style={styles.presetText}>{label}</Text>
    </Pressable>
  );
}

/** Returns an error message, or null when the date is a real calendar date. */
function validateDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Use the format YYYY-MM-DD.';
  }
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12) return 'That month does not exist.';
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return 'That day does not exist in this month.';
  }
  if (value > today()) return 'That date is in the future.';
  return null;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  presetText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.7,
  },
});
