import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useFittedTitle } from '@/hooks/use-fitted-title';
import { useShareRecipe } from '@/hooks/use-share-recipe';
import { useStyles } from '@/styles';
import { confirmDelete } from '@/utils/confirm-delete';
import { cookingSteps } from '@/utils/cooking';
import {
  categoryLabel,
  cookingDateLabel,
  plural,
} from '@/utils/recipes';

// Same threshold as the recipe list: from here the stats read better as rows.
const STACKED_FONT_SCALE = 1.35;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Ingredients are written as "Name — amount"; the amount goes to the right edge.
// Any other line is shown whole.
function splitIngredient(text: string) {
  const index = text.indexOf(' — ');
  return index > 0 ? { name: text.slice(0, index), amount: text.slice(index + 3) } : { name: text, amount: '' };
}

export default function RecipeScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><RecipeContent /></PaletteProvider>;
}

function RecipeContent() {
  const insets = useSafeAreaInsets();
  const effectiveBottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const { colors, fontScale, language, t } = useSettings();
  const { fontScale: systemFontScale } = useWindowDimensions();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = first(params.id);
  const { recipes, deleteRecipe, getRecipeMeta, recordCooking, toggleFavorite } = useRecipes();
  const selected = recipes.find((recipe) => recipe.id === id);
  const deleting = useRef(false);
  const recording = useRef(false);
  const titleStyle = useFittedTitle(selected?.title ?? '', styles.recipeTitle.fontSize);
  const { share, sheet: shareSheet } = useShareRecipe();

  if (!selected) return <View style={styles.screen} />;

  const selectedId = selected.id;
  const selectedTitle = selected.title;
  const meta = getRecipeMeta(selected.id);
  const lastCooking = meta.cookings[0];
  const lastNotedCooking = meta.cookings.find((cooking) => cooking.note);

  async function handleDelete() {
    if (deleting.current) return;
    deleting.current = true;
    try {
      if (await confirmDelete(t('deleteQuestion'), selectedTitle, t('delete'), t('cancel'))) {
        // A recipe opened from a direct link has nothing to go back to: land on the book.
        await deleteRecipe(selectedId, () => (router.canGoBack() ? router.back() : router.replace('/recipes')));
      }
    } finally {
      deleting.current = false;
    }
  }

  // "I cooked this" (recipes without steps only) records one entry right away.
  async function handleCooked() {
    if (recording.current) return;
    recording.current = true;
    await recordCooking(selectedId);
    recording.current = false;
  }

  function handleAddToShopping() {
    router.push({ pathname: '/shopping-select', params: { id: selectedId } });
  }

  const ingredientCount = selected.ingredients.length;
  const steps = cookingSteps(selected.steps);
  const canCook = steps.length > 0;
  const category = selected.category ? categoryLabel(selected.category, t) : null;
  // On web the app scales text itself (fontScale); natively the OS does (systemFontScale).
  const stacked = fontScale * systemFontScale >= STACKED_FONT_SCALE;
  const stats: { label: string; value: string | number; unit?: string }[] = [
    { label: t('time'), value: selected.time, unit: t('minuteShort') },
    { label: t('composition'), value: ingredientCount, unit: t('itemsShort') },
    ...(category ? [{ label: t('category'), value: category }] : []),
  ];
  const cookedTimes = plural(language, meta.cookings.length, t('cookedTimesOne'), t('cookedTimesFew'), t('cookedTimesMany'));

  const historyCard = (
    <>
      <Ionicons name="time-outline" size={20} color={colors.muted} />
      <View style={styles.recipeHistoryBody}>
        {lastCooking ? (
          <>
            <Text style={styles.recipeHistoryText}>{t('cookedLabel', { count: meta.cookings.length, times: cookedTimes })}</Text>
            <Text style={styles.recipeHistoryMuted}>{t('lastCooked', { date: cookingDateLabel(lastCooking.cookedAt, language) })}</Text>
            {lastNotedCooking?.note && (
              <>
                <Text style={styles.recipeHistoryNoteLabel}>{t('lastNote')}</Text>
                <Text style={styles.recipeHistoryNote}>«{lastNotedCooking.note}»</Text>
              </>
            )}
          </>
        ) : (
          <Text style={styles.recipeHistoryMuted}>{t('neverCooked')}</Text>
        )}
      </View>
      {lastCooking && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: effectiveBottomInset + 40 }}
      >
        <View style={styles.recipeContent}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('back')}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <View style={styles.topActions}>
              <Pressable
                onPress={() => toggleFavorite(selected.id)}
                hitSlop={8}
                style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={meta.favorite ? t('removeFavorite') : t('addFavorite')}
                accessibilityState={{ selected: meta.favorite }}
              >
                <Ionicons name={meta.favorite ? 'heart' : 'heart-outline'} size={22} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => void share(selected)}
                hitSlop={8}
                style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('shareRecipe')}
              >
                <Ionicons name="share-outline" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => router.push({ pathname: '/form', params: { id: selected.id } })}
                hitSlop={10}
                style={({ pressed }) => [styles.pillButton, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.pillButtonText}>{t('edit')}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.choiceKicker}>{category ? `${t('recipeBookKicker')} / ${category}` : t('recipeBookKicker')}</Text>
          <Text accessibilityRole="header" style={[styles.recipeTitle, titleStyle]}>{selected.title}</Text>

          {/* Three columns; with large text, rows with the label on the left. */}
          <View style={[styles.recipeStats, stacked && styles.recipeStatsStacked]}>
            {stats.map((stat, index) => (
              <View key={stat.label} style={stacked ? styles.recipeStatRow : styles.recipeStatColumn}>
                {index > 0 && <View style={stacked ? styles.recipeStatRowDivider : styles.recipeStatDivider} />}
                <View style={stacked ? styles.recipeStatStacked : styles.recipeStat}>
                  <Text style={styles.recipeStatLabel}>{stat.label}</Text>
                  {stat.unit === undefined ? (
                    <Text style={styles.recipeStatText}>{stat.value}</Text>
                  ) : (
                    <Text style={styles.recipeStatValue}>
                      {stat.value} <Text style={styles.recipeStatUnit}>{stat.unit}</Text>
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>

          {lastCooking ? (
            <Pressable
              onPress={() => router.push({ pathname: '/history', params: { id: selected.id } })}
              style={({ pressed }) => [styles.recipeHistoryCard, pressed && { backgroundColor: colors.cardPressed }]}
              accessibilityRole="button"
              accessibilityLabel={t('openCookingHistory')}
            >
              {historyCard}
            </Pressable>
          ) : (
            <View style={styles.recipeHistoryCard}>{historyCard}</View>
          )}

          <View style={styles.recipeSectionHeading}>
            <Text accessibilityRole="header" style={styles.recipeSectionTitle}>{t('ingredients')}</Text>
            {ingredientCount > 0 && (
              <Text style={styles.recipeSectionMeta}>
                {ingredientCount} {plural(language, ingredientCount, t('ingredientOne'), t('ingredientFew'), t('ingredientMany'))}
              </Text>
            )}
          </View>
          <View style={styles.group}>
            {ingredientCount === 0 ? (
              <View style={styles.groupRow}><Text style={styles.groupTextMuted}>{t('notSpecified')}</Text></View>
            ) : (
              selected.ingredients.map((ingredient, index) => {
                const { name, amount } = splitIngredient(ingredient);
                return (
                  <View key={`${ingredient}-${index}`} style={styles.recipeIngredientRow} accessible accessibilityLabel={ingredient}>
                    {index > 0 && <View style={styles.separator} />}
                    <Text style={styles.recipeIngredientName}>{name}</Text>
                    {amount ? <Text style={styles.recipeIngredientAmount}>{amount}</Text> : null}
                  </View>
                );
              })
            )}
          </View>
          {ingredientCount > 0 && (
            <Pressable
              onPress={handleAddToShopping}
              style={({ pressed }) => [styles.choiceSecondary, styles.recipeAction, pressed && { backgroundColor: colors.cardPressed }]}
              accessibilityRole="button"
              accessibilityLabel={t('addToShopping')}
            >
              <Ionicons name="basket-outline" size={20} color={colors.text} />
              <Text style={styles.choiceSecondaryText}>{t('addToShopping')}</Text>
            </Pressable>
          )}

          <View style={styles.recipeSectionHeading}>
            <Text accessibilityRole="header" style={styles.recipeSectionTitle}>{t('preparation')}</Text>
            {canCook && (
              <Text style={styles.recipeSectionMeta}>
                {steps.length} {plural(language, steps.length, t('stepOne'), t('stepFew'), t('stepMany'))}
              </Text>
            )}
          </View>
          <View style={styles.group}>
            {!canCook ? (
              <View style={styles.groupRow}><Text style={styles.groupTextMuted}>{t('stepsNotSpecified')}</Text></View>
            ) : (
              steps.map((step, index) => (
                <View key={`${step}-${index}`} style={styles.recipeStepRow}>
                  {index > 0 && <View style={styles.separator} />}
                  <View style={styles.recipeStepNumber}>
                    <Text style={styles.recipeStepNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.groupText}>{step}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.choiceActions}>
            {canCook && (
              <Pressable
                onPress={() => router.push({ pathname: '/cooking', params: { id: selected.id } })}
                style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('startCooking')}
              >
                <Text style={styles.choicePrimaryText}>{t('startCooking')}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.accentText} />
              </Pressable>
            )}
            {/* With steps, a cooking is recorded only at the end of step-by-step cooking.
                A recipe without steps has no such finish, so "I cooked this" records it directly. */}
            {!canCook && (
              <Pressable
                onPress={handleCooked}
                style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('cookedAction')}
              >
                <Ionicons name="checkmark" size={20} color={colors.accentText} />
                <Text style={styles.choicePrimaryText}>{t('cookedAction')}</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [styles.recipeDelete, pressed && { backgroundColor: colors.cardPressed }]}
            accessibilityRole="button"
            accessibilityLabel={t('deleteRecipe')}
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.deleteText}>{t('deleteRecipe')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {shareSheet}
    </View>
  );
}
