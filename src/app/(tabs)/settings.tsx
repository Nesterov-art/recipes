import { AccentHeading } from '@/components/accent-heading';
import { router } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ICONS } from '@/constants/app-icons';
import type { Language } from '@/constants/i18n';
import { SETTINGS_THEMES, type ThemeMode } from '@/constants/theme';
import {
  PaletteProvider,
  useSettings,
  type ShoppingCompletedBehavior,
} from '@/context/settings-context';
import { useOnboarding } from '@/context/onboarding-context';
import { useToast } from '@/context/toast-context';
import { OptionMenu, type MenuAnchor } from '@/components/option-menu';
import { SettingsRow, SettingsSection, type ViewRef } from '@/components/settings-list';
import { useStyles } from '@/styles';
import { appVersion as getAppVersion } from '@/utils/app-version';

type MenuKey = 'theme' | 'language' | 'shopping';

export default function SettingsScreen() {
  return <PaletteProvider palette={SETTINGS_THEMES}><SettingsContent /></PaletteProvider>;
}

function SettingsContent() {
  const insets = useSafeAreaInsets();
  const {
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
  const appVersion = getAppVersion();
  const [menu, setMenu] = useState<{ key: MenuKey; anchor: MenuAnchor } | null>(null);
  const themeRow = useRef<ViewRef>(null);
  const languageRow = useRef<ViewRef>(null);
  const shoppingRow = useRef<ViewRef>(null);

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

  function openMenu(key: MenuKey, row: RefObject<ViewRef | null>) {
    row.current?.measureInWindow((x, y, width, height) => {
      setMenu({ key, anchor: { x, y, width, height } });
    });
  }

  return (
    <View testID="settings-screen" style={styles.screen}>
      <ScrollView
        // The tab bar below already covers the bottom safe area.
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.settingsContent}>
          <View style={styles.settingsTitleBlock}>
            <AccentHeading style={styles.settingsTitle}>{t('settings')}</AccentHeading>
          </View>

          <View testID="settings-groups" style={styles.settingsGroups}>
          <SettingsSection title={t('preferences')} hideTitle>
            <SettingsRow
              ref={themeRow}
              icon="moon-outline"
              label={t('appearance')}
              value={labelOf(themes, theme)}
              accessory="menu"
              expanded={menu?.key === 'theme'}
              onPress={() => openMenu('theme', themeRow)}
            />
            <SettingsRow
              ref={languageRow}
              icon="globe-outline"
              label={t('language')}
              value={labelOf(languages, language)}
              accessory="menu"
              expanded={menu?.key === 'language'}
              onPress={() => openMenu('language', languageRow)}
            />
          </SettingsSection>

          <SettingsSection title={t('shoppingBehavior')} hideTitle>
            <SettingsRow
              ref={shoppingRow}
              icon="checkmark"
              label={t('completedItems')}
              value={labelOf(shoppingBehaviors, shoppingCompletedBehavior)}
              accessory="menu"
              expanded={menu?.key === 'shopping'}
              onPress={() => openMenu('shopping', shoppingRow)}
            />
          </SettingsSection>

          {/* Backups open their own screen, one tap from Settings (design 3.1, screen 19). */}
          <SettingsSection title={t('dataSection')} hideTitle>
            <SettingsRow
              icon="document-text-outline"
              label={t('backups')}
              accessory="chevron"
              onPress={() => router.push('/backup')}
            />
          </SettingsSection>

          <SettingsSection title={t('appSection')} hideTitle>
            {/* Replaying shows the introduction again; recipes, groceries, history and settings stay. */}
            <SettingsRow
              icon="book-outline"
              label={t('onboardingReplay')}
              accessory="chevron"
              onPress={() => { void restart().catch(() => showToast(t('onboardingSaveError'))); }}
            />
            <SettingsRow
              icon="information-circle-outline"
              label={t('aboutMonorec')}
              accessory="chevron"
              onPress={() => router.push('/about')}
            />
          </SettingsSection>

          </View>

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
