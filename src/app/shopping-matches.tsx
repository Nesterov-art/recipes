import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentHeading } from '@/components/accent-heading';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useShopping } from '@/context/shopping-context';
import { useStyles } from '@/styles';
import {
  matchRecipesToShoppingList,
  type RecipeShoppingMatch,
} from '@/utils/recipe-matches';

// Working column on tablets and desktop, as in Settings.
const COLUMN_MAX_WIDTH = 680;

export default function ShoppingMatchesScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ShoppingMatchesContent /></PaletteProvider>;
}

function ShoppingMatchesContent() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useSettings();
  const { recipes } = useRecipes();
  const { items } = useShopping();
  const styles = useStyles();
  const matches = useMemo(
    () => matchRecipesToShoppingList(recipes, items),
    [items, recipes],
  );

  function emptyMessage() {
    if (items.length === 0) return t('shoppingMatchesEmptyList');
    if (recipes.length === 0) return t('shoppingMatchesEmptyRecipes');
    return t('shoppingMatchesEmptyResults');
  }

  function renderMatch({ item: match, index }: { item: RecipeShoppingMatch; index: number }) {
    const percentage = Math.round(match.matchRatio * 100);
    const progressWidth = `${percentage}%` as `${number}%`;
    const complete = match.missingIngredients.length === 0;

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: match.recipe.id } })}
        style={({ pressed }) => [
          styles.recipeMatchRow,
          index === 0 && styles.recipeMatchRowFirst,
          index === matches.length - 1 && styles.recipeMatchRowLast,
          pressed && styles.recipeMatchRowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('openRecipe', { title: match.recipe.title })}
      >
        {index > 0 && <View style={styles.recipeMatchSeparator} />}
        <View style={styles.recipeMatchHeader}>
          <View style={styles.recipeMatchHeaderText}>
            <Text style={styles.recipeMatchTitle}>{match.recipe.title}</Text>
            <Text style={styles.recipeMatchMeta}>
              {match.recipe.time} {t('minuteShort')} ·{' '}
              {t('matchedIngredients', {
                matched: match.matchedCount,
                total: match.totalCount,
              })}
            </Text>
          </View>
          <Text style={styles.recipeMatchPercent}>{percentage}%</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </View>
        <View style={styles.recipeMatchProgress}>
          <View style={[styles.recipeMatchProgressFill, { width: progressWidth }]} />
        </View>
        {complete ? (
          <View style={styles.recipeMatchCompleteRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.recipeMatchComplete}>{t('allIngredientsListed')}</Text>
          </View>
        ) : (
          <Text style={styles.recipeMatchMissing}>
            <Text style={styles.recipeMatchMissingLabel}>{t('missingIngredients')}: </Text>
            {match.missingIngredients.join(', ')}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={matches}
        keyExtractor={(match) => match.recipe.id}
        renderItem={renderMatch}
        ListHeaderComponent={(
          <View style={styles.recipeMatchHeading}>
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
            </View>
            <AccentHeading style={styles.settingsTitle}>{t('whatCanCook')}</AccentHeading>
            <Text style={styles.settingsHint}>{t('shoppingMatchesHint')}</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.homeEmpty}>
            <Ionicons name="restaurant-outline" size={28} color={colors.muted} />
            <Text style={styles.homeEmptyTitle}>{t('shoppingMatchesEmptyTitle')}</Text>
            <Text style={styles.homeEmptyText}>{emptyMessage()}</Text>
          </View>
        )}
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          maxWidth: COLUMN_MAX_WIDTH,
          alignSelf: 'center',
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
