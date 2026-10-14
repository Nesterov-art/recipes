import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useShopping } from '@/context/shopping-context';
import { useToast } from '@/context/toast-context';
import { useStyles } from '@/styles';
import { plural } from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ShoppingSelectScreen() {
  const insets = useSafeAreaInsets();
  const { colors, language, t } = useSettings();
  const { recipes } = useRecipes();
  const { addIngredients } = useShopping();
  const { showToast } = useToast();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipe = recipes.find((item) => item.id === first(params.id));
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(recipe?.ingredients.map((_, index) => index) ?? []),
  );

  if (!recipe) return <View style={styles.screen} />;

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleAdd() {
    const ingredients = recipe!.ingredients.filter((_, index) => selected.has(index));
    const count = addIngredients(ingredients);
    showToast(count > 0 ? t('ingredientsAdded', { count }) : t('ingredientsAlreadyAdded'));
    router.back();
  }

  const selectedCount = selected.size;
  const buttonLabel = t('addPositions', {
    count: selectedCount,
    positions: plural(
      language,
      selectedCount,
      t('positionOne'),
      t('positionFew'),
      t('positionMany'),
    ),
  });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.bigTitle}>{t('selectIngredients')}</Text>
        <Text style={styles.subtitle}>{recipe.title}</Text>
        <Text style={[styles.groupTextMuted, { marginTop: 12 }]}>{t('shoppingSelectionHint')}</Text>

        <View style={[styles.group, { marginTop: 24 }]}>
          {recipe.ingredients.map((ingredient, index) => {
            const checked = selected.has(index);
            return (
              <Pressable
                key={`${ingredient}-${index}`}
                onPress={() => toggle(index)}
                style={({ pressed }) => [styles.ingredientSelectRow, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
              >
                {index > 0 && <View style={styles.separator} />}
                <Ionicons
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={23}
                  color={checked ? colors.text : colors.muted}
                />
                <Text style={styles.ingredientSelectText}>{ingredient}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleAdd}
          disabled={selectedCount === 0}
          style={({ pressed }) => [
            styles.primaryButton,
            selectedCount === 0 && styles.disabledButton,
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
