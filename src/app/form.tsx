import { AccentHeading } from '@/components/accent-heading';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORIES, type Recipe } from '@/constants/recipes';
import { MONOREC_THEMES } from '@/constants/theme';
import { type ImportedDraft, useImportDraft } from '@/context/import-draft-context';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useToast } from '@/context/toast-context';
import { useFittedTitle } from '@/hooks/use-fitted-title';
import { useStyles } from '@/styles';
import { confirmDelete } from '@/utils/confirm-delete';
import { draftFields, findDuplicate, formTime } from '@/utils/import-draft';
import { createWithFreshId } from '@/utils/recipe-create';
import { keyboardDismissOnDrag } from '@/utils/keyboard-dismiss';
import { categoryLabel, toLines } from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// /form: a new recipe; /form?id=…: editing it; /form?draft=…: a new recipe filled from a
// cooking site's page, where draft is the key of the in-memory draft (not the recipe itself).
export default function FormScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; draft?: string | string[] }>();
  const drafts = useImportDraft();
  const key = first(params.id) ? undefined : first(params.draft);
  const [imported] = useState(() => (key ? drafts.get(key) : null));
  return (
    <PaletteProvider palette={MONOREC_THEMES}>
      {key && !imported ? <DraftLost /> : <FormContent imported={key && imported ? { ...imported, key } : null} />}
    </PaletteProvider>
  );
}

// The draft is gone (the page was reloaded or the app restarted): back to the import screen,
// never an empty recipe.
function DraftLost() {
  const { t } = useSettings();
  const { showToast } = useToast();
  useEffect(() => {
    showToast(t('importDraftLost'));
    router.replace('/import-link');
  }, [showToast, t]);
  return null;
}

