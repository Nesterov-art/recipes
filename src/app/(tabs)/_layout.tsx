import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { Tabs, type BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useEffect, useRef, useState, type ComponentProps, type PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ViewRef } from '@/components/settings-list';
import { MONOREC_THEMES } from '@/constants/theme';
import { MonorecTabBar } from '@/components/monorec-tab-bar';
import { PaletteProvider, useSettings } from '@/context/settings-context';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Browsers keep the tab bar above the on-screen keyboard while a field is being
// edited. Hide it then, as Android does natively with tabBarHideOnKeyboard. The
// keyboard is open when a field is focused and the visible height has shrunk
// against the height measured while nothing was being edited.
function useWebKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const visibleHeight = () => window.visualViewport?.height ?? window.innerHeight;
    let fullHeight = visibleHeight();
    const update = () => {
      const active = document.activeElement;
      const editing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
      if (!editing) fullHeight = visibleHeight();
      setOpen(editing && visibleHeight() < fullHeight * 0.8);
    };
    const rotate = () => { fullHeight = visibleHeight(); update(); };
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', rotate);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', rotate);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return open;
}

// On the web inactive tabs stay rendered beneath the active one, so their controls
// would still take keyboard focus. `inert` removes them from focus and from
// assistive technology without unmounting, so search and scroll are kept.
function TabScene({ children }: PropsWithChildren) {
  const focused = useIsFocused();
  const ref = useRef<ViewRef>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (node) node.inert = !focused;
  }, [focused]);
  return <View ref={ref} style={{ flex: 1 }}>{children}</View>;
}

export default function TabsLayout() {
  return <PaletteProvider palette={MONOREC_THEMES}><MonorecTabs /></PaletteProvider>;
}

function MonorecTabs() {
  const { colors, t } = useSettings();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useWebKeyboardOpen();
  // iOS standalone web apps already constrain the root above the Home
  // Indicator; adding the CSS safe-area inset again would lift the bar twice.
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;

  // The selected tab differs by a filled icon as well as by colour.
  const icon = (outline: IconName, filled: IconName) => {
    function TabIcon({ focused, color, size }: Parameters<NonNullable<BottomTabNavigationOptions['tabBarIcon']>>[0]) {
      return <Ionicons name={focused ? filled : outline} size={size} color={typeof color === 'number' ? colors.text : color ?? colors.muted} />;
    }
    return TabIcon;
  };

  return (
    <Tabs
      safeAreaInsets={{ bottom: bottomInset }}
      backBehavior="history"
      tabBar={props => <MonorecTabBar {...props} webKeyboardOpen={keyboardOpen} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        // Like the system iOS tab bar, labels keep their size with large text.
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
        tabBarStyle: { height: 80 + Math.max(bottomInset, 8) },
        sceneStyle: { backgroundColor: colors.bg },
      }}
      screenLayout={({ children }) => <TabScene>{children}</TabScene>}
    >
      <Tabs.Screen name="index" options={{ title: t('tabChoice'), tabBarAccessibilityLabel: t('tabChoice'), tabBarIcon: icon('shuffle-outline', 'shuffle') }} />
      <Tabs.Screen name="recipes" options={{ title: t('tabRecipes'), tabBarAccessibilityLabel: t('tabRecipes'), tabBarIcon: icon('book-outline', 'book') }} />
      <Tabs.Screen name="shopping" options={{ title: t('tabShopping'), tabBarAccessibilityLabel: t('tabShopping'), tabBarIcon: icon('basket-outline', 'basket') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabSettings'), tabBarAccessibilityLabel: t('tabSettings'), tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}
