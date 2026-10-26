import { useId, type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';

import { useSettings } from '@/context/settings-context';
import choiceOrbit from '@/illustrations/choice-orbit';
import choiceOrbitLight from '@/illustrations/choice-orbit-light';
import chooseWhatToCook from '@/illustrations/choose-what-to-cook';
import chooseWhatToCookLight from '@/illustrations/choose-what-to-cook-light';
import stepByStepCooking from '@/illustrations/step-by-step-cooking';
import stepByStepCookingLight from '@/illustrations/step-by-step-cooking-light';

// Dark theme: the art card keeps the dark radial surface of design spec 3.1.
// Light theme: art sits on the ordinary light card, like the light illustrations.
const DARK_ART = {
  border: '#493744',
  text: '#F6F4F5',
  muted: '#BEB5BD',
  label: '#C8A8B9',
  warm: '#E3B58D',
};
const LIGHT_ART = {
  border: 'transparent',
  text: '#171717',
  muted: '#65656B',
  label: '#8C6B7E',
  warm: '#B5652F',
};

export function useArt() {
  return useSettings().resolvedTheme === 'dark' ? DARK_ART : LIGHT_ART;
}

// SVG ids must be unique per instance, and useId() returns colons.
function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Art card of the Choice screens: dark radial surface, or the plain light card. */
export function ArtCard({ style, children }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const id = useSvgId('art');
  const { colors, resolvedTheme } = useSettings();
  if (resolvedTheme !== 'dark') {
    return <View style={[styles.card, { borderWidth: 0, backgroundColor: colors.card }, style]}>{children}</View>;
  }
  return (
    <View style={[styles.card, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="45%" rx="65%" ry="60%">
            <Stop offset="0" stopColor="#34222D" />
            <Stop offset="0.48" stopColor="#231B24" />
            <Stop offset="1" stopColor="#1B191F" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/** The orbit with a plate of the Choice screens (viewBox 629 × 564), per theme. Decorative. */
export function OrbitArt({ height }: { height: number }) {
  const { resolvedTheme } = useSettings();
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <SvgXml xml={resolvedTheme === 'dark' ? choiceOrbit : choiceOrbitLight} width={(height * 629) / 564} height={height} />
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DARK_ART.border,
    backgroundColor: '#1B191F',
    padding: 20,
  },
});
