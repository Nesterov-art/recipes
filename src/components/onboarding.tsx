import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OnboardingArt } from '@/components/choice-art';
import { MONOREC_THEMES } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding-context';
import { PaletteProvider, useSettings } from '@/context/settings-context';

// The three approved screens, ONB-01..03.
const steps = [
  { title: 'onboardingBookTitle', body: 'onboardingBookBody' },
  { title: 'onboardingChoiceTitle', body: 'onboardingChoiceBody' },
  { title: 'onboardingShoppingTitle', body: 'onboardingShoppingBody' },
] as const;

const PAGE_DURATION = 360;
const PAGE_EXIT_DURATION = 180;
const MOTION_CONFIG = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
const COLUMN_MAX_WIDTH = 520;
const SIDE_PADDING = 24;

function ProgressDot({
  active,
  activeColor,
  inactiveColor,
}: {
  active: boolean;
  activeColor: string;
  inactiveColor: string;
}) {
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, MOTION_CONFIG);
  }, [active, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: 6 + progress.value * 22,
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveColor, activeColor],
    ),
  }));

  return <Animated.View style={[styles.progressDot, animatedStyle]} />;
}

export function Onboarding() {
  return <PaletteProvider palette={MONOREC_THEMES}><OnboardingContent /></PaletteProvider>;
}

function OnboardingContent() {
  const { colors, fontScale, t } = useSettings();
  const { width, height } = useWindowDimensions();
  const compact = height < 740;
  const { complete } = useOnboarding();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const buttonScale = useSharedValue(1);
  const current = steps[step];
  const last = step === steps.length - 1;
  const fs = (size: number) => Math.round(size * fontScale);
  // The art takes what the text and the actions leave; a short screen scrolls instead
  // of cropping it, and large text never pushes the buttons off screen.
  const artWidth = Math.min(width, COLUMN_MAX_WIDTH) - SIDE_PADDING * 2;
  const artHeight = Math.round(Math.max(140, Math.min(compact ? height * 0.3 : height * 0.38, 360)));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  function changeStep(nextStep: number) {
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }

  function setButtonPressed(pressed: boolean) {
    buttonScale.set(withTiming(pressed ? 0.975 : 1, {
      duration: pressed ? 110 : 220,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    }));
  }

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0) return false;
      setDirection(-1);
      setStep(value => value - 1);
      return true;
    });
    return () => listener.remove();
  }, [step]);

  async function finish() {
    setSaving(true);
    setError(false);
    try { await complete(); }
    catch { setError(true); setSaving(false); }
  }

  const link = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      disabled={saving}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
    >
      <Text style={{ color: colors.muted, fontSize: fs(15), lineHeight: fs(20), textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.column} testID="onboarding">
        <View style={styles.header}>
          <Text style={{ color: colors.text, fontSize: fs(22), lineHeight: fs(28), fontWeight: '700', letterSpacing: -0.4 }}>monorec</Text>
          <Text style={{ color: colors.muted, fontSize: fs(14), lineHeight: fs(20), fontVariant: ['tabular-nums'] }} accessibilityElementsHidden importantForAccessibility="no">
            {step + 1} / {steps.length}
          </Text>
        </View>
        <View style={styles.pageFrame} collapsable={false}>
          <Animated.View
            key={step}
            entering={(direction === 1 ? FadeInRight : FadeInLeft)
              .duration(PAGE_DURATION)
              .easing(Easing.out(Easing.cubic))
              .reduceMotion(ReduceMotion.System)}
            exiting={FadeOut
              .duration(PAGE_EXIT_DURATION)
              .easing(Easing.out(Easing.quad))
              .reduceMotion(ReduceMotion.System)}
            style={styles.page}
          >
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.content, compact && { paddingVertical: 8, gap: 12 }]}
              showsVerticalScrollIndicator={false}
            >
              <OnboardingArt step={step} width={artWidth} height={artHeight} />
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text, fontSize: fs(compact ? 28 : 32), lineHeight: fs(compact ? 34 : 38) }]}>{t(current.title)}</Text>
              <Text style={[styles.body, { color: colors.muted, fontSize: fs(compact ? 15 : 16), lineHeight: fs(compact ? 22 : 24) }]}>{t(current.body)}</Text>
            </ScrollView>
          </Animated.View>
        </View>
        <View style={styles.footer}>
          <View style={styles.progress} accessibilityLabel={t('onboardingProgress', { current: step + 1, total: steps.length })}>
            {steps.map((_, index) => (
              <ProgressDot
                key={index}
                active={index === step}
                activeColor={colors.text}
                inactiveColor={colors.separator}
              />
            ))}
          </View>
          {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: fs(15), textAlign: 'center' }}>{t('onboardingSaveError')}</Text>}
          <Animated.View style={buttonAnimatedStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(last ? 'onboardingStart' : 'onboardingNext')}
              disabled={saving}
              onPress={() => last ? void finish() : changeStep(step + 1)}
              onPressIn={() => setButtonPressed(true)}
              onPressOut={() => setButtonPressed(false)}
              style={[styles.primary, { backgroundColor: colors.accent, opacity: saving ? 0.65 : 1 }]}
            >
              <Text style={{ color: colors.accentText, fontSize: fs(17), lineHeight: fs(22), fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>
                {t(last ? 'onboardingStart' : 'onboardingNext')}
              </Text>
            </Pressable>
          </Animated.View>
          {/* "Skip" as in the design; "Back" stays available from the second screen on. */}
          <View style={styles.links}>
            {step > 0 && link(t('back'), () => changeStep(step - 1))}
            {link(t('onboardingSkip'), () => void finish())}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: COLUMN_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: SIDE_PADDING },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingTop: 8 },
  pageFrame: { flex: 1, overflow: 'hidden' },
  page: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16, gap: 16 },
  title: { fontWeight: '700', textAlign: 'center', letterSpacing: -0.5 },
  body: { textAlign: 'center' },
  footer: { gap: 12, paddingTop: 8, paddingBottom: 8 },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingBottom: 6 },
  progressDot: { height: 6, borderRadius: 3 },
  primary: { flexDirection: 'row', gap: 8, minHeight: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  link: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 12 },
});