function FormContent({ imported }: { imported: (ImportedDraft & { key: string }) | null }) {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const { colors, t } = useSettings();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { recipes, createRecipe, updateRecipe } = useRecipes();
  const { clear: clearDraft } = useImportDraft();
  const initial = recipes.find((recipe) => recipe.id === first(params.id));

  const [start] = useState(() => (imported ? draftFields(imported.draft) : {
    title: initial?.title ?? '',
    time: initial ? String(initial.time) : '',
    ingredients: initial?.ingredients.join('\n') ?? '',
    steps: initial?.steps.join('\n') ?? '',
    category: initial?.category ?? null,
  }));
  const [title, setTitle] = useState(start.title);
  const [time, setTime] = useState(start.time);
  const [ingredients, setIngredients] = useState(start.ingredients);
  const [steps, setSteps] = useState(start.steps);
  const [category, setCategory] = useState<string | null>(start.category);
  const saving = useRef(false);
  // Nothing was written: no free id for a new recipe (three taken in a row), or the recipe being
  // edited is no longer in the book. The person's input stays on screen.
  const [refused, setRefused] = useState<'idConflict' | 'missing' | null>(null);
  const heading = initial ? t('editing') : t('newRecipe');
  const titleStyle = useFittedTitle(heading, styles.recipeTitle.fontSize);
  const [errors, setErrors] = useState<{ title: boolean; time: false | 'invalid' | 'required' }>({ title: false, time: false });
  // An exact copy already in the book (recipes from a site only), for the values it was found with.
  const [duplicate, setDuplicate] = useState<{ id: string | null; values: string } | null>(null);
  const values = JSON.stringify([title, time, ingredients, steps, category]);
  const shownDuplicate = duplicate?.values === values ? duplicate : null;
  const timeMessage = errors.time === 'required' ? t('importTimeRequired') : t('invalidTimeMessage');

  const dirty = title !== start.title || time !== start.time || ingredients !== start.ingredients
    || steps !== start.steps || category !== start.category;

  // Close, Android Back and browser Back all go through here: unsaved input is
  // only dropped after the person confirms it.
  const allowLeave = usePreventRemove(dirty, ({ repeat }) => {
    void confirmDelete(t('discardTitle'), t('discardMessage'), t('discardConfirm'), t('keepEditing')).then(discard => {
      if (discard) repeat();
    });
  });

  async function handleSave() {
    if (saving.current) return;
    const normalizedTitle = title.trim();
    // A recipe from a site whose time was unknown needs one from the person (0 included); a
    // manual recipe keeps its rule that an empty time is 0.
    const timed = formTime(time, { required: imported !== null });
    const nextErrors = { title: !normalizedTitle, time: timed.ok ? false as const : timed.error };
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.time || !timed.ok) {
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility([
        ...(nextErrors.title ? [t('titleRequiredMessage')] : []),
        ...(nextErrors.time ? [nextErrors.time === 'required' ? t('importTimeRequired') : t('invalidTimeMessage')] : []),
      ].join('. '));
      return;
    }

    const fields: Omit<Recipe, 'id'> = {
      title: normalizedTitle,
      category,
      time: timed.minutes,
      ingredients: toLines(ingredients),
      steps: toLines(steps),
    };
    const nameDuplicate = (existing: string | null) => {
      setDuplicate({ id: existing, values });
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(t('recipeLinkDuplicate'));
    };
    // A recipe from a site is not added twice: an exact copy already in the book is named instead.
    if (imported) {
      const existing = findDuplicate(recipes, fields);
      if (existing) { nameDuplicate(existing); return; }
    }
    saving.current = true;
    setRefused(null);
    // Only a saved recipe lifts the guard; a failed write keeps the form open and
    // guarded, and the existing Retry finishes it. A recipe from a site then opens itself.
    const done = (id: string) => {
      allowLeave();
      if (!imported) { router.back(); return; }
      clearDraft(imported.key);
      router.replace({ pathname: '/recipe/[id]', params: { id } });
    };
    if (initial) {
      if (await updateRecipe({ id: initial.id, ...fields }, () => done(initial.id)) === 'missing') setRefused('missing');
    } else {
      // Created only under an id no recipe has; the copy check is repeated inside the write.
      const { result } = await createWithFreshId(createRecipe, fields, done, { refuseDuplicate: imported !== null });
      if (result === 'duplicate') nameDuplicate(findDuplicate(recipes, fields));
      if (result === 'idTaken') setRefused('idConflict');
    }
    saving.current = false;
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/recipes');
  }

  const label = (text: string, hint?: string) => (
    <View style={styles.formLabelRow}>
      <Text style={styles.formLabel}>{text}</Text>
      {hint && <Text style={styles.formLabelHint}>{hint}</Text>}
    </View>
  );

  return (
    // iOS insets the scroll view itself (automaticallyAdjustKeyboardInsets). Android
    // draws edge to edge and no longer resizes the window, so the form makes room here.
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissOnDrag}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        // The safe area belongs to the viewport, so scrolling cannot move controls
        // underneath the status bar. Keep the existing 8 px content spacing.
        contentContainerStyle={{ paddingTop: 8, paddingBottom: bottomInset + 40 }}
      >
        <View style={styles.recipeContent}>
          <View style={styles.formTopBar}>
            <Pressable
              onPress={close}
              hitSlop={10}
              style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.choiceKicker, styles.cookingTopTitle]} numberOfLines={1}>
              {initial ? t('formEditKicker') : t('formNewKicker')}
            </Text>
          </View>

          <AccentHeading style={[styles.recipeTitle, titleStyle]}>{heading}</AccentHeading>
          {imported && <Text style={[styles.settingsHint, { marginTop: 4 }]}>{t('importFormHint', { host: imported.host })}</Text>}

          {label(t('title'))}
          <TextInput
            style={[styles.field, errors.title && styles.formFieldError]}
            value={title}
            // Multiline only so a long title wraps; it stays one line of text.
            onChangeText={value => { setTitle(value.replace(/\n/g, ' ')); setErrors(current => ({ ...current, title: false })); }}
            accessibilityLabel={t('title')}
            accessibilityHint={errors.title ? t('titleRequiredMessage') : undefined}
            placeholder={t('titlePlaceholder')}
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
          />
          {errors.title && <Text nativeID="recipe-title-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.fieldError}>{t('titleRequiredMessage')}</Text>}

          {label(t('timeMinutes'))}
          <TextInput
            style={[styles.field, errors.time && styles.formFieldError]}
            value={time}
            onChangeText={value => { setTime(value); setErrors(current => ({ ...current, time: false })); }}
            accessibilityLabel={t('timeMinutes')}
            accessibilityHint={errors.time ? timeMessage : undefined}
            placeholder={t('timePlaceholder')}
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            keyboardType="number-pad"
          />
          {errors.time && <Text nativeID="recipe-time-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.fieldError}>{timeMessage}</Text>}

          {label(t('category'))}
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((item) => (
              <Pressable
                key={item}
                onPress={() => setCategory(category === item ? null : item)}
                style={[styles.formChip, category === item && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: category === item }}
                aria-selected={category === item}
              >
                <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                  {categoryLabel(item, t)}
                </Text>
              </Pressable>
            ))}
          </View>

          {label(t('ingredients'), t('formPerLine'))}
          <TextInput
            style={[styles.field, styles.fieldMultiline]}
            value={ingredients}
            onChangeText={setIngredients}
            accessibilityLabel={t('ingredients')}
            placeholder={t('ingredientsPlaceholder')}
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            multiline
            scrollEnabled={false}
          />

          {label(t('preparation'), t('formPerStep'))}
          <TextInput
            style={[styles.field, styles.fieldMultiline]}
            value={steps}
            onChangeText={setSteps}
            accessibilityLabel={t('preparation')}
            placeholder={t('stepsPlaceholder')}
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            multiline
            scrollEnabled={false}
          />

          {shownDuplicate && <View testID="recipe-form-duplicate" style={{ marginTop: 24 }}>
            <Text accessibilityRole="alert" style={[styles.settingsHint, { marginTop: 0, color: colors.text }]}>{t('recipeLinkDuplicate')}</Text>
            {shownDuplicate.id && <View style={styles.choiceActions}>
              <Pressable
                onPress={() => { allowLeave(); router.replace({ pathname: '/recipe/[id]', params: { id: shownDuplicate.id! } }); }}
                style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]}
                accessibilityRole="button"
              >
                <Text style={styles.choiceSecondaryText}>{t('openRecipeAction')}</Text>
              </Pressable>
            </View>}
          </View>}

          {refused && <Text accessibilityRole="alert" style={[styles.fieldError, { marginTop: 24 }]}>{t(refused === 'missing' ? 'recipeEditMissing' : 'recipeIdConflict')}</Text>}

          <View style={[styles.choiceActions, { marginTop: 32 }]}>
            <Pressable
              onPress={handleSave}
              style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('save')}
            >
              <Text style={styles.choicePrimaryText}>{t('save')}</Text>
              <Ionicons name="checkmark" size={20} color={colors.accentText} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
