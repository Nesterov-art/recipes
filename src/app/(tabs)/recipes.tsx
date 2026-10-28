import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeOut } from 'react-native-reanimated';
import { FlatList, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyStateArt } from '@/components/choice-art';
import { FILTERS } from '@/constants/recipes';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { keyboardDismissOnDrag } from '@/utils/keyboard-dismiss';
import { categoryLabel, filterLabel, plural, todayLabel } from '@/utils/recipes';

// The tab bar ends the screen; the last card stops this far above it.
const LIST_BOTTOM_GAP = 24;
// Large system text moves the cooking time into the metadata line.
const STACKED_FONT_SCALE = 1.35;
// Working column on tablets and desktop: 840 plus the 16 side padding.
const COLUMN_MAX_WIDTH = 872;

export default function RecipesScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><RecipesContent /></PaletteProvider>;
}

function RecipesContent() {
  const insets = useSafeAreaInsets();
  const { colors, fontScale, language, t } = useSettings();
  const styles = useStyles();
  const {
    recipes, visible, query, setQuery, filter, setFilter, sort, setSort, recipeMeta,
  } = useRecipes();

  const avgTime = recipes.length
    ? Math.round(recipes.reduce((sum, recipe) => sum + recipe.time, 0) / recipes.length)
    : 0;
  // On web the app scales text itself (fontScale); natively the OS does (systemFontScale).
  const { fontScale: systemFontScale } = useWindowDimensions();
  const textScale = fontScale * systemFontScale;
  const stackedTime = textScale >= STACKED_FONT_SCALE;
  const cookingCount = Object.values(recipeMeta).reduce((sum, meta) => sum + meta.cookings.length, 0);

  function cycleSort() {
    setSort(sort === 'recent' ? 'asc' : sort === 'asc' ? 'desc' : 'recent');
  }

  const currentSortLabel = sort === 'recent' ? t('sortRecent') : sort === 'asc' ? t('sortAsc') : t('sortDesc');
  const ingredientsLabel = (count: number) =>
    `${count} ${plural(language, count, t('ingredientOne'), t('ingredientFew'), t('ingredientMany'))}`;

  const listHeader = (
    <View>
      <View style={styles.homeHeader}>
        <View style={styles.homeHeaderText}>
          <Text accessibilityRole="header" style={styles.homeTitle}>Monorec</Text>
          <Text style={styles.homeDate}>{todayLabel(language)}</Text>
        </View>
        <View style={styles.homeActions}>
          <Pressable
            onPress={() => router.push('/import-link')}
            hitSlop={2}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('addByLink')}
          >
            <Ionicons name="link-outline" size={24} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/form')}
            hitSlop={2}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('addRecipe')}
          >
            <Ionicons name="add" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/history')}
        style={({ pressed }) => [styles.historyEntryButton, pressed && { backgroundColor: colors.cardPressed }]}
        accessibilityRole="button"
        accessibilityLabel={t('cookingHistory')}
      >
        <View style={styles.settingsRowIcon}>
          <Ionicons name="time-outline" size={20} color={colors.text} />
        </View>
        <Text style={styles.shoppingMatchesButtonText}>{t('cookingHistory')}</Text>
        {cookingCount > 0 && <Text style={styles.recipeSectionMeta}>{cookingCount}</Text>}
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

      <View style={styles.homeStats}>
        <View style={styles.homeStatCard}>
          <View style={styles.homeStatLabelRow}>
            <Ionicons name="book-outline" size={16} color={colors.muted} />
            <Text style={styles.homeStatLabel}>{t('inBook')}</Text>
          </View>
          <Text style={styles.homeStatValue}>{recipes.length}</Text>
          <Text style={styles.homeStatHint}>
            {plural(language, recipes.length, t('recipeOne'), t('recipeFew'), t('recipeMany'))}
          </Text>
        </View>

        <View style={styles.homeStatCard}>
          <View style={styles.homeStatLabelRow}>
            <Ionicons name="timer-outline" size={16} color={colors.muted} />
            <Text style={styles.homeStatLabel}>{t('average')}</Text>
          </View>
          <Text style={styles.homeStatValue}>{avgTime}</Text>
          <Text style={styles.homeStatHint}>
            {plural(language, avgTime, t('minuteOne'), t('minuteFew'), t('minuteMany'))}
          </Text>
        </View>
      </View>

      <View style={styles.homeSearch}>
        {/* A fixed slot: on web the icon font arrives later, and the field must not shift then. */}
        <View style={styles.homeSearchIcon}>
          <Ionicons name="search" size={18} color={colors.muted} />
        </View>
        <TextInput
          style={styles.homeSearchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          accessibilityLabel={t('searchRecipes')}
        />
        {/* iOS shows its own clear button while editing. Elsewhere the slot is
            always reserved so typing never resizes the field. */}
        {Platform.OS !== 'ios' && (query ? (
          <Pressable
            onPress={() => setQuery('')}
            style={({ pressed }) => [styles.homeSearchClear, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('clearSearch')}
          >
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : <View style={styles.homeSearchClear} />)}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.homeChipsScroll}
        contentContainerStyle={styles.homeChipsRow}
      >
        {FILTERS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.homeChip, filter === item && styles.homeChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
            aria-selected={filter === item}
          >
            <Text style={[styles.homeChipText, filter === item && styles.homeChipTextActive]}>
              {filterLabel(item, t)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.homeListHeading}>
        <Text accessibilityRole="header" style={styles.homeListTitle}>
          {query || filter !== 'Все' ? t('found', { count: visible.length }) : t('allRecipes')}
        </Text>
        <Pressable
          onPress={cycleSort}
          style={({ pressed }) => [
            styles.homeSort,
            pressed && { backgroundColor: colors.cardPressed },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('changeSort')}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.text} />
          <Text style={styles.homeSortText}>{currentSortLabel}</Text>
        </Pressable>
      </View>
    </View>
  );

  const emptyState = recipes.length === 0
    ? { icon: 'book-outline' as const, title: t('emptyRecipesTitle'), text: t('emptyRecipesHint'), action: t('addFirstRecipe'), onPress: () => router.push('/form') }
    : query
      ? { icon: 'search-outline' as const, title: t('emptySearchTitle'), text: t('emptySearchHint'), action: t('clearSearch'), onPress: () => setQuery('') }
      : { icon: 'funnel-outline' as const, title: t('emptyFilterTitle'), text: t('emptyFilterHint'), action: t('showAllRecipes'), onPress: () => setFilter('Все') };

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        style={{ marginTop: insets.top }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: COLUMN_MAX_WIDTH,
          alignSelf: 'center',
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: LIST_BOTTOM_GAP,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissOnDrag}
        // iOS: the list runs under the keyboard; inset it so the last card can still
        // scroll above. Android resizes the window instead.
        automaticallyAdjustKeyboardInsets
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.homeEmpty}>
            {/* EMPTY-01 only for the empty book; no results for a search or filter stay plain. */}
            {recipes.length === 0
              ? <EmptyStateArt height={200} />
              : <Ionicons name={emptyState.icon} size={28} color={colors.muted} />}
            <Text style={styles.homeEmptyTitle}>{emptyState.title}</Text>
            <Text style={styles.homeEmptyText}>{emptyState.text}</Text>
            <Pressable
              onPress={emptyState.onPress}
              style={({ pressed }) => [styles.homeEmptyAction, pressed && { backgroundColor: colors.cardPressed }]}
              accessibilityRole="button"
            >
              <Text style={styles.homeEmptyActionText}>{emptyState.action}</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === visible.length - 1;
          const favorite = recipeMeta[item.id]?.favorite;
          const time = `${item.time} ${t('minuteShort')}`;
          const meta = [
            item.category ? categoryLabel(item.category, t) : null,
            ingredientsLabel(item.ingredients.length),
            stackedTime ? time : null,
          ].filter(Boolean).join(' · ');
          return (
            <Animated.View
              exiting={FadeOut.duration(160)}
            >
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/recipe/[id]', params: { id: item.id } })
                }
                style={({ pressed }) => [
                  styles.homeRow,
                  isFirst && styles.homeRowFirst,
                  isLast && styles.homeRowLast,
                  pressed && { backgroundColor: colors.cardPressed },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('openRecipe', { title: item.title })}
              >
                {!isFirst && <View style={styles.homeRowSeparator} />}
                <View style={styles.homeRowBody}>
                  <Text style={styles.homeRowTitle} numberOfLines={textScale > 1 ? undefined : 2}>{item.title}</Text>
                  <Text style={styles.homeRowMeta}>{meta}</Text>
                </View>
                <View style={styles.homeRowAside}>
                  {favorite && <Ionicons name="heart" size={16} color={colors.text} />}
                  {!stackedTime && <Text style={styles.homeRowTime}>{time}</Text>}
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}
