import { Text, View } from 'react-native';

import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import type { SharedRecipe } from '@/utils/recipe-link';
import { categoryLabel, plural } from '@/utils/recipes';

// A Monorec link always has a title and a time; a page of a cooking site may lack either.
type Viewed = Omit<SharedRecipe, 'time'> & { time: number | null };

// A recipe received by link or found on a page, read-only: the in-app preview and the browser
// page. An unknown time reads "Time not given", never 0 minutes.
export function SharedRecipeView({ recipe }: { recipe: Viewed }) {
  const { colors, language, t } = useSettings();
  const styles = useStyles();
  const time = recipe.time === null ? t('timeNotSpecified') : `${recipe.time} ${t('minuteShort')}`;
  const details = [recipe.category ? categoryLabel(recipe.category, t) : null, time].filter(Boolean).join(' · ');
  return <>
    <Text accessibilityRole="header" style={[styles.recipeTitle, !recipe.title && { color: colors.muted }]}>{recipe.title || t('siteNoTitle')}</Text>
    <Text style={styles.homeRowMeta}>{details}</Text>

    <View style={styles.recipeSectionHeading}>
      <Text accessibilityRole="header" style={styles.recipeSectionTitle}>{t('ingredients')}</Text>
      {recipe.ingredients.length > 0 && <Text style={styles.recipeSectionMeta}>
        {recipe.ingredients.length} {plural(language, recipe.ingredients.length, t('ingredientOne'), t('ingredientFew'), t('ingredientMany'))}
      </Text>}
    </View>
    <View style={styles.group}>
      {recipe.ingredients.length === 0
        ? <View style={styles.groupRow}><Text style={styles.groupTextMuted}>{t('notSpecified')}</Text></View>
        : recipe.ingredients.map((ingredient, index) => (
          <View key={`${ingredient}-${index}`} style={styles.recipeIngredientRow}>
            {index > 0 && <View style={styles.separator} />}
            <Text style={styles.recipeIngredientName}>{ingredient}</Text>
          </View>
        ))}
    </View>

    <View style={styles.recipeSectionHeading}>
      <Text accessibilityRole="header" style={styles.recipeSectionTitle}>{t('preparation')}</Text>
    </View>
    <View style={styles.group}>
      {recipe.steps.length === 0
        ? <View style={styles.groupRow}><Text style={styles.groupTextMuted}>{t('stepsNotSpecified')}</Text></View>
        : recipe.steps.map((step, index) => (
          <View key={`${step}-${index}`} style={styles.recipeStepRow}>
            {index > 0 && <View style={styles.separator} />}
            <View style={styles.recipeStepNumber}><Text style={styles.recipeStepNumberText}>{index + 1}</Text></View>
            <Text style={styles.groupText}>{step}</Text>
          </View>
        ))}
    </View>
  </>;
}
