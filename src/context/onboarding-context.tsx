import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

const KEY = 'app-onboarding-v1';
const LEGACY_KEYS = ['recipe-book-v1', 'recipes', 'recipe-meta-v1', 'shopping-list-v1', 'app-settings-v1'];
const Context = createContext<{ completed: boolean; complete: () => Promise<void>; restart: () => Promise<void> } | null>(null);

export function useOnboarding() {
  const value = useContext(Context);
  if (!value) throw new Error('useOnboarding requires OnboardingProvider');
  return value;
}

export function OnboardingProvider({ children }: PropsWithChildren) {
  const [loaded, setLoaded] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const entries = await AsyncStorage.multiGet([KEY, ...LEGACY_KEYS]);
        const status = entries[0][1];
        const isCompleted = status === 'completed'
          || (status === null && entries.slice(1).some(([, value]) => value !== null));
        // Write before mounting data providers: a reload during onboarding must not
        // mistake their newly saved empty collections for a legacy installation.
        await AsyncStorage.setItem(KEY, isCompleted ? 'completed' : 'pending');
        if (active) { setCompleted(isCompleted); setLoaded(true); setError(false); }
      } catch (err) {
        console.warn('Unable to load onboarding', err);
        if (active) setError(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [attempt]);

  async function complete() {
    await AsyncStorage.setItem(KEY, 'completed');
    setCompleted(true);
  }

  async function restart() {
    await AsyncStorage.setItem(KEY, 'pending');
    setCompleted(false);
  }

  if (error) return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 24, backgroundColor: '#000' }}>
      <Text style={{ color: '#FFF', fontSize: 18 }}>Не удалось открыть данные / Unable to open data</Text>
      <Pressable accessibilityRole="button" onPress={() => { setError(false); setAttempt(value => value + 1); }}>
        <Text style={{ color: '#FFF', fontSize: 18 }}>Повторить / Retry</Text>
      </Pressable>
    </View>
  );
  if (!loaded) return null;
  return <Context.Provider value={{ completed, complete, restart }}>{children}</Context.Provider>;
}
