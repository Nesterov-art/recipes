import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';

// Stage 1 placeholder of the Choice tab: the welcome question and the existing
// random pick. The approved welcome, result and empty states replace it in stage 2.
export default function ChoiceScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ChoiceContent /></PaletteProvider>;
}

function ChoiceContent() {
  const insets = useSafeAreaInsets();
  const { t } = useSettings();
  const styles = useStyles();
  const { pickRandom } = useRecipes();

  function handlePick() {
    const recipe = pickRandom();
    if (recipe) {
      router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, fromRandom: 'true' } });
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <View style={styles.settingsContent}>
        <Text accessibilityRole="header" style={styles.settingsTitle}>{t('choiceTitle')}</Text>
        <Pressable
          onPress={handlePick}
          style={({ pressed }) => [styles.fab, styles.homeRandomButton, { flex: 0, marginTop: 32 }, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={[styles.fabText, styles.homeRandomText]}>{t('chooseDish')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
