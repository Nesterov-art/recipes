import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Language } from '@/constants/i18n';
import type { ThemeMode } from '@/constants/theme';
import {
  useSettings,
  type ShoppingCompletedBehavior,
  type TextSize,
} from '@/context/settings-context';
import { useStyles } from '@/styles';

const FEEDBACK_URL = 'https://github.com/Nesterov-art/recipes/issues/new';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    colors,
    language,
    setLanguage,
    setShoppingCompletedBehavior,
    setTextSize,
    setTheme,
    shoppingCompletedBehavior,
    t,
    textSize,
    theme,
  } = useSettings();
  const styles = useStyles();
  const appVersion = Constants.expoConfig?.version ?? '—';

  const themes: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: 'system', label: t('systemTheme'), icon: 'contrast-outline' },
    { value: 'light', label: t('light'), icon: 'sunny-outline' },
    { value: 'dark', label: t('dark'), icon: 'moon-outline' },
  ];
  const languages: { value: Language; label: string }[] = [
    { value: 'ru', label: t('russian') },
    { value: 'en', label: t('english') },
  ];
  const textSizes: { value: TextSize; label: string }[] = [
    { value: 'small', label: t('textSmall') },
    { value: 'standard', label: t('textStandard') },
    { value: 'large', label: t('textLarge') },
  ];
  const shoppingBehaviors: { value: ShoppingCompletedBehavior; label: string }[] = [
    { value: 'keep', label: t('keepCompletedInPlace') },
    { value: 'moveDown', label: t('moveCompletedDown') },
  ];

  function openFeedback() {
    const title = encodeURIComponent(`[${appVersion}] `);
    void Linking.openURL(`${FEEDBACK_URL}?title=${title}`).catch((error) => {
      console.warn('Unable to open feedback page', error);
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.bigTitle}>{t('settings')}</Text>

        <Text style={styles.settingLabel}>{t('appearance')}</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.choiceRow}>
            {themes.map((item) => {
              const active = theme === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setTheme(item.value)}
                  style={({ pressed }) => [
                    styles.choice,
                    styles.themeChoice,
                    active && styles.choiceActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={active ? colors.accentText : colors.text}
                  />
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.settingLabel}>{t('language')}</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.choiceRow}>
            {languages.map((item) => {
              const active = language === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setLanguage(item.value)}
                  style={({ pressed }) => [
                    styles.choice,
                    active && styles.choiceActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.settingLabel}>{t('textSize')}</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.choiceRow}>
            {textSizes.map((item) => {
              const active = textSize === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setTextSize(item.value)}
                  style={({ pressed }) => [
                    styles.choice,
                    active && styles.choiceActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.settingLabel}>{t('shoppingBehavior')}</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.choiceRow}>
            {shoppingBehaviors.map((item) => {
              const active = shoppingCompletedBehavior === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => setShoppingCompletedBehavior(item.value)}
                  style={({ pressed }) => [
                    styles.choice,
                    active && styles.choiceActive,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={styles.settingLabel}>{t('aboutApp')}</Text>
        <View style={styles.settingsCard}>
          <Pressable
            onPress={openFeedback}
            style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}
            accessibilityRole="link"
            accessibilityLabel={t('feedback')}
          >
            <Ionicons name="chatbubble-outline" size={20} color={colors.text} />
            <Text style={styles.settingsRowText}>{t('feedback')}</Text>
            <Ionicons name="open-outline" size={18} color={colors.muted} />
          </Pressable>
          <View style={styles.settingsSeparator} />
          <View style={styles.settingsRow}>
            <Ionicons name="information-circle-outline" size={20} color={colors.text} />
            <Text style={styles.settingsRowText}>{t('version')}</Text>
            <Text style={styles.settingsRowValue}>{appVersion}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
