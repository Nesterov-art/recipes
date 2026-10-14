import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router/js-stack';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppToast } from '@/components/app-toast';
import { RecipesProvider, useRecipes } from '@/context/recipes-context';
import { SettingsProvider, useSettings } from '@/context/settings-context';
import { ShoppingProvider, useShopping } from '@/context/shopping-context';
import { ToastProvider } from '@/context/toast-context';

function RootNavigator() {
  const [webHistoryNavigating, setWebHistoryNavigating] = useState(false);
  const historyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { loaded: recipesLoaded } = useRecipes();
  const { loaded: shoppingLoaded } = useShopping();
  const { colors, loaded: settingsLoaded } = useSettings();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handlePopState = () => {
      setWebHistoryNavigating(true);
      if (historyResetRef.current) clearTimeout(historyResetRef.current);
      historyResetRef.current = setTimeout(() => {
        setWebHistoryNavigating(false);
        historyResetRef.current = null;
      }, 300);
    };

    window.addEventListener('popstate', handlePopState, { capture: true });
    return () => {
      window.removeEventListener('popstate', handlePopState, { capture: true });
      if (historyResetRef.current) clearTimeout(historyResetRef.current);
    };
  }, []);

  if (!recipesLoaded || !settingsLoaded || !shoppingLoaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: Platform.OS !== 'web',
        // Safari already animates its interactive edge-swipe. Avoid replaying
        // the stack animation after popstate, while keeping button transitions.
        animation: webHistoryNavigating ? 'none' : 'slide_from_right',
        // Expo web keeps document.body non-scrollable. Constrain the card to
        // the visible app viewport so every screen's own list remains the
        // scroll container without switching to a floating-header layout.
        cardStyle: {
          flex: 1,
          height: '100%',
          overflow: 'hidden',
          backgroundColor: colors.bg,
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="recipe/[id]" options={{ animationTypeForReplace: 'push' }} />
      <Stack.Screen name="shopping" />
      <Stack.Screen name="shopping-matches" />
      <Stack.Screen name="history" />
      <Stack.Screen name="settings" />
      <Stack.Screen
        name="cook"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="shopping-select"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="form"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

function AppContent() {
  const { colors, theme } = useSettings();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    document.documentElement.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
  }, [colors.bg]);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.bg }}>
      <ToastProvider>
        <ShoppingProvider>
          <RecipesProvider>
            <RootNavigator />
            <AppToast />
          </RecipesProvider>
        </ShoppingProvider>
      </ToastProvider>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppContent />
      </GestureHandlerRootView>
    </SettingsProvider>
  );
}
