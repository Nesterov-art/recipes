import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { FlatList, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FILTERS } from '@/constants/recipes';
import { useRecipes } from '@/context/recipes-context';
import { useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { categoryLabel, filterLabel, plural, todayLabel } from '@/utils/recipes';

const MIN_BOTTOM_GAP = 8;
const BOTTOM_BAR_HEIGHT = 60;
const LIST_TO_BAR_GAP = 24;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { colors, language, t } = useSettings();
  const styles = useStyles();
  const {
    recipes, visible, query, setQuery, filter, setFilter, sort, setSort, pickRandom, recipeMeta,
  } = useRecipes();

  const avgTime = recipes.length
    ? Math.round(recipes.reduce((sum, recipe) => sum + recipe.time, 0) / recipes.length)
    : 0;

  // iOS standalone web apps already constrain the React root above the Home
  // Indicator. Applying the CSS safe-area value again lifts the bar twice.
  const effectiveBottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const bottomBarOffset = Math.max(effectiveBottomInset, MIN_BOTTOM_GAP);
  const hideBottomBar = keyboardVisible || searchFocused;
  // Keep the list geometry stable while the keyboard opens. Only the floating
  // controls disappear; changing the content inset here makes iOS visibly
  // nudge the focused search field during its own viewport adjustment.
  const listBottomPadding = bottomBarOffset + BOTTOM_BAR_HEIGHT + LIST_TO_BAR_GAP;

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

  const listHeader = (
    <View>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.bigTitle}>{t('appTitle')}</Text>
          <Text style={styles.subtitle}>{todayLabel(language)}</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/shopping')}
            style={({ pressed }) => [styles.settingsIcon, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('openShoppingList')}
          >
            <Ionicons name="basket-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.settingsIcon, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={styles.statLabelRow}>
            <Ionicons name="book-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>{t('inBook')}</Text>
          </View>
          <Text style={styles.statValue}>{recipes.length}</Text>
          <Text style={styles.statHint}>
            {plural(language, recipes.length, t('recipeOne'), t('recipeFew'), t('recipeMany'))}
          </Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statLabelRow}>
            <Ionicons name="timer-outline" size={16} color={colors.muted} />
            <Text style={styles.statLabel}>{t('average')}</Text>
          </View>
          <Text style={styles.statValue}>{avgTime}</Text>
          <Text style={styles.statHint}>
            {plural(language, avgTime, t('minuteOne'), t('minuteFew'), t('minuteMany'))}
          </Text>
        </View>
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.listHeadingTitle}>
          {query || filter !== 'Все' ? t('found', { count: visible.length }) : t('allRecipes')}
        </Text>
        <Pressable
          onPress={cycleSort}
          style={({ pressed }) => [
            styles.sortButton,
            pressed && { backgroundColor: colors.cardPressed },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('changeSort')}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.text} />
          <Text style={styles.sortText}>{currentSortLabel}</Text>
        </Pressable>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
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
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {FILTERS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.chip, filter === item && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
          >
            <Text style={[styles.chipText, filter === item && styles.chipTextActive]}>
              {filterLabel(item, t)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        style={{ marginTop: insets.top }}
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 16,
          paddingBottom: listBottomPadding,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {recipes.length === 0
              ? t('emptyRecipes')
              : t('emptySearch')}
          </Text>
        }
        renderItem={({ item, index }) => {
          const isFirst = index === 0;
          const isLast = index === visible.length - 1;
          return (
            <Animated.View
              exiting={FadeOut.duration(160)}
            >
              <Pressable
              onPress={() =>
                router.push({ pathname: '/recipe/[id]', params: { id: item.id } })
              }
              style={({ pressed }) => [
                styles.row,
                isFirst && styles.rowFirst,
                isLast && styles.rowLast,
                pressed && { backgroundColor: colors.cardPressed },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('openRecipe', { title: item.title })}
              >
                {!isFirst && <View style={styles.separator} />}
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowSub}>
                    {item.category ? `${categoryLabel(item.category, t)} · ` : ''}
                    {item.ingredients.length}{' '}
                    {plural(
                      language,
                      item.ingredients.length,
                      t('ingredientOne'),
                      t('ingredientFew'),
                      t('ingredientMany'),
                    )}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  {recipeMeta[item.id]?.favorite && (
                    <Ionicons name="heart" size={16} color={colors.text} />
                  )}
                  <Text style={styles.rowValue}>{item.time} {t('minuteShort')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
      />

      {!hideBottomBar && (
        <>
          <LinearGradient
            colors={['rgba(0,0,0,0)', colors.fadeEnd]}
            style={styles.bottomFade}
            pointerEvents="none"
          />
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(100)}
            style={[styles.bottomBar, { bottom: bottomBarOffset }]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={handleRandom}
              style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.96 }] }]}
              accessibilityRole="button"
            >
              <Text style={styles.fabText}>{t('whatToCook')}</Text>
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
