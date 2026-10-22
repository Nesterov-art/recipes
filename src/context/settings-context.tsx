import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSystemFontScale } from '@/hooks/use-system-font-scale';
import { useSafeStore } from '@/hooks/use-safe-store';
import { settingsConfig } from '@/utils/storage-models';
import { StorageGuard } from '@/components/storage-guard';

import { createTranslator, type Language, type Translate } from '@/constants/i18n';
import {
  THEMES,
  type AppColors,
  type ResolvedThemeMode,
  type ThemeMode,
} from '@/constants/theme';

export type ShoppingCompletedBehavior = 'keep' | 'moveDown';

type SettingsContextValue = {
  loaded: boolean;
  theme: ThemeMode;
  setTheme: (value: ThemeMode) => void;
  resolvedTheme: ResolvedThemeMode;
  language: Language;
  setLanguage: (value: Language) => void;
  shoppingCompletedBehavior: ShoppingCompletedBehavior;
  setShoppingCompletedBehavior: (value: ShoppingCompletedBehavior) => void;
  fontScale: number;
  colors: AppColors;
  t: Translate;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const storage = useSafeStore(() => settingsConfig);
  const { store, loaded, data: { theme, language, shoppingCompletedBehavior } } = storage;
  const fontScale = useSystemFontScale();

  const resolvedTheme: ResolvedThemeMode = theme === 'system'
    ? systemColorScheme === 'light' ? 'light' : 'dark'
    : theme;

  const value = useMemo<SettingsContextValue>(() => ({
    loaded, theme, setTheme: theme => { void store.update(current => ({ ...current, theme })); },
    resolvedTheme, language, setLanguage: language => { void store.update(current => ({ ...current, language })); },
    shoppingCompletedBehavior, setShoppingCompletedBehavior: shoppingCompletedBehavior => { void store.update(current => ({ ...current, shoppingCompletedBehavior })); },
    fontScale,
    colors: THEMES[resolvedTheme], t: createTranslator(language),
  }), [fontScale, language, loaded, resolvedTheme, shoppingCompletedBehavior, theme, store]);

  return <SettingsContext.Provider value={value}><StorageGuard {...storage} colors={value.colors} t={value.t}>{children}</StorageGuard></SettingsContext.Provider>;
}
