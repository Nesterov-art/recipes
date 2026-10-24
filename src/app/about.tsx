import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_ICONS } from '@/constants/app-icons';
import { MONOREC_THEMES } from '@/constants/theme';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { SettingsRow, SettingsSection } from '@/components/settings-list';
import { useStyles } from '@/styles';
import { openFeedback } from '@/utils/feedback';

export default function AboutScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><AboutContent /></PaletteProvider>;
}

function AboutContent() {
  const insets = useSafeAreaInsets();
  const { colors, resolvedTheme, t } = useSettings();
  const styles = useStyles();
  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <View testID="about-screen" style={styles.screen}>
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
            <Text accessibilityRole="header" style={styles.aboutToolbarTitle} numberOfLines={1}>{t('aboutMonorec')}</Text>
            <View style={styles.aboutToolbarSpacer} />
          </View>

          <View style={styles.aboutHero}>
            <Image source={APP_ICONS[resolvedTheme]} style={styles.aboutIcon} accessibilityIgnoresInvertColors alt="" />
            <Text style={styles.aboutName}>Monorec</Text>
            <Text style={styles.aboutVersion}>{t('versionNumber', { version: appVersion })}</Text>
            <Text style={styles.aboutDescription}>{t('aboutDescription')}</Text>
          </View>

          <SettingsSection title={t('aboutDeveloper')}>
            <SettingsRow icon="person-outline" label="Neyroshi" detail={t('developerRole')} />
            <SettingsRow
              icon="chatbubble-outline"
              label={t('feedback')}
              accessory="external"
              role="link"
              onPress={() => openFeedback(appVersion)}
            />
          </SettingsSection>

          <Text style={styles.aboutNote}>{t('aboutStorage')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}
