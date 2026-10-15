import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { createTranslator, type Language, type Translate } from '@/constants/i18n';
import {
  THEMES,
  type AppColors,
  type ResolvedThemeMode,
  type ThemeMode,
} from '@/constants/theme';

const SETTINGS_KEY = 'app-settings-v1';

export type TextSize = 'small' | 'standard' | 'large';
export type ShoppingCompletedBehavior = 'keep' | 'moveDown';

const TEXT_SCALES: Record<TextSize, number> = {
  small: 0.9,
  standard: 1,
  large: 1.12,
};

type SettingsContextValue = {
  loaded: boolean;
  theme: ThemeMode;
  setTheme: (value: ThemeMode) => void;
  resolvedTheme: ResolvedThemeMode;
  language: Language;
  setLanguage: (value: Language) => void;
  textSize: TextSize;
  setTextSize: (value: TextSize) => void;
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
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [language, setLanguage] = useState<Language>('ru');
  const [textSize, setTextSize] = useState<TextSize>('standard');
  const [shoppingCompletedBehavior, setShoppingCompletedBehavior] =
    useState<ShoppingCompletedBehavior>('moveDown');

  useEffect(() => {
    async function load() {
      try {
        const json = await AsyncStorage.getItem(SETTINGS_KEY);
        if (json) {
          const value = JSON.parse(json) as {
            theme?: unknown;
            language?: unknown;
            textSize?: unknown;
            shoppingCompletedBehavior?: unknown;
          };
          if (value.theme === 'system' || value.theme === 'light' || value.theme === 'dark') {
            setTheme(value.theme);
          }
          if (value.language === 'ru' || value.language === 'en') setLanguage(value.language);
          if (value.textSize === 'small' || value.textSize === 'standard' || value.textSize === 'large') {
            setTextSize(value.textSize);
          }
          if (
            value.shoppingCompletedBehavior === 'keep'
            || value.shoppingCompletedBehavior === 'moveDown'
          ) {
            setShoppingCompletedBehavior(value.shoppingCompletedBehavior);
          }
        }
      } catch (error) {
        console.warn('Unable to load settings', error);
      } finally {
        setLoaded(true);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
      theme,
      language,
      textSize,
      shoppingCompletedBehavior,
    })).catch((error) => {
      console.warn('Unable to save settings', error);
    });
  }, [language, loaded, shoppingCompletedBehavior, textSize, theme]);

  const resolvedTheme: ResolvedThemeMode = theme === 'system'
    ? systemColorScheme === 'light' ? 'light' : 'dark'
    : theme;

  const value = useMemo<SettingsContextValue>(() => ({
    loaded, theme, setTheme, resolvedTheme, language, setLanguage, textSize, setTextSize,
    shoppingCompletedBehavior, setShoppingCompletedBehavior,
    fontScale: TEXT_SCALES[textSize],
    colors: THEMES[resolvedTheme], t: createTranslator(language),
  }), [language, loaded, resolvedTheme, shoppingCompletedBehavior, textSize, theme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
