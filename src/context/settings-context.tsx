import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { createTranslator, type Language, type Translate } from '@/constants/i18n';
import { THEMES, type AppColors, type ThemeMode } from '@/constants/theme';

const SETTINGS_KEY = 'app-settings-v1';

export type TextSize = 'small' | 'standard' | 'large';

const TEXT_SCALES: Record<TextSize, number> = {
  small: 0.9,
  standard: 1,
  large: 1.12,
};

type SettingsContextValue = {
  loaded: boolean;
  theme: ThemeMode;
  setTheme: (value: ThemeMode) => void;
  language: Language;
  setLanguage: (value: Language) => void;
  textSize: TextSize;
  setTextSize: (value: TextSize) => void;
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
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [language, setLanguage] = useState<Language>('ru');
  const [textSize, setTextSize] = useState<TextSize>('standard');

  useEffect(() => {
    async function load() {
      try {
        const json = await AsyncStorage.getItem(SETTINGS_KEY);
        if (json) {
          const value = JSON.parse(json) as { theme?: unknown; language?: unknown; textSize?: unknown };
          if (value.theme === 'light' || value.theme === 'dark') setTheme(value.theme);
          if (value.language === 'ru' || value.language === 'en') setLanguage(value.language);
          if (value.textSize === 'small' || value.textSize === 'standard' || value.textSize === 'large') {
            setTextSize(value.textSize);
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
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme, language, textSize })).catch((error) => {
      console.warn('Unable to save settings', error);
    });
  }, [language, loaded, textSize, theme]);

  const value = useMemo<SettingsContextValue>(() => ({
    loaded, theme, setTheme, language, setLanguage, textSize, setTextSize,
    fontScale: TEXT_SCALES[textSize],
    colors: THEMES[theme], t: createTranslator(language),
  }), [language, loaded, textSize, theme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
