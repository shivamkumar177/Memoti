import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  discoverByGenre,
  getGenres,
  hasApiKey,
  imageUrl,
  searchPeople,
  searchTitles,
  TmdbError,
  type Genre,
  type Person,
  type SearchHit,
} from '../../src/api/tmdb';
import { FadeIn } from '../../src/components/FadeIn';
import { Poster } from '../../src/components/Poster';
import { Tappable } from '../../src/components/Tappable';
import { getSavedTmdbIds } from '../../src/db/queries';
import type { MediaType } from '../../src/db/types';
import { hitKey, useAddTitle } from '../../src/hooks/useAddTitle';
import { useDbQuery } from '../../src/hooks/useDbQuery';
import { colors, radius, spacing } from '../../src/theme';

const DEBOUNCE_MS = 350;

type Mode = 'titles' | 'people' | 'genre';

const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { key: 'titles', label: 'Titles', icon: 'film-outline' },
    { key: 'people', label: 'People', icon: 'person-outline' },
    { key: 'genre', label: 'Genre', icon: 'pricetags-outline' },
  ];

export default function SearchScreen() {
  const [mode, setMode] = useState<Mode>('titles');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { add, pending, error: addError } = useAddTitle();
  const { data: savedIds, reload: reloadSaved } = useDbQuery(
    useCallback((db) => getSavedTmdbIds(db), []),
    []
  );

  // Genre mode state
  const [genreType, setGenreType] = useState<MediaType>('movie');
  const [genres, setGenres] = useState<Genre[]>([]);
  const [activeGenre, setActiveGenre] = useState<Genre | null>(null);

  // Guards against a slow earlier request overwriting a newer one's results.
  const requestId = useRef(0);

  // --- text search (titles + people) ---
  useEffect(() => {
    if (mode === 'genre') return;

    const trimmed = query.trim();
    if (!trimmed) {
      setHits([]);
      setPeople([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        if (mode === 'titles') {
          const results = await searchTitles(trimmed);
          if (id !== requestId.current) return;
          setHits(results);
        } else {
          const results = await searchPeople(trimmed);
          if (id !== requestId.current) return;
          setPeople(results);
        }
        reloadSaved();
        setError(null);
      } catch (e) {
        if (id !== requestId.current) return;
        setHits([]);
        setPeople([]);
        setError(
          e instanceof TmdbError ? e.message : 'Something went wrong searching.'
        );
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, mode, reloadSaved]);

  // --- genre list, fetched once per media type ---
  useEffect(() => {
    if (mode !== 'genre') return;
    let alive = true;
    (async () => {
      try {
        const list = await getGenres(genreType);
        if (!alive) return;
        setGenres(list);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(
          e instanceof TmdbError ? e.message : 'Could not load genres.'
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, genreType]);

  // --- genre results ---
  useEffect(() => {
    if (mode !== 'genre' || !activeGenre) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const results = await discoverByGenre(genreType, activeGenre.id);
        if (!alive) return;
        setHits(results);
        reloadSaved();
        setError(null);
      } catch (e) {
        if (!alive) return;
        setHits([]);
        setError(
          e instanceof TmdbError ? e.message : 'Could not load that genre.'
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, genreType, activeGenre, reloadSaved]);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setHits([]);
    setPeople([]);
    setError(null);
    setActiveGenre(null);
    requestId.current++;
  }, []);

  if (!hasApiKey) return <MissingKey />;

  const saved = savedIds ?? new Set<string>();
  const message = addError ?? error;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => switchMode(m.key)}
              style={[styles.modeChip, mode === m.key && styles.modeChipActive]}
            >
              <Ionicons
                name={m.icon}
                size={13}
                color={mode === m.key ? colors.bg : colors.textDim}
              />
              <Text
                style={[
                  styles.modeText,
                  mode === m.key && styles.modeTextActive,
                ]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'genre' ? (
          <GenrePicker
            genreType={genreType}
            genres={genres}
            active={activeGenre}
            onTypeChange={(next) => {
              setGenreType(next);
              setActiveGenre(null);
              setHits([]);
            }}
            onSelect={setActiveGenre}
          />
        ) : (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={
                mode === 'titles'
                  ? 'Search films and shows'
                  : 'Search actors and directors'
              }
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {loading && (
              <ActivityIndicator size="small" color={colors.textDim} />
            )}
            {!loading && query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={colors.textFaint}
                />
              </Pressable>
            )}
          </View>
        )}
      </View>

      {message ? (
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={36} color={colors.danger} />
          <Text style={styles.errorText}>{message}</Text>
        </View>
      ) : mode === 'people' ? (
        <PeopleList
          people={people}
          query={query}
          loading={loading}
        />
      ) : (
        <TitleResults
          hits={hits}
          saved={saved}
          pending={pending}
          onAdd={add}
          loading={loading}
          emptyHint={
            mode === 'genre'
              ? activeGenre
                ? `Nothing found in ${activeGenre.name}.`
                : 'Pick a genre to browse.'
              : query.trim()
                ? `No results for “${query.trim()}”.`
                : 'Search TMDB for anything you have watched.'
          }
        />
      )}
    </View>
  );
}

function GenrePicker({
  genreType,
  genres,
  active,
  onTypeChange,
  onSelect,
}: {
  genreType: MediaType;
  genres: Genre[];
  active: Genre | null;
  onTypeChange: (type: MediaType) => void;
  onSelect: (genre: Genre) => void;
}) {
  return (
    <View style={styles.genreWrap}>
      <View style={styles.typeRow}>
        {(['movie', 'tv'] as MediaType[]).map((type) => (
          <Pressable
            key={type}
            onPress={() => onTypeChange(type)}
            style={[styles.typeChip, genreType === type && styles.typeChipActive]}
          >
            <Text
              style={[
                styles.typeText,
                genreType === type && styles.typeTextActive,
              ]}
            >
              {type === 'movie' ? 'Films' : 'TV'}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.genreRow}
      >
        {genres.map((genre) => (
          <Pressable
            key={genre.id}
            onPress={() => onSelect(genre)}
            style={[
              styles.genreChip,
              active?.id === genre.id && styles.genreChipActive,
            ]}
          >
            <Text
              style={[
                styles.genreText,
                active?.id === genre.id && styles.genreTextActive,
              ]}
            >
              {genre.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function TitleResults({
  hits,
  saved,
  pending,
  onAdd,
  loading,
  emptyHint,
}: {
  hits: SearchHit[];
  saved: Set<string>;
  pending: string | null;
  onAdd: (hit: SearchHit) => void;
  loading: boolean;
  emptyHint: string;
}) {
  if (loading && hits.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (hits.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="film-outline" size={40} color={colors.textFaint} />
        <Text style={styles.hint}>{emptyHint}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={hits}
      keyExtractor={(item) => hitKey(item)}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item, index }) => {
        const key = hitKey(item);
        return (
          <FadeIn index={index}>
            <ResultRow
              hit={item}
              saved={saved.has(key)}
              busy={pending === key}
              onAdd={() => onAdd(item)}
            />
          </FadeIn>
        );
      }}
    />
  );
}

function ResultRow({
  hit,
  saved,
  busy,
  onAdd,
}: {
  hit: SearchHit;
  saved: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <Tappable onPress={onAdd} disabled={busy} style={styles.row} scaleTo={0.98}>
      <Poster
        path={hit.posterPath}
        width={52}
        mediaType={hit.mediaType}
        size="w154"
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {hit.title}
        </Text>
        <Text style={styles.rowMeta}>
          {[hit.mediaType === 'tv' ? 'TV' : 'Film', hit.year ?? '—'].join(' · ')}
        </Text>
        {hit.overview && (
          <Text style={styles.overview} numberOfLines={2}>
            {hit.overview}
          </Text>
        )}
      </View>
      <View style={styles.action}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons
            name={saved ? 'checkmark-circle' : 'add-circle-outline'}
            size={26}
            color={saved ? colors.positive : colors.accent}
          />
        )}
      </View>
    </Tappable>
  );
}

function PeopleList({
  people,
  query,
  loading,
}: {
  people: Person[];
  query: string;
  loading: boolean;
}) {
  if (loading && people.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (people.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-outline" size={40} color={colors.textFaint} />
        <Text style={styles.hint}>
          {query.trim()
            ? `No people found for “${query.trim()}”.`
            : 'Find an actor or director, then browse everything they worked on.'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={people}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item, index }) => (
        <FadeIn index={index}>
          <Link href={`/person/${item.id}`} asChild>
            <Tappable style={styles.row} scaleTo={0.98}>
              <PersonAvatar path={item.profilePath} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.department && (
                  <Text style={styles.rowMeta}>{item.department}</Text>
                )}
                {item.knownFor && (
                  <Text style={styles.overview} numberOfLines={2}>
                    {item.knownFor}
                  </Text>
                )}
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textFaint}
              />
            </Tappable>
          </Link>
        </FadeIn>
      )}
    />
  );
}

function PersonAvatar({ path }: { path: string | null }) {
  const url = imageUrl(path, 'w154');
  if (!url) {
    return (
      <View style={styles.avatarPlaceholder}>
        <Ionicons name="person" size={22} color={colors.textFaint} />
      </View>
    );
  }
  return (
    <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" />
  );
}

function MissingKey() {
  return (
    <View style={styles.centered}>
      <Ionicons name="key-outline" size={44} color={colors.accent} />
      <Text style={styles.hintTitle}>TMDB key needed</Text>
      <Text style={styles.hint}>
        Create a free API key at themoviedb.org, then add it to a{' '}
        <Text style={styles.code}>.env</Text> file in the project root:
      </Text>
      <View style={styles.codeBlock}>
        <Text style={styles.codeBlockText}>
          EXPO_PUBLIC_TMDB_API_KEY=your_key_here
        </Text>
      </View>
      <Text style={styles.hint}>
        Restart the bundler with <Text style={styles.code}>npx expo start -c</Text>{' '}
        afterwards.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  modeChipActive: {
    backgroundColor: colors.accent,
  },
  modeText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  modeTextActive: {
    color: colors.bg,
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
    fontSize: 15,
    padding: 0,
  },
  genreWrap: {
    gap: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  typeChipActive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  typeText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  typeTextActive: {
    color: colors.accent,
  },
  genreRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  genreChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  genreChipActive: {
    backgroundColor: colors.accent,
  },
  genreText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  genreTextActive: {
    color: colors.bg,
  },
  list: {
    padding: spacing.lg,
  },
  separator: {
    height: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
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
  overview: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
  action: {
    width: 30,
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  hintTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  code: {
    color: colors.accent,
    fontFamily: 'Courier',
  },
  codeBlock: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  codeBlockText: {
    color: colors.text,
    fontFamily: 'Courier',
    fontSize: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
