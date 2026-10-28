import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SharedRecipeView } from '@/components/shared-recipe-view';
import { MONOREC_THEMES } from '@/constants/theme';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { LINK_ERRORS, parseRecipeLink, RecipeLinkError, type SharedRecipe } from '@/utils/recipe-link';

export default function SharedRecipeScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><SharedRecipeContent /></PaletteProvider>;
}

// The browser page of a shared link: it shows the recipe from the address itself (after "#",
// never sent to a server) and explains how to add it. It reads no one's data and saves nothing.
function SharedRecipeContent() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  // Read once on the first render: the address may change while the app navigates.
  const [address] = useState(() => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : ''));
  const [result] = useState<{ recipe?: SharedRecipe; error?: string }>(() => {
    try { return { recipe: parseRecipeLink(address) }; } catch (err) {
      return { error: t(err instanceof RecipeLinkError ? LINK_ERRORS[err.code] : 'recipeLinkInvalid') };
    }
  });

  async function copy() {
    try { await navigator.clipboard.writeText(address); showToast(t('linkCopied')); } catch { /* The address bar still has it. */ }
  }

  return (
    <View testID="shared-recipe-screen" style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.recipeContent}>
          <View style={styles.topBar}>
            {Platform.OS !== 'web' && (
              <Pressable onPress={() => router.replace('/recipes')} hitSlop={10} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                accessibilityRole="button" accessibilityLabel={t('close')}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            )}
          </View>
          <Text style={styles.choiceKicker}>{t('sharedRecipeKicker')}</Text>
          {result.recipe ? <>
            <SharedRecipeView recipe={result.recipe} />
            <Text style={[styles.settingsHint, { marginTop: 24 }]}>{t('sharedRecipeHowTo')}</Text>
            {Platform.OS === 'web' && (
              <View style={styles.choiceActions}>
                <Pressable onPress={() => void copy()} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button" accessibilityLabel={t('copyLink')}>
                  <Ionicons name="copy-outline" size={20} color={colors.text} />
                  <Text style={styles.choiceSecondaryText}>{t('copyLink')}</Text>
                </Pressable>
              </View>
            )}
          </> : <Text accessibilityRole="alert" style={[styles.settingsHint, { color: colors.danger, marginTop: 20 }]}>{result.error}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
