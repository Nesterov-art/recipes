import { type PropsWithChildren, useCallback, useEffect } from 'react';
import { Stack, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppToast } from '@/components/app-toast';
import { RecipesProvider, useRecipes } from '@/context/recipes-context';
import { SettingsProvider, useSettings } from '@/context/settings-context';
import { ShoppingProvider, useShopping } from '@/context/shopping-context';
import { ToastProvider } from '@/context/toast-context';

function WebScreenTransition({ children }: PropsWithChildren) {
  const opacity = useSharedValue(0);

  useFocusEffect(useCallback(() => {
    opacity.set(0);
    opacity.set(withTiming(1, { duration: 180 }));

    return () => {
      opacity.set(0);
    };
  }, [opacity]));

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>;
}

function ScreenTransition({ children }: PropsWithChildren) {
  if (Platform.OS !== 'web') return children;
  return <WebScreenTransition>{children}</WebScreenTransition>;
}

function RootNavigator() {
  const { loaded: recipesLoaded } = useRecipes();
  const { loaded: shoppingLoaded } = useShopping();
  const { colors, loaded: settingsLoaded } = useSettings();
  if (!recipesLoaded || !settingsLoaded || !shoppingLoaded) return null;

  return (
    <Stack
      screenLayout={({ children }) => <ScreenTransition>{children}</ScreenTransition>}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
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
