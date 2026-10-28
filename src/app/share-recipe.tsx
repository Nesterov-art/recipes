import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { buildRecipeLink, SHARE_ORIGIN } from '@/utils/recipe-link';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ShareRecipeScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ShareRecipeContent /></PaletteProvider>;
}

// The link carries only the recipe. Natively the system Share menu sends it and offers Copy
// there, so there is one button. The web copies it to the clipboard, and also offers the
// browser's share menu where one exists; no two buttons do the same.
function ShareRecipeContent() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const { recipes } = useRecipes();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipe = recipes.find(item => item.id === first(params.id));
  if (!recipe) return <View style={styles.screen} />;

  let link: string | null = null;
  try { link = buildRecipeLink(recipe, Platform.OS === 'web' ? window.location.origin : SHARE_ORIGIN); } catch { /* Too long; explained below. */ }
  const message = link && `${recipe.title}\n${link}`;
  const web = Platform.OS === 'web';
  const canShare = !web || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

  async function share() {
    if (!link || !message) return;
    try {
      if (!web) await Share.share({ message });
      else await navigator.share({ title: recipe!.title, url: link });
    } catch { /* Closing the menu is not an error. */ }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); showToast(t('linkCopied')); } catch { /* The link stays selectable. */ }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.recipeContent}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={t('close')}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.choiceKicker}>{t('shareRecipeTitle')}</Text>
          <Text accessibilityRole="header" style={styles.recipeTitle}>{recipe.title}</Text>
          <Text style={styles.settingsHint}>{t('shareRecipeHint')}</Text>

          {link ? <>
            <View style={[styles.group, { marginTop: 20, padding: 16 }]}>
              <Text selectable testID="recipe-link" style={[styles.groupTextMuted, { fontSize: 13, lineHeight: 18 }]} numberOfLines={4}>{link}</Text>
            </View>
            <View style={styles.choiceActions}>
              {canShare && (
                <Pressable onPress={() => void share()} style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('shareLink')}>
                  <Ionicons name="share-outline" size={20} color={colors.accentText} />
                  <Text style={styles.choicePrimaryText}>{t('shareLink')}</Text>
                </Pressable>
              )}
              {web && (
                <Pressable onPress={() => void copy()} style={({ pressed }) => [canShare ? styles.choiceSecondary : styles.choicePrimary, pressed && (canShare ? { backgroundColor: colors.cardPressed } : styles.pressed)]} accessibilityRole="button" accessibilityLabel={t('copyLink')}>
                  <Ionicons name="copy-outline" size={20} color={canShare ? colors.text : colors.accentText} />
                  <Text style={canShare ? styles.choiceSecondaryText : styles.choicePrimaryText}>{t('copyLink')}</Text>
                </Pressable>
              )}
            </View>
            {!web && <Text style={styles.settingsHint}>{t('copyLinkHint')}</Text>}
          </> : <Text accessibilityRole="alert" style={[styles.settingsHint, { color: colors.danger, marginTop: 20 }]}>{t('recipeLinkTooLong')}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
