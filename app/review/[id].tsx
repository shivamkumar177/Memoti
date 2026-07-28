import { Ionicons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { RatingPicker } from '../../src/components/RatingPicker';
import { getTitle, setReview, setUserRating } from '../../src/db/queries';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import { colors, formatDate, radius, spacing } from '../../src/theme';

/** Write or edit the rating and review for one title. */
export default function ReviewScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const titleId = Number(params.id);
  const db = useSQLiteContext();
  const router = useRouter();

  const [text, setText] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: title } = useDbQuery(
    useCallback((database) => getTitle(database, titleId), [titleId]),
    [titleId]
  );

  // Seed the form from the database once, so typing isn't overwritten by the
  // focus-triggered refetch.
  useEffect(() => {
    if (!title || hydrated) return;
    setText(title.review ?? '');
    setRating(title.user_rating);
    setHydrated(true);
  }, [title, hydrated]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await Promise.all([
        setReview(db, titleId, text),
        setUserRating(db, titleId, rating),
      ]);
      router.back();
    } finally {
      setSaving(false);
    }
  }, [db, titleId, text, rating, router]);

  const clear = useCallback(async () => {
    setSaving(true);
    try {
      await setReview(db, titleId, '');
      router.back();
    } finally {
      setSaving(false);
    }
  }, [db, titleId, router]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {title && (
          <View style={styles.head}>
            <Text style={styles.title}>{title.title}</Text>
            {title.reviewed_at && (
              <Text style={styles.dim}>
                Last edited {formatDate(title.reviewed_at.slice(0, 10))}
              </Text>
            )}
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Rating</Text>
          <RatingPicker value={rating} onChange={setRating} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Review</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What did you think of it?"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            autoFocus={!title?.review}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{text.trim().length} characters</Text>
        </View>

        <Pressable
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>

        {Boolean(title?.review) && (
          <Pressable
            onPress={clear}
            disabled={saving}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="trash-outline" size={15} color={colors.danger} />
            <Text style={styles.clearText}>Delete review</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  head: {
    gap: spacing.xs,
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
    lineHeight: 21,
    padding: spacing.md,
    minHeight: 160,
  },
  counter: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'right',
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.bg,
    fontWeight: '700',
    fontSize: 15,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  clearText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  dim: {
    color: colors.textDim,
    fontSize: 12,
  },
});
