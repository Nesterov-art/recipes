import { type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useSettings } from '@/context/settings-context';
import choiceOrbit from '@/illustrations/choice-orbit';
import choiceOrbitLight from '@/illustrations/choice-orbit-light';
import chooseWhatToCook from '@/illustrations/choose-what-to-cook';
import chooseWhatToCookLight from '@/illustrations/choose-what-to-cook-light';
import emptyState from '@/illustrations/empty-state';
import emptyStateLight from '@/illustrations/empty-state-light';
import onboarding01 from '@/illustrations/onboarding-01-recipes';
import onboarding01Light from '@/illustrations/onboarding-01-recipes-light';
import onboarding02 from '@/illustrations/onboarding-02-discovery';
import onboarding02Light from '@/illustrations/onboarding-02-discovery-light';
import onboarding03 from '@/illustrations/onboarding-03-shopping';
import onboarding03Light from '@/illustrations/onboarding-03-shopping-light';
import stepByStepCooking from '@/illustrations/step-by-step-cooking';
import stepByStepCookingLight from '@/illustrations/step-by-step-cooking-light';

// Text colours on the art card, per theme. The card itself is the plain theme card.
const DARK_ART = {
  text: '#F6F4F5',
  muted: '#BEB5BD',
  label: '#FFFFFF',
  warm: '#E3B58D',
};
const LIGHT_ART = {
  text: '#171717',
  muted: '#65656B',
  label: '#8C6B7E',
  warm: '#B5652F',
};

export function useArt() {
  return useSettings().resolvedTheme === 'dark' ? DARK_ART : LIGHT_ART;
}

/** Art card of the Choice screens: the plain card of the theme, one solid colour. */
export function ArtCard({ style, children }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useSettings();
  return <View style={[styles.card, { backgroundColor: colors.card }, style]}>{children}</View>;
}

/** The orbit with a plate of the Choice screens (viewBox 559 × 531), per theme. Decorative. */
export function OrbitArt({ height }: { height: number }) {
  const { resolvedTheme } = useSettings();
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SvgXml xml={resolvedTheme === 'dark' ? choiceOrbit : choiceOrbitLight} width={(height * 559) / 531} height={height} />
    </View>
  );
}

/**
 * CHOICE-01, the original "Что приготовить?" illustration (viewBox 768 × 990), drawn
 * straight on the card surface: the original dark-theme drawing, or its light variant
 * with dark outlines. Neither has a background of its own. Decorative.
 */
export function ChooseWhatToCookArt({ height }: { height: number }) {
  const { resolvedTheme } = useSettings();
  return (
    <View style={{ height, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SvgXml xml={resolvedTheme === 'dark' ? chooseWhatToCook : chooseWhatToCookLight} height={height} width={(height * 768) / 990} />
    </View>
  );
}

// ONB-01..03 per theme with their viewBox proportions (width / height).
const ONBOARDING_ART = [
  { dark: onboarding01, light: onboarding01Light, ratio: 768 / 990 },
  { dark: onboarding02, light: onboarding02Light, ratio: 768 / 990 },
  { dark: onboarding03, light: onboarding03Light, ratio: 1 },
] as const;

/**
 * ONB-01..03, the onboarding illustrations, drawn straight on the screen: the original
 * dark drawing or its light variant. The art fits a width × height box at its own
 * proportions, so it is never cropped. Decorative.
 */
export function OnboardingArt({ step, width, height }: { step: number; width: number; height: number }) {
  const { resolvedTheme } = useSettings();
  const art = ONBOARDING_ART[step];
  const artHeight = Math.min(height, width / art.ratio);
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SvgXml xml={resolvedTheme === 'dark' ? art.dark : art.light} height={artHeight} width={artHeight * art.ratio} />
    </View>
  );
}

/** EMPTY-01, the empty recipe book (viewBox 720 × 720), per theme like CHOICE-01. Decorative. */
export function EmptyStateArt({ height }: { height: number }) {
  const { resolvedTheme } = useSettings();
  return (
    <View style={{ height, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SvgXml xml={resolvedTheme === 'dark' ? emptyState : emptyStateLight} height={height} width={height} />
    </View>
  );
}

/** COOK-01, the open recipe book of step-by-step cooking (viewBox 800 × 800), per theme like CHOICE-01. Decorative. */
export function StepByStepCookingArt({ height }: { height: number }) {
  const { resolvedTheme } = useSettings();
  return (
    <View style={{ height, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SvgXml xml={resolvedTheme === 'dark' ? stepByStepCooking : stepByStepCookingLight} height={height} width={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 24,
    padding: 20,
  },
});
