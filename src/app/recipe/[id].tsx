import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import {
  categoryLabel,
  cookingDateLabel,
  plural,
  ratingEmoji,
  ratingLabel,
} from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function RecipeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, language, t } = useSettings();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[]; fromRandom?: string | string[] }>();
  const id = first(params.id);
  const fromRandom = first(params.fromRandom) === 'true';
  const { recipes, visible, deleteRecipe, getRecipeMeta, pickRandom, toggleFavorite } = useRecipes();
  const selected = recipes.find((recipe) => recipe.id === id);

  if (!selected) return <View style={styles.screen} />;

  const selectedId = selected.id;
  const selectedTitle = selected.title;
  const meta = getRecipeMeta(selected.id);
  const lastCooking = meta.cookings[0];
  const lastRatedCooking = meta.cookings.find((cooking) => cooking.rating);
  const lastNotedCooking = meta.cookings.find((cooking) => cooking.note);

  function confirmDelete() {
    Alert.alert(t('deleteQuestion'), selectedTitle, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          deleteRecipe(selectedId);
          router.back();
        },
      },
    ]);
  }

  function handleAnother() {
    const recipe = pickRandom();
    if (recipe) {
      router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id, fromRandom: 'true' } });
    }
  }

  function handleAddToShopping() {
    router.push({ pathname: '/shopping-select', params: { id: selectedId } });
  }

  const ingredientCount = selected.ingredients.length;

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + (fromRandom ? 120 : 40),
        }}
      >
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
              <Ionicons
                name={meta.favorite ? 'heart' : 'heart-outline'}
                size={22}
                color={colors.text}
              />
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

        <Text style={styles.detailTitle}>{selected.title}</Text>
        {selected.category && <Text style={styles.subtitle}>{categoryLabel(selected.category, t)}</Text>}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statLabelRow}>
              <Ionicons name="timer-outline" size={16} color={colors.muted} />
              <Text style={styles.statLabel}>{t('time')}</Text>
            </View>
            <Text style={styles.statValue}>{selected.time}</Text>
            <Text style={styles.statHint}>
              {plural(language, selected.time, t('minuteOne'), t('minuteFew'), t('minuteMany'))}
            </Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statLabelRow}>
              <Ionicons name="list-outline" size={16} color={colors.muted} />
              <Text style={styles.statLabel}>{t('composition')}</Text>
            </View>
            <Text style={styles.statValue}>{ingredientCount}</Text>
            <Text style={styles.statHint}>
              {plural(language, ingredientCount, t('ingredientOne'), t('ingredientFew'), t('ingredientMany'))}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push({ pathname: '/cook', params: { id: selected.id } })}
          style={({ pressed }) => [styles.cookingButton, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          <Ionicons name="checkmark" size={21} color={colors.accentText} />
          <Text style={styles.cookingButtonText}>{t('cookedAction')}</Text>
        </Pressable>

        <View style={styles.cookingSummary}>
          {lastCooking ? (
            <>
              <Text style={styles.cookingSummaryText}>
                {t('cookedLabel', {
                  count: meta.cookings.length,
                  times: plural(
                    language,
                    meta.cookings.length,
                    t('cookedTimesOne'),
                    t('cookedTimesFew'),
                    t('cookedTimesMany'),
                  ),
                })}
              </Text>
              <Text style={styles.cookingSummaryMuted}>
                {t('lastCooked', { date: cookingDateLabel(lastCooking.cookedAt, language) })}
              </Text>
              {lastRatedCooking?.rating && (
                <>
                  <Text style={styles.cookingDetailLabel}>{t('lastRating')}</Text>
                  <Text style={styles.cookingSummaryText}>
                    {ratingEmoji(lastRatedCooking.rating)} {ratingLabel(lastRatedCooking.rating, t)}
                  </Text>
                </>
              )}
              {lastNotedCooking?.note && (
                <>
                  <Text style={styles.cookingDetailLabel}>{t('lastNote')}</Text>
                  <Text style={styles.cookingNote}>«{lastNotedCooking.note}»</Text>
                </>
              )}
              <Pressable
                onPress={() => router.push({ pathname: '/history', params: { id: selected.id } })}
                style={({ pressed }) => [styles.historyLink, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={t('openCookingHistory')}
              >
                <Text style={styles.historyLinkText}>{t('cookingHistory')}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            </>
          ) : (
            <Text style={styles.cookingSummaryMuted}>{t('neverCooked')}</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('ingredients')}</Text>
        <View style={styles.group}>
          {ingredientCount === 0 ? (
            <View style={styles.groupRow}><Text style={styles.groupTextMuted}>{t('notSpecified')}</Text></View>
          ) : (
            selected.ingredients.map((ingredient, index) => (
              <View key={`${ingredient}-${index}`} style={styles.groupRow}>
                {index > 0 && <View style={styles.separator} />}
                <Text style={styles.groupText}>{ingredient}</Text>
              </View>
            ))
          )}
        </View>
        {ingredientCount > 0 && (
          <Pressable
            onPress={handleAddToShopping}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="basket-outline" size={20} color={colors.text} />
            <Text style={styles.actionButtonText}>{t('addToShopping')}</Text>
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>{t('preparation')}</Text>
        <View style={styles.group}>
          {selected.steps.length === 0 ? (
            <View style={styles.groupRow}><Text style={styles.groupTextMuted}>{t('stepsNotSpecified')}</Text></View>
          ) : (
            selected.steps.map((step, index) => (
              <View key={`${step}-${index}`} style={styles.groupRow}>
                {index > 0 && <View style={[styles.separator, { left: 58 }]} />}
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.groupText}>{step}</Text>
              </View>
            ))
          )}
        </View>

        <Pressable
          onPress={confirmDelete}
          style={({ pressed }) => [
            styles.group,
            styles.deleteRow,
            pressed && { backgroundColor: colors.cardPressed },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.deleteText}>{t('deleteRecipe')}</Text>
        </Pressable>
      </ScrollView>

      {fromRandom && visible.length > 1 && (
        <>
          <LinearGradient
            colors={['rgba(0,0,0,0)', colors.fadeEnd]}
            style={styles.bottomFade}
            pointerEvents="none"
          />
          <View style={[styles.bottomBar, { bottom: insets.bottom + 8 }]} pointerEvents="box-none">
            <Pressable
              onPress={handleAnother}
              style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }] }]}
              accessibilityRole="button"
            >
              <Text style={styles.fabText}>{t('anotherOption')}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}
