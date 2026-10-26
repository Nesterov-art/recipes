import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StepByStepCookingArt } from '@/components/choice-art';
import { MONOREC_THEMES } from '@/constants/theme';
import { useRecipes } from '@/context/recipes-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';
import { useStyles } from '@/styles';
import { cookingSteps } from '@/utils/cooking';
import { keyboardDismissOnDrag } from '@/utils/keyboard-dismiss';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Segments read well up to about a dozen steps; longer recipes get one bar.
const MAX_SEGMENTS = 12;

export default function CookingScreen() {
  return <PaletteProvider palette={MONOREC_THEMES}><CookingContent /></PaletteProvider>;
}

// The current step lives only in this screen. The history gets one entry, through
// the existing recordCooking, only when "Save to history" is pressed at the finish.
function CookingContent() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const { colors, t } = useSettings();
  const styles = useStyles();
  const { recipes, recordCooking } = useRecipes();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const recipe = recipes.find(item => item.id === first(params.id));
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState('');
  const saving = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  async function save() {
    if (!recipe || saving.current) return;
    saving.current = true;
    // On a failed write the note stays here and the existing Retry saves it once.
    await recordCooking(recipe.id, { note }, close);
    saving.current = false;
  }

  const steps = recipe ? cookingSteps(recipe.steps) : [];
  const total = steps.length;
  // Steps edited meanwhile can shrink the list; never point past its end.
  const current = Math.min(step, Math.max(total - 1, 0));
  const last = current === total - 1;

  function close() {
    if (router.canGoBack()) router.back();
    else if (recipe) router.replace({ pathname: '/recipe/[id]', params: { id: recipe.id } });
    else router.replace('/recipes');
  }

  function go(next: number) {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  const closeButton = (
    <Pressable
      onPress={close}
      hitSlop={8}
      style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={t('closeCooking')}
    >
      <Ionicons name="close" size={24} color={colors.text} />
    </Pressable>
  );

  const topBar = (
    <View style={styles.cookingTopBar}>
      {closeButton}
      <Text style={[styles.choiceKicker, styles.cookingTopTitle]} numberOfLines={1}>{t('cookingKicker')}</Text>
    </View>
  );

  let body;
  let footer = null;
  if (!recipe || total === 0) {
    // A deleted recipe or one without usable directions: say so and offer the way back.
    body = (
      <>
        {topBar}
        <View style={styles.cookingDone} testID="cooking-unavailable">
          <Text style={styles.cookingDoneTitle}>{recipe ? t('cookingNoStepsTitle') : t('cookingRecipeMissing')}</Text>
          {recipe && <Text style={styles.cookingDoneText}>{t('cookingNoStepsText')}</Text>}
        </View>
      </>
    );
    footer = (
      <View style={[styles.choiceActions, { marginTop: 0 }]}>
        <Pressable
          onPress={close}
          style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={recipe ? t('toRecipe') : t('close')}
        >
          <Text style={styles.choicePrimaryText}>{recipe ? t('toRecipe') : t('close')}</Text>
        </Pressable>
      </View>
    );
  } else if (done) {
    body = (
      <>
        {topBar}
        <View style={styles.cookingDone} testID="cooking-done">
          <StepByStepCookingArt height={160} />
          <Text style={[styles.choiceKicker, { marginTop: 8 }]}>{t('cookingDoneKicker')}</Text>
          <Text accessibilityRole="header" style={styles.cookingDoneTitle}>{t('cookingDoneTitle')}</Text>
          <Text style={styles.cookingDoneText}>{t('cookingDoneText', { title: recipe.title })}</Text>
          <View style={styles.cookingTimeCard}>
            <Ionicons name="time-outline" size={20} color={colors.muted} />
            <Text style={styles.cookingTimeLabel}>{t('recipeTime')}</Text>
            <Text style={styles.cookingTimeValue}>{recipe.time} {t('minuteShort')}</Text>
          </View>
        </View>
        <Text style={styles.fieldLabel}>{t('personalNote')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('notePlaceholder')}
          placeholderTextColor={colors.muted}
          selectionColor={colors.text}
          style={[styles.field, styles.fieldMultiline]}
          multiline
          scrollEnabled={false}
        />
      </>
    );
    footer = (
      <View style={[styles.choiceActions, { marginTop: 0 }]}>
        <Pressable
          onPress={save}
          style={({ pressed }) => [styles.choicePrimary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('saveToHistory')}
        >
          <Text style={styles.choicePrimaryText}>{t('saveToHistory')}</Text>
        </Pressable>
        <Pressable
          onPress={close}
          style={({ pressed }) => [styles.choiceSecondary, pressed && { backgroundColor: colors.cardPressed }]}
          accessibilityRole="button"
          accessibilityLabel={t('toRecipe')}
        >
          <Text style={styles.choiceSecondaryText}>{t('toRecipe')}</Text>
        </Pressable>
      </View>
    );
  } else {
    const segments = total <= MAX_SEGMENTS;
    body = (
      <>
        {topBar}
        <View style={styles.cookingHeader}>
          <Text style={styles.cookingDish} numberOfLines={2} testID="cooking-dish">{recipe.title}</Text>
          <Text style={styles.cookingCount}>
            {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </Text>
        </View>
        <View
          style={styles.cookingProgress}
          accessibilityRole="progressbar"
          accessibilityLabel={t('cookingProgress')}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current + 1}
          testID="cooking-progress"
        >
          {segments
            ? steps.map((_, index) => (
              <View key={index} style={[styles.cookingSegment, index <= current && styles.cookingSegmentOn]} />
            ))
            : (
              <View style={styles.cookingSegment}>
                <View style={{ width: `${((current + 1) / total) * 100}%`, height: '100%', borderRadius: 2, backgroundColor: colors.text }} />
              </View>
            )}
        </View>
        <Text style={[styles.choiceKicker, styles.cookingStepKicker]}>
          {t('stepOf', { current: current + 1, total })}
        </Text>
        <Text style={styles.cookingStepText} testID="cooking-step">{steps[current]}</Text>
      </>
    );
    footer = (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={() => go(Math.max(current - 1, 0))}
          disabled={current === 0}
          style={({ pressed }) => [
            styles.choiceSecondary, styles.cookingBack,
            current === 0 && styles.cookingDisabled,
            pressed && { backgroundColor: colors.cardPressed },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          accessibilityState={{ disabled: current === 0 }}
        >
          <Text style={styles.choiceSecondaryText}>{t('back')}</Text>
        </Pressable>
        <Pressable
          onPress={() => (last ? setDone(true) : go(current + 1))}
          style={({ pressed }) => [styles.choicePrimary, styles.cookingNext, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={last ? t('finishCooking') : t('nextStep')}
        >
          <Text style={styles.choicePrimaryText}>{last ? t('finishCooking') : t('nextStep')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissOnDrag}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
      >
        <View style={styles.choiceContent}>{body}</View>
      </ScrollView>
      {/* The actions stay above the Home Indicator while long text scrolls, and above the keyboard while writing the note. */}
      <View style={[styles.cookingActions, { paddingBottom: Math.max(bottomInset, 12) + 4 }]}>
        <View style={{ flex: 1 }}>{footer}</View>
      </View>
    </KeyboardAvoidingView>
  );
}
