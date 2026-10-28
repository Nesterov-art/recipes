import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SharedRecipeView } from '@/components/shared-recipe-view';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { mergeRecipeBackup, type RecipeBackup } from '@/utils/recipe-backup';
import { LINK_ERRORS, parseRecipeLink, RecipeLinkError, type SharedRecipe } from '@/utils/recipe-link';

export default function ImportLinkScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ImportLinkContent /></PaletteProvider>;
}

// A pasted link is read and previewed; the book changes only after "Add to my book", through
// the regular recipe import with its duplicate check. The recipe gets a new local id.
function ImportLinkContent() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const { showToast } = useToast();
  const styles = useStyles();
  const { recipes, recipeMeta, importRecipes } = useRecipes();
  const [text, setText] = useState('');
  const [shared, setShared] = useState<SharedRecipe | null>(null);
  const [error, setError] = useState('');
  const saving = useRef(false);
  const backup = (recipe: SharedRecipe, id: string): RecipeBackup => ({
    format: 'recipes-backup', version: 1, exportedAt: new Date().toISOString(), recipes: [{ id, ...recipe }], recipeMeta: {},
  });
  const duplicate = shared !== null && mergeRecipeBackup(recipes, recipeMeta, backup(shared, 'preview')).duplicates > 0;

  function show() {
    setShared(null); setError('');
    try { setShared(parseRecipeLink(text)); } catch (err) {
      setError(t(err instanceof RecipeLinkError ? LINK_ERRORS[err.code] : 'recipeLinkInvalid'));
    }
  }
  async function add() {
    if (!shared || saving.current) return;
    saving.current = true;
    const id = `${Date.now()}-${Math.random()}`;
    try {
      await importRecipes(backup(shared, id), () => {
        showToast(t('recipeLinkAdded'));
        router.replace({ pathname: '/recipe/[id]', params: { id } });
      });
    } catch { /* A failed save is shown by the storage guard and can be retried there. */ }
    saving.current = false;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.recipeContent}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={t('close')}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.choiceKicker}>{t('addByLink')}</Text>
          <Text accessibilityRole="header" style={styles.recipeTitle}>{t('importLinkTitle')}</Text>

          <TextInput
            value={text}
            onChangeText={value => { setText(value); setError(''); }}
            placeholder={t('importLinkPlaceholder')}
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            accessibilityLabel={t('importLinkLabel')}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[styles.field, styles.fieldMultiline, { marginTop: 20 }]}
          />
          {!!error && <Text accessibilityRole="alert" style={[styles.settingsHint, { color: colors.danger }]}>{error}</Text>}
          <View style={styles.choiceActions}>
            <Pressable onPress={show} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
              <Text style={styles.choiceSecondaryText}>{t('importLinkShow')}</Text>
            </Pressable>
          </View>

          {shared && <View testID="recipe-link-preview" style={{ marginTop: 28 }}>
            <SharedRecipeView recipe={shared} />
            <Text style={styles.settingsHint}>{duplicate ? t('recipeLinkDuplicate') : t('recipeLinkHint')}</Text>
            <View style={styles.choiceActions}>
              {!duplicate && (
                <Pressable onPress={() => void add()} style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]} accessibilityRole="button">
                  <Text style={styles.choicePrimaryText}>{t('backupConfirm')}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
                <Text style={styles.choiceSecondaryText}>{t('cancel')}</Text>
              </Pressable>
            </View>
          </View>}
        </View>
      </ScrollView>
    </View>
  );
}
