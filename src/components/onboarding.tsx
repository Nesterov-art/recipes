import { Ionicons } from '@expo/vector-icons';
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

import { useOnboarding } from '@/context/onboarding-context';
import { useSettings } from '@/context/settings-context';

const steps = [
  { icon: 'book-outline', title: 'onboardingBookTitle', body: 'onboardingBookBody', hint: 'onboardingBookHint' },
  { icon: 'basket-outline', title: 'onboardingShoppingTitle', body: 'onboardingShoppingBody', hint: 'onboardingShoppingHint' },
  { icon: 'phone-portrait-outline', title: 'onboardingStorageTitle', body: 'onboardingStorageBody', hint: 'onboardingStorageHint' },
] as const;

const PAGE_DURATION = 360;
const PAGE_EXIT_DURATION = 180;
const MOTION_CONFIG = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

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
  const { colors, fontScale, t } = useSettings();
  const { height } = useWindowDimensions();
  const compact = height < 740;
  const { complete } = useOnboarding();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const buttonScale = useSharedValue(1);
  const current = steps[step];
  const fs = (size: number) => Math.round(size * fontScale);

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={styles.column} testID="onboarding">
        <View style={styles.header}>
          <Text style={{ color: colors.muted, fontSize: fs(15) }}>{t('appTitle')}</Text>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void finish()} style={styles.smallButton}>
            <Text style={{ color: colors.text, fontSize: fs(16) }}>{t('onboardingSkip')}</Text>
          </Pressable>
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
              contentContainerStyle={[styles.content, compact && { paddingVertical: 12, gap: 16 }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.illustration, compact && { width: 96, height: 96, borderRadius: 28, marginBottom: 0 }, { backgroundColor: colors.card }]} accessible={false}>
                <Ionicons name={current.icon} size={compact ? 56 : 88} color={colors.text} />
              </View>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text, fontSize: fs(compact ? 28 : 32) }]}>{t(current.title)}</Text>
              <Text style={[styles.body, { color: colors.text, fontSize: fs(compact ? 16 : 18), lineHeight: fs(compact ? 24 : 27) }]}>{t(current.body)}</Text>
              <View style={[styles.note, compact && { padding: 14 }, { backgroundColor: colors.card }]}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.text} />
                <Text style={{ color: colors.muted, fontSize: fs(compact ? 14 : 15), lineHeight: fs(compact ? 20 : 22), flex: 1 }}>{t(current.hint)}</Text>
              </View>
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
          {error && <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: fs(15) }}>{t('onboardingSaveError')}</Text>}
          <Animated.View style={buttonAnimatedStyle}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => step === steps.length - 1 ? void finish() : changeStep(step + 1)}
              onPressIn={() => setButtonPressed(true)}
              onPressOut={() => setButtonPressed(false)}
              style={[styles.primary, { backgroundColor: colors.accent, opacity: saving ? 0.65 : 1 }]}
            >
              <Text style={{ color: colors.accentText, fontSize: fs(17), fontWeight: '600' }}>{t(step === steps.length - 1 ? 'onboardingStart' : 'onboardingNext')}</Text>
            </Pressable>
          </Animated.View>
          {step > 0 && <Pressable accessibilityRole="button" disabled={saving} onPress={() => changeStep(step - 1)} style={styles.smallButton}>
            <Text style={{ color: colors.muted, fontSize: fs(16), textAlign: 'center' }}>{t('back')}</Text>
          </Pressable>}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  pageFrame: { flex: 1, overflow: 'hidden' },
  page: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 28, gap: 24 },
  illustration: { width: 156, height: 156, borderRadius: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { fontWeight: '700', textAlign: 'center', letterSpacing: -0.7 },
  body: { textAlign: 'center' },
  note: { flexDirection: 'row', gap: 12, borderRadius: 20, padding: 18, alignItems: 'center' },
  footer: { gap: 14, paddingTop: 8, paddingBottom: 16 },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingBottom: 10 },
  progressDot: { height: 6, borderRadius: 3 },
  primary: { minHeight: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
