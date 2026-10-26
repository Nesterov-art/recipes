import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtCard, ChooseWhatToCookArt, OrbitArt, useArt } from '@/components/choice-art';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { categoryLabel } from '@/utils/recipes';
import { pickSmartRandom } from '@/utils/smart-random';

// The Choice tab only shows a pick after "Pick a dish"; it never stores one.
type Phase =
  | { kind: 'welcome' }
  | { kind: 'empty' }
  | { kind: 'result'; recipeId: string; another: boolean };

export default function ChoiceScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><ChoiceContent /></PaletteProvider>;
}

function ChoiceContent() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const { colors, t } = useSettings();
  const styles = useStyles();
  const art = useArt();
  const { recipes, recipeMeta } = useRecipes();
  const [phase, setPhase] = useState<Phase>({ kind: 'welcome' });
  const lastPickId = useRef<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  // Every new visit to the tab starts again from the welcome. Opening a recipe
  // from the result pushes it over the tabs and keeps the result for the return.
  useEffect(() => {
    const welcome = () => {
      setPhase({ kind: 'welcome' });
      scroll.current?.scrollTo({ y: 0, animated: false });
    };
    const unsubscribeState = navigation.addListener('state', (event) => {
      const state = (event.data as { state?: { index: number; routes: { name: string }[] } }).state;
      if (state && state.routes[state.index]?.name !== 'index') welcome();
    });
    // Tapping the already selected Choice tab also returns to the welcome.
    const unsubscribeTab = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) welcome();
    });
    return () => { unsubscribeState(); unsubscribeTab(); };
  }, [navigation]);

  function pick(another: boolean) {
    // The whole book: search and filters of the Recipes tab never narrow the pick.
    // The weighting and the no-immediate-repeat rule are the existing algorithm.
    const recipe = pickSmartRandom(recipes, recipeMeta, { lastRecipeId: lastPickId.current });
    if (!recipe) {
      setPhase({ kind: 'empty' });
      return;
    }
    lastPickId.current = recipe.id;
    setPhase({ kind: 'result', recipeId: recipe.id, another });
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  // A picked recipe deleted meanwhile falls back to the welcome.
  const picked = phase.kind === 'result' ? recipes.find(recipe => recipe.id === phase.recipeId) : undefined;
  const current: Phase = phase.kind === 'result' && !picked ? { kind: 'welcome' } : phase;

  // Large text grows the title until its longest word ("приготовим?") would no
  // longer fit the column and break inside the word; never below the base 34.
  const titleSize = Math.max(34, Math.min(styles.choiceTitle.fontSize, Math.floor((Math.min(width, 560) - 32) / 7)));
  const titleStyle = { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.18) };

  const header = (kicker: string, title: string, lede: string) => (
    <View>
      <Text style={styles.choiceKicker}>{kicker}</Text>
      <Text accessibilityRole="header" style={[styles.choiceTitle, titleStyle]}>{title}</Text>
      <Text style={styles.choiceLede}>{lede}</Text>
    </View>
  );

  const cardTop = (label: string) => (
    <View style={styles.choiceCardTop}>
      <Text style={[styles.choiceCardLabel, { color: art.label }]}>{label}</Text>
      <Ionicons name="sparkles-outline" size={18} color={art.label} accessibilityElementsHidden importantForAccessibility="no" />
    </View>
  );

  let body;
  if (current.kind === 'result' && picked) {
    const meta = [picked.category ? categoryLabel(picked.category, t) : null, `${picked.time} ${t('minuteShort')}`]
      .filter(Boolean).join('  ·  ');
    body = (
      <>
        {current.another
          ? header(t('choiceAnotherKicker'), t('choiceAnotherTitle'), t('choiceAnotherLede'))
          : header(t('choiceResultKicker'), t('choiceResultTitle'), t('choiceResultLede'))}
        <ArtCard style={styles.choiceCard}>
          {cardTop(t('choiceYourOption'))}
          <OrbitArt height={190} />
          <View style={styles.choiceCardCopy} testID="choice-result">
            <Text style={[styles.choiceCategoryLine, { color: art.warm }]}>{meta}</Text>
            <Text style={[styles.choiceRecipeTitle, { color: art.text }]}>{picked.title}</Text>
            <Text style={[styles.choiceCardText, { color: art.muted }]}>{t('choiceFromCollection')}</Text>
          </View>
        </ArtCard>
        <View style={styles.choiceActions}>
          <Pressable
            onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: picked.id } })}
            style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('openRecipeAction')}
          >
            <Text style={styles.choicePrimaryText}>{t('openRecipeAction')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.accentText} />
          </Pressable>
          {/* A single recipe has no real alternative to offer. */}
          {recipes.length > 1 && (
            <Pressable
              onPress={() => pick(true)}
              style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]}
              accessibilityRole="button"
            accessibilityLabel={t('anotherOption')}
            >
              <Ionicons name="shuffle" size={18} color={colors.text} />
              <Text style={styles.choiceSecondaryText}>{t('anotherOption')}</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.choiceNote}>{t('choiceResultNote')}</Text>
      </>
    );
  } else if (current.kind === 'empty') {
    body = (
      <>
        {header(t('choiceEmptyKicker'), t('choiceEmptyTitle'), t('choiceEmptyLede'))}
        <View style={styles.choiceEmptyCard} testID="choice-empty">
          <ChooseWhatToCookArt height={240} />
          <Text style={styles.choiceEmptyTitle}>{t('choiceEmptyCardTitle')}</Text>
          <Text style={styles.choiceEmptyText}>{t('choiceEmptyCardText')}</Text>
        </View>
        <View style={styles.choiceActions}>
          <Pressable
            onPress={() => router.push('/form')}
            style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('addFirstRecipe')}
          >
            <Ionicons name="add" size={20} color={colors.accentText} />
            <Text style={styles.choicePrimaryText}>{t('addFirstRecipe')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setPhase({ kind: 'welcome' })}
            style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]}
            accessibilityRole="button"
          >
            <Text style={styles.choiceSecondaryText}>{t('backToChoice')}</Text>
          </Pressable>
        </View>
      </>
    );
  } else {
    body = (
      <>
        {header(t('choiceKicker'), t('choiceTitle'), t('choiceLede'))}
        <ArtCard style={styles.choiceCard}>
          {cardTop(t('choiceInspiration'))}
          <OrbitArt height={200} />
          <View style={styles.choiceCardCopy}>
            <Text style={[styles.choiceCardTitle, { color: art.text }]}>{t('choiceIdeaTitle')}</Text>
            <Text style={[styles.choiceCardText, { color: art.muted }]}>{t('choiceIdeaText')}</Text>
          </View>
        </ArtCard>
        <View style={styles.choiceActions}>
          <Pressable
            onPress={() => pick(false)}
            style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('chooseDish')}
          >
            <Text style={styles.choicePrimaryText}>{t('chooseDish')}</Text>
          </Pressable>
        </View>
        <Text style={styles.choiceNote}>{t('choiceWelcomeNote')}</Text>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 24 }}
      >
        <View style={styles.choiceContent}>{body}</View>
      </ScrollView>
    </View>
  );
}
