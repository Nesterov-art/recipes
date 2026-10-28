import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useFittedTitle } from '@/hooks/use-fitted-title';
import { useStyles } from '@/styles';
import { groupHistoryByMonth, historyEntries, historyRows, type HistoryEntry } from '@/utils/cooking-history';
import {
  categoryLabel,
  cookingDateLabel,
  cookingHistoryDateLabel,
  historyDayParts,
  historyMonthLabel,
  plural,
} from '@/utils/recipes';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function HistoryScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><HistoryContent /></PaletteProvider>;
}

// Without an id: every cooking in the book, by month. With an id: one recipe's cookings.
// Both read the existing per-recipe history; nothing here writes to it. The list is
// virtualized: a history of tens of thousands of entries must not mount every row.
function HistoryContent() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const { colors, language, t } = useSettings();
  const { recipeMeta, recipes } = useRecipes();
  const styles = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipeId = first(params.id);
  const recipe = recipeId ? recipes.find((item) => item.id === recipeId) : undefined;
  const entries = useMemo(
    () => recipeId ? (recipe ? historyEntries(recipeMeta, recipe.id) : []) : historyEntries(recipeMeta),
    [recipeMeta, recipeId, recipe],
  );
  const rows = useMemo(() => historyRows(groupHistoryByMonth(entries)), [entries]);
  const byId = useMemo(() => new Map(recipes.map(item => [item.id, item])), [recipes]);
  const heading = recipe ? recipe.title : t('historyTitle');
  const titleStyle = useFittedTitle(heading, styles.recipeTitle.fontSize);

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/recipes');
  }

  const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(language, n, one, few, many)}`;

  function row(entry: HistoryEntry, first: boolean, last: boolean) {
    const day = historyDayParts(entry.cookedAt, language);
    const badge = (
      <View style={styles.historyBadge}>
        <Text style={styles.historyBadgeDay}>{day?.day ?? '—'}</Text>
        {day && <Text style={styles.historyBadgeMonth}>{day.month}</Text>}
      </View>
    );
    const shape = [first && styles.homeRowFirst, last && styles.homeRowLast];
    const separator = !first && <View style={styles.homeRowSeparator} />;
    const note = entry.note ? <Text style={styles.historyEntryNote}>«{entry.note}»</Text> : null;

    if (recipeId) {
      // One recipe: the date is the headline, the note follows.
      return (
        <View key={entry.id} style={[styles.historyEntry, ...shape]} testID="history-entry">
          {separator}
          {badge}
          <View style={styles.historyEntryBody}>
            <Text style={styles.historyEntryTitle}>{cookingHistoryDateLabel(entry.cookedAt, language) || t('historyNoDate')}</Text>
            {note}
          </View>
        </View>
      );
    }

    const dish = byId.get(entry.recipeId);
    const meta = dish
      ? [dish.category ? categoryLabel(dish.category, t) : null, `${dish.time} ${t('minuteShort')}`].filter(Boolean).join(' · ')
      : null;
    const body = (
      <>
        {separator}
        {badge}
        <View style={styles.historyEntryBody}>
          <Text style={styles.historyEntryTitle}>{dish ? dish.title : t('historyDeletedRecipe')}</Text>
          {meta && <Text style={styles.historyEntryMeta}>{meta}</Text>}
          {note}
        </View>
      </>
    );
    // A cooking whose recipe is gone stays listed but leads nowhere.
    if (!dish) return <View key={entry.id} style={[styles.historyEntry, ...shape]} testID="history-entry">{body}</View>;
    return (
      <Pressable
        key={entry.id}
        onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: dish.id } })}
        style={({ pressed }) => [styles.historyEntry, ...shape, pressed && { backgroundColor: colors.cardPressed }]}
        accessibilityRole="button"
        accessibilityLabel={t('openHistoryEntry', { title: dish.title, date: cookingDateLabel(entry.cookedAt, language) || t('historyNoDate') })}
        testID="history-entry"
      >
        {body}
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  const header = (
    <>
      <View style={styles.topBar}>
        <Pressable
          onPress={back}
          hitSlop={10}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>
      <Text style={styles.choiceKicker}>{recipe ? t('cookingHistory') : t('historyKicker')}</Text>
      <Text accessibilityRole="header" style={[styles.recipeTitle, titleStyle]}>{heading}</Text>

      {entries.length > 0 && (
        <View style={styles.historySummary}>
          <Text style={styles.recipeStatLabel}>{t('historyTotal')}</Text>
          <Text style={styles.historySummaryValue} testID="history-total">
            {entries.length}{' '}
            <Text style={styles.historySummaryUnit}>
              {plural(language, entries.length, t('cookedTimesOne'), t('cookedTimesFew'), t('cookedTimesMany'))}
            </Text>
          </Text>
          <Text style={styles.historySummaryHint}>{t('historyTotalHint')}</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={item => item.type === 'month' ? `month:${item.key}` : item.key}
        contentContainerStyle={[styles.recipeContent, { paddingTop: insets.top + 8, paddingBottom: bottomInset + 40 }]}
        showsVerticalScrollIndicator={false}
        testID="history-list"
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={[styles.homeEmpty, { marginTop: 40 }]} testID="history-empty">
            <Ionicons name="time-outline" size={28} color={colors.muted} />
            <Text style={styles.homeEmptyTitle}>{t('historyEmptyTitle')}</Text>
            <Text style={styles.homeEmptyText}>{t('historyEmptyText')}</Text>
          </View>
        }
        renderItem={({ item }) => item.type === 'month' ? (
          <View style={styles.historyMonthHeading}>
            <Text accessibilityRole="header" style={styles.recipeSectionTitle}>
              {item.key ? historyMonthLabel(item.year, item.month, language) : t('historyNoDate')}
            </Text>
            <Text style={styles.recipeSectionMeta}>{count(item.count, t('entryOne'), t('entryFew'), t('entryMany'))}</Text>
          </View>
        ) : row(item.entry, item.first, item.last)}
      />
    </View>
  );
}
