import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { remoteDb, signOut } from '../../src/db/client';
import {
  colors,
  MAX_CONTENT_WIDTH,
  radius,
  spacing,
  useIsWide,
} from '../../src/theme';

export default function TabsLayout() {
  const wide = useIsWide();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700', fontSize: wide ? 28 : 20 },
        // Wide screens get a left rail instead of a stretched bottom bar.
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderRightColor: colors.border,
          // The sidebar defaults to a minWidth of ~25% of the window; too roomy.
          ...(wide && { minWidth: 232 }),
          // Phone browsers: the default 49px bar clips the labels' descenders.
          ...(!wide && Platform.OS === 'web' && { height: 58, paddingBottom: 6 }),
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        sceneStyle: wide
          ? {
              backgroundColor: colors.bg,
              width: '100%',
              maxWidth: MAX_CONTENT_WIDTH,
              alignSelf: 'center',
            }
          : { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          headerRight: remoteDb ? SignOutButton : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function SignOutButton() {
  return (
    <Pressable
      onPress={signOut}
      style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Ionicons name="log-out-outline" size={16} color={colors.text} />
      <Text style={styles.signOutText}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginRight: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  signOutText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
