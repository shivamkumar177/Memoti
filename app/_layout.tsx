import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SignIn } from '../src/components/SignIn';
import { remoteDb, useSession } from '../src/db/client';
import { DATABASE_NAME, migrateDbIfNeeded } from '../src/db/schema';
import { colors, useIsWide } from '../src/theme';

// Navigator chrome (screen containers, tab bar, headers) in the app palette, so
// nothing falls back to React Navigation's light grey.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  // Detail and modal screens read better as a centered column on wide screens.
  const wide = useIsWide();
  const detail = {
    contentStyle: wide
      ? {
          backgroundColor: colors.bg,
          width: '100%' as const,
          maxWidth: 820,
          alignSelf: 'center' as const,
        }
      : { backgroundColor: colors.bg },
  };
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ThemeProvider value={navTheme}>
          <Suspense fallback={<Loading />}>
            <DataGate>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerShadowVisible: false,
                  headerTintColor: colors.text,
                  headerTitleStyle: { fontWeight: '600' },
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="title/[id]"
                  options={{ ...detail, title: '', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                  name="person/[id]"
                  options={{ ...detail, title: '', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                  name="log/[id]"
                  options={{
                    ...detail,
                    presentation: 'modal',
                    title: 'Log a watch',
                  }}
                />
                <Stack.Screen
                  name="review/[id]"
                  options={{
                    ...detail,
                    presentation: 'modal',
                    title: 'Review',
                  }}
                />
              </Stack>
            </DataGate>
          </Suspense>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * With the Memoti API configured, data lives in D1 behind a sign-in and
 * on-device SQLite is never opened.
 */
function DataGate({ children }: { children: ReactNode }) {
  const session = useSession();
  if (remoteDb) {
    if (session === 'loading') return <Loading />;
    return session === 'signedIn' ? children : <SignIn />;
  }
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded} useSuspense>
      {children}
    </SQLiteProvider>
  );
}

function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
