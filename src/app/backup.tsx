import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipeTransfer } from '@/components/recipe-transfer';
import { MONOREC_THEMES } from '@/constants/theme';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useFittedTitle } from '@/hooks/use-fitted-title';
import { useStyles } from '@/styles';

export default function BackupScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><BackupContent /></PaletteProvider>;
}

// The one entry to backups, opened from Settings. The file operations are the
// existing ones in RecipeTransfer; this screen only frames them.
function BackupContent() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const { colors, t } = useSettings();
  const styles = useStyles();
  const titleStyle = useFittedTitle(t('backups'), styles.recipeTitle.fontSize);

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  return (
    <View testID="backup-screen" style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: bottomInset + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.settingsContent}>
          <View style={styles.topBar}>
            <Pressable
              onPress={back}
              hitSlop={10}
              style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('back')}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.choiceKicker}>{t('backupKicker')}</Text>
          <Text accessibilityRole="header" style={[styles.recipeTitle, titleStyle]}>{t('backups')}</Text>

          <View style={styles.backupInfo}>
            <Ionicons name="information-circle-outline" size={20} color={colors.muted} />
            <Text style={styles.backupInfoText}>{t('backupInfo')}</Text>
          </View>

          <RecipeTransfer />

          <View style={styles.restoreWarning}>
            <Text style={styles.restoreWarningTitle}>{t('restoreWarningTitle')}</Text>
            <Text style={styles.restoreWarningText}>{t('restoreWarningText')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
