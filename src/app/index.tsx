import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { FlatList, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILTERS } from '@/constants/recipes';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { keyboardDismissOnDrag } from '@/utils/keyboard-dismiss';
import { categoryLabel, filterLabel, plural, todayLabel } from '@/utils/recipes';

const MIN_BOTTOM_GAP = 8;
const BOTTOM_BAR_HEIGHT = 60;
const LIST_TO_BAR_GAP = 24;
// Large system text moves the cooking time into the metadata line.
const STACKED_FONT_SCALE = 1.35;
// Working column on tablets and desktop: 840 plus the 16 side padding.
const COLUMN_MAX_WIDTH = 872;

export default function HomeScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><HomeContent /></PaletteProvider>;
}

function HomeContent() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  // Measured bar height: large text can make the main action taller than 60.
  const [barHeight, setBarHeight] = useState(BOTTOM_BAR_HEIGHT);
  const { colors, fontScale, language, t } = useSettings();
  const styles = useStyles();
  const {
    recipes, visible, query, setQuery, filter, setFilter, sort, setSort, pickRandom, recipeMeta,
  } = useRecipes();

  const avgTime = recipes.length
    ? Math.round(recipes.reduce((sum, recipe) => sum + recipe.time, 0) / recipes.length)
    : 0;
  const stackedTime = fontScale >= STACKED_FONT_SCALE;

  // iOS standalone web apps already constrain the React root above the Home
  // Indicator. Applying the CSS safe-area value again lifts the bar twice.
  const effectiveBottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const bottomBarOffset = Math.max(effectiveBottomInset, MIN_BOTTOM_GAP);
  const hideBottomBar = keyboardVisible || searchFocused;
  // Keep the list geometry stable while the keyboard opens. Only the floating
  // controls disappear; changing the content inset here makes iOS visibly
  // nudge the focused search field during its own viewport adjustment.
  const listBottomPadding = bottomBarOffset + Math.max(BOTTOM_BAR_HEIGHT, barHeight) + LIST_TO_BAR_GAP;
  const barSideInset = Math.max(16, (windowWidth - COLUMN_MAX_WIDTH) / 2 + 16);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (
      Platform.OS !== 'web'
      || !searchFocused
      || typeof window === 'undefined'
      || !window.visualViewport
    ) return;

    const viewport = window.visualViewport;
    const expandedHeight = viewport.height;
    const handleViewportResize = () => {
      setKeyboardVisible(viewport.height < expandedHeight * 0.8);
    };

    viewport.addEventListener('resize', handleViewportResize);
    return () => viewport.removeEventListener('resize', handleViewportResize);
  }, [searchFocused]);

  function handleRandom() {
    const recipe = pickRandom();
    if (recipe) {
      router.push({ pathname: '/recipe/[id]', params: { id: recipe.id, fromRandom: 'true' } });
    }
  }

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
            onPress={() => router.push('/shopping')}
            hitSlop={2}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('openShoppingList')}
          >
            <Ionicons name="basket-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={2}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

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
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.homeSearchInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => {
            setSearchFocused(true);
          }}
          onBlur={() => {
            setSearchFocused(false);
            if (Platform.OS === 'web') setKeyboardVisible(false);
          }}
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
          paddingBottom: listBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissOnDrag}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.homeEmpty}>
            <Ionicons name={emptyState.icon} size={28} color={colors.muted} />
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
                  <Text style={styles.homeRowTitle} numberOfLines={stackedTime ? undefined : 2}>{item.title}</Text>
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

      {!hideBottomBar && (
        <>
          {/* The fade covers only the bar's own zone so content above it stays readable. */}
          <LinearGradient
            colors={[`${colors.bg}00`, colors.fadeEnd]}
            style={[styles.bottomFade, { height: listBottomPadding }]}
            pointerEvents="none"
          />
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(100)}
            style={[styles.bottomBar, { bottom: bottomBarOffset, left: barSideInset, right: barSideInset }]}
            onLayout={event => setBarHeight(Math.ceil(event.nativeEvent.layout.height))}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={handleRandom}
              style={({ pressed }) => [styles.fab, styles.homeRandomButton, pressed && { transform: [{ scale: 0.96 }] }]}
              accessibilityRole="button"
            >
              <Text style={[styles.fabText, styles.homeRandomText]}>{t('whatToCook')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/form')}
              style={({ pressed }) => [styles.fabSecondary, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={t('addRecipe')}
            >
              <Ionicons name="add" size={30} color={colors.text} />
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}
