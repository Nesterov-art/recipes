import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, usePathname } from 'expo-router';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Onboarding } from '@/components/onboarding';
import { ProfileStorageGate } from '@/components/profile-storage-gate';
import { OnboardingProvider, useOnboarding } from '@/context/onboarding-context';
import { AppToast } from '@/components/app-toast';
import { RecipesProvider, useRecipes } from '@/context/recipes-context';
import { SettingsProvider, useSettings } from '@/context/settings-context';
import { ShoppingProvider, useShopping } from '@/context/shopping-context';
import { ToastProvider } from '@/context/toast-context';
import { RECIPE_LINK_PATH } from '@/utils/recipe-link';

function RootNavigator() {
  const { completed } = useOnboarding();
  const { loaded: recipesLoaded } = useRecipes();
  const { loaded: shoppingLoaded } = useShopping();
  const { colors, loaded: settingsLoaded } = useSettings();
  // Icons load their font themselves on mount and leave a failed load unhandled, e.g.
  // when the page is left mid-request on web. Loading it once here handles the error,
  // and icons mounted afterwards find the font in place. A failed load still renders.
  const [iconsLoaded, iconsError] = useFonts(Ionicons.font);
  const pathname = usePathname();

  if (!recipesLoaded || !settingsLoaded || !shoppingLoaded) return null;
  if (!iconsLoaded && !iconsError) return null;

  // A shared recipe opened from a link shows at once, before any introduction.
  if (!completed && pathname !== RECIPE_LINK_PATH) return <Onboarding />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* The four tabs; nested screens below open over them without the tab bar. */}
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="recipe/[id]" options={{ animationTypeForReplace: 'push' }} />
      <Stack.Screen name="shopping-matches" />
      <Stack.Screen name="history" />
      <Stack.Screen name="about" />
      <Stack.Screen name="backup" />
      <Stack.Screen name="shared-recipe" />
      <Stack.Screen
        name="import-link"
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="cooking"
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="shopping-select"
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="form"
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          gestureEnabled: false,
        }}
      />
    </Stack>
  );
}

function AppContent() {
  const { colors, resolvedTheme } = useSettings();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    document.documentElement.style.backgroundColor = colors.bg;
    document.body.style.backgroundColor = colors.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.bg);
    document.getElementById('app-favicon')?.setAttribute('href', `/favicon-cookbook-${resolvedTheme}.png`);
    // Safari captures this icon when adding to Home Screen; installed icons
    // are managed by iOS and cannot be changed by switching the app theme.
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', `/apple-touch-icon-cookbook-${resolvedTheme}.png`);
  }, [colors.bg, resolvedTheme]);

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
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <ProfileStorageGate><OnboardingProvider>
      <SettingsProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppContent />
        </GestureHandlerRootView>
      </SettingsProvider>
    </OnboardingProvider></ProfileStorageGate>
  );
}
