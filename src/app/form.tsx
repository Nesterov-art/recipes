import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORIES, type Recipe } from '@/constants/recipes';
import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { categoryLabel, toLines } from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function FormScreen() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { recipes, addRecipe, updateRecipe } = useRecipes();
  const initial = recipes.find((recipe) => recipe.id === first(params.id));

  const [title, setTitle] = useState(initial?.title ?? '');
  const [time, setTime] = useState(initial ? String(initial.time) : '');
  const [ingredients, setIngredients] = useState(initial?.ingredients.join('\n') ?? '');
  const [steps, setSteps] = useState(initial?.steps.join('\n') ?? '');
  const [category, setCategory] = useState<string | null>(initial?.category ?? null);
  const [draftId] = useState(() => initial?.id ?? `${Date.now()}-${Math.random()}`);
  const saving = useRef(false);
  const [errors, setErrors] = useState({ title: false, time: false });

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
    await (initial ? updateRecipe(recipe, () => router.back()) : addRecipe(recipe, () => router.back()));
    saving.current = false;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.bigTitle}>{initial ? t('editing') : t('newRecipe')}</Text>

        <Text style={styles.fieldLabel}>{t('title')}</Text>
        <TextInput
          style={styles.field}
          value={title}
          onChangeText={value => { setTitle(value); setErrors(current => ({ ...current, title: false })); }}
          accessibilityLabel={t('title')}
          accessibilityHint={errors.title ? t('titleRequiredMessage') : undefined}
          placeholder={t('titlePlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
        />
        {errors.title && <Text nativeID="recipe-title-error" accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.fieldError}>{t('titleRequiredMessage')}</Text>}

        <Text style={styles.fieldLabel}>{t('timeMinutes')}</Text>
        <TextInput
          style={styles.field}
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

        <Text style={styles.fieldLabel}>{t('category')}</Text>
        <View style={styles.chipsWrap}>
          {CATEGORIES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setCategory(category === item ? null : item)}
              style={[styles.chip, category === item && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: category === item }}
            >
              <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                {categoryLabel(item, t)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>{t('ingredientsHint')}</Text>
        <TextInput
          style={[styles.field, styles.fieldMultiline]}
          value={ingredients}
          onChangeText={setIngredients}
          placeholder={t('ingredientsPlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          multiline
          scrollEnabled={false}
        />

        <Text style={styles.fieldLabel}>{t('stepsHint')}</Text>
        <TextInput
          style={[styles.field, styles.fieldMultiline]}
          value={steps}
          onChangeText={setSteps}
          placeholder={t('stepsPlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          multiline
          scrollEnabled={false}
        />

        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{t('save')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
