import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ICONS } from '@/constants/app-icons';
import type { Language } from '@/constants/i18n';
import { MONOREC_THEMES, type ThemeMode } from '@/constants/theme';
import {
  PaletteProvider,
  useSettings,
  type ShoppingCompletedBehavior,
} from '@/context/settings-context';
import { useOnboarding } from '@/context/onboarding-context';
import { useToast } from '@/context/toast-context';
import { OptionMenu, type MenuAnchor } from '@/components/option-menu';
import { RecipeTransfer } from '@/components/recipe-transfer';
import { SettingsRow, SettingsSection } from '@/components/settings-list';
import { useStyles } from '@/styles';
import { openFeedback } from '@/utils/feedback';

type MenuKey = 'theme' | 'language' | 'shopping';

export default function SettingsScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><SettingsContent /></PaletteProvider>;
}

function SettingsContent() {
  const insets = useSafeAreaInsets();
  const {
    colors,
    language,
    resolvedTheme,
    setLanguage,
    setShoppingCompletedBehavior,
    setTheme,
    shoppingCompletedBehavior,
    t,
    theme,
  } = useSettings();
  const styles = useStyles();
  const { restart } = useOnboarding();
  const { showToast } = useToast();
  const appVersion = Constants.expoConfig?.version ?? '—';
  const [menu, setMenu] = useState<{ key: MenuKey; anchor: MenuAnchor } | null>(null);
  const themeRow = useRef<View>(null);
  const languageRow = useRef<View>(null);
  const shoppingRow = useRef<View>(null);

  const themes: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t('systemTheme') },
    { value: 'light', label: t('light') },
    { value: 'dark', label: t('dark') },
  ];
  const languages: { value: Language; label: string }[] = [
    { value: 'ru', label: t('russian') },
    { value: 'en', label: t('english') },
  ];
  const shoppingBehaviors: { value: ShoppingCompletedBehavior; label: string }[] = [
    { value: 'moveDown', label: t('moveCompletedDown') },
    { value: 'keep', label: t('keepCompletedInPlace') },
  ];
  const labelOf = <T extends string>(items: { value: T; label: string }[], value: T) =>
    items.find((item) => item.value === value)?.label ?? '';

  function openMenu(key: MenuKey, row: RefObject<View | null>) {
    row.current?.measureInWindow((x, y, width, height) => {
      setMenu({ key, anchor: { x, y, width, height } });
    });
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingsContent}>
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

          <Text accessibilityRole="header" style={styles.settingsTitle}>{t('settings')}</Text>

          <SettingsSection title={t('preferences')}>
            <SettingsRow
              ref={themeRow}
              icon="contrast-outline"
              label={t('appearance')}
              value={labelOf(themes, theme)}
              accessory="menu"
              expanded={menu?.key === 'theme'}
              onPress={() => openMenu('theme', themeRow)}
            />
            <SettingsRow
              ref={languageRow}
              icon="language-outline"
              label={t('language')}
              value={labelOf(languages, language)}
              accessory="menu"
              expanded={menu?.key === 'language'}
              onPress={() => openMenu('language', languageRow)}
            />
          </SettingsSection>

          <SettingsSection title={t('shoppingBehavior')}>
            <SettingsRow
              ref={shoppingRow}
              icon="checkmark-circle-outline"
              label={t('completedItems')}
              value={labelOf(shoppingBehaviors, shoppingCompletedBehavior)}
              accessory="menu"
              expanded={menu?.key === 'shopping'}
              onPress={() => openMenu('shopping', shoppingRow)}
            />
          </SettingsSection>

          <RecipeTransfer />

          <SettingsSection title={t('appSection')}>
            <SettingsRow
              icon="book-outline"
              label={t('onboardingReplay')}
              accessory="chevron"
              onPress={() => { void restart().catch(() => showToast(t('onboardingSaveError'))); }}
            />
            <SettingsRow
              icon="chatbubble-outline"
              label={t('feedback')}
              accessory="external"
              role="link"
              onPress={() => openFeedback(appVersion)}
            />
            <SettingsRow
              icon="information-circle-outline"
              label={t('aboutMonorec')}
              accessory="chevron"
              onPress={() => router.push('/about')}
            />
          </SettingsSection>

          <View style={styles.settingsFooter}>
            <Image
              source={APP_ICONS[resolvedTheme]}
              style={styles.settingsFooterIcon}
              accessibilityIgnoresInvertColors
              alt=""
            />
            <Text style={styles.settingsFooterName}>Monorec</Text>
            <Text style={styles.settingsFooterMeta}>{t('versionNumber', { version: appVersion })}</Text>
            <Text style={styles.settingsFooterMeta}>{t('developedBy')}</Text>
          </View>
        </View>
      </ScrollView>

      <OptionMenu
        onClose={() => setMenu(null)}
        title={t('appearance')}
        anchor={menu?.key === 'theme' ? menu.anchor : null}
        options={themes}
        selected={theme}
        onSelect={setTheme}
      />
      <OptionMenu
        onClose={() => setMenu(null)}
        title={t('language')}
        anchor={menu?.key === 'language' ? menu.anchor : null}
        options={languages}
        selected={language}
        onSelect={setLanguage}
      />
      <OptionMenu
        onClose={() => setMenu(null)}
        title={t('completedItems')}
        anchor={menu?.key === 'shopping' ? menu.anchor : null}
        options={shoppingBehaviors}
        selected={shoppingCompletedBehavior}
        onSelect={setShoppingCompletedBehavior}
      />
    </View>
  );
}
