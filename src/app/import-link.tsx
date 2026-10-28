import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ComponentRef, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
  // Each "Show recipe" brings its result into view: the preview, or the field with the error.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentY = useRef(0);
  const fieldY = useRef(0);
  const [shown, setShown] = useState(0);
  const reveal = (y: number) => scroll.current?.scrollTo({ y: Math.max(0, contentY.current + y - insets.top - 16), animated: true });
  const backup = (recipe: SharedRecipe, id: string): RecipeBackup => ({
    format: 'recipes-backup', version: 1, exportedAt: new Date().toISOString(), recipes: [{ id, ...recipe }], recipeMeta: {},
  });
  const duplicate = shared !== null && mergeRecipeBackup(recipes, recipeMeta, backup(shared, 'preview')).duplicates > 0;

  function show() {
    Keyboard.dismiss();
    setShown(count => count + 1);
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
    // As in the recipe form: iOS insets the scroll view, Android makes room for the keyboard here.
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.recipeContent} onLayout={event => { contentY.current = event.nativeEvent.layout.y; }}>
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
            onLayout={event => { fieldY.current = event.nativeEvent.layout.y; }}
            style={[styles.field, styles.fieldMultiline, styles.fieldCapped, { marginTop: 20 }]}
          />
          {!!error && <Text key={shown} onLayout={() => reveal(fieldY.current - 20)} accessibilityRole="alert" style={[styles.settingsHint, { color: colors.danger }]}>{error}</Text>}
          <View style={styles.choiceActions}>
            <Pressable onPress={show} style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]} accessibilityRole="button">
              <Text style={styles.choiceSecondaryText}>{t('importLinkShow')}</Text>
            </Pressable>
          </View>

          {shared && <View key={shown} testID="recipe-link-preview" style={{ marginTop: 28 }} onLayout={event => reveal(event.nativeEvent.layout.y)}>
            {/* What happens to this recipe comes first, above the recipe itself. */}
            <Text style={[styles.settingsHint, { marginTop: 0, marginBottom: 12 }]}>{duplicate ? t('recipeLinkDuplicate') : t('recipeLinkHint')}</Text>
            <SharedRecipeView recipe={shared} />
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
    </KeyboardAvoidingView>
  );
}
