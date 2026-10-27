import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORIES, type Recipe } from '@/constants/recipes';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useFittedTitle } from '@/hooks/use-fitted-title';
import { useStyles } from '@/styles';
import { confirmDelete } from '@/utils/confirm-delete';
import { keyboardDismissOnDrag } from '@/utils/keyboard-dismiss';
import { categoryLabel, toLines } from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function FormScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><FormContent /></PaletteProvider>;
}

function FormContent() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const { colors, t } = useSettings();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { recipes, addRecipe, updateRecipe } = useRecipes();
  const initial = recipes.find((recipe) => recipe.id === first(params.id));

  const [start] = useState(() => ({
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
  const [draftId] = useState(() => initial?.id ?? `${Date.now()}-${Math.random()}`);
  const saving = useRef(false);
  const heading = initial ? t('editing') : t('newRecipe');
  const titleStyle = useFittedTitle(heading, styles.recipeTitle.fontSize);
  const [errors, setErrors] = useState({ title: false, time: false });

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
    const normalizedTime = Number(time);
    const nextErrors = { title: !normalizedTitle, time: !Number.isFinite(normalizedTime) || normalizedTime < 0 };
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.time) {
      if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility([
        ...(nextErrors.title ? [t('titleRequiredMessage')] : []),
        ...(nextErrors.time ? [t('invalidTimeMessage')] : []),
      ].join('. '));
      return;
    }

    const recipe: Recipe = {
      id: draftId,
      title: normalizedTitle,
      category,
      time: normalizedTime,
      ingredients: toLines(ingredients),
      steps: toLines(steps),
    };
    saving.current = true;
    // Only a saved recipe lifts the guard; a failed write keeps the form open and
    // guarded, and the existing Retry finishes it.
    const done = () => { allowLeave(); router.back(); };
    await (initial ? updateRecipe(recipe, done) : addRecipe(recipe, done));
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'android' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissOnDrag}
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: bottomInset + 40 }}
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

          <Text accessibilityRole="header" style={[styles.recipeTitle, titleStyle]}>{heading}</Text>

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
            accessibilityHint={errors.time ? t('invalidTimeMessage') : undefined}
            placeholder="15"
            placeholderTextColor={colors.muted}
            selectionColor={colors.text}
            keyboardType="number-pad"
          />
          {errors.time && <Text nativeID="recipe-time-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.fieldError}>{t('invalidTimeMessage')}</Text>}

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
