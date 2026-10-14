import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

  function handleSave() {
    const normalizedTitle = title.trim();
    const normalizedTime = Number(time);
    if (!normalizedTitle) {
      Alert.alert(t('titleRequired'), t('titleRequiredMessage'));
      return;
    }
    if (!Number.isFinite(normalizedTime) || normalizedTime < 0) {
      Alert.alert(t('invalidTime'), t('invalidTimeMessage'));
      return;
    }

    const recipe: Recipe = {
      id: initial?.id ?? `${Date.now()}`,
      title: normalizedTitle,
      category,
      time: normalizedTime,
      ingredients: toLines(ingredients),
      steps: toLines(steps),
    };
    if (initial) updateRecipe(recipe);
    else addRecipe(recipe);
    router.back();
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
          onChangeText={setTitle}
          placeholder={t('titlePlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
        />

        <Text style={styles.fieldLabel}>{t('timeMinutes')}</Text>
        <TextInput
          style={styles.field}
          value={time}
          onChangeText={setTime}
          placeholder="15"
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          keyboardType="number-pad"
        />

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
