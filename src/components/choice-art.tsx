import { useId, type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';

import { useSettings } from '@/context/settings-context';
import chooseWhatToCook from '@/illustrations/choose-what-to-cook';
import chooseWhatToCookLight from '@/illustrations/choose-what-to-cook-light';

// Dark theme: the art card keeps the dark radial surface of design spec 3.1.
// Light theme: art sits on the ordinary light card, like the light illustrations.
const DARK_ART = {
  border: '#493744',
  text: '#F6F4F5',
  muted: '#BEB5BD',
  label: '#C8A8B9',
  warm: '#E3B58D',
  orbit: { glow: '#8f4e41', glowOpacity: 0.65, ring1: '#a77a92', ring2: '#d99c74', core: '#efb584', dot: '#edb68e', spark1: '#efac73', spark2: '#c6a0b3' },
};
const LIGHT_ART = {
  border: 'transparent',
  text: '#171717',
  muted: '#65656B',
  label: '#8C6B7E',
  warm: '#B5652F',
  // The orange and purple of the light illustrations (onboarding, empty state).
  orbit: { glow: '#F5A35B', glowOpacity: 0.45, ring1: '#9B5FC0', ring2: '#D87637', core: '#D87637', dot: '#F4A967', spark1: '#D87637', spark2: '#9B5FC0' },
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

/** The approved Monorec 3.1 orbit composition (viewBox 280 × 220). Decorative. */
export function OrbitArt({ height }: { height: number }) {
  const id = useSvgId('orbit');
  const { orbit } = useArt();
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Svg width="100%" height="100%" viewBox="0 0 280 220" style={{ maxWidth: 300 }}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={orbit.glow} stopOpacity={orbit.glowOpacity} />
            <Stop offset="1" stopColor={orbit.glow} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={140} cy={108} r={91} fill={`url(#${id})`} />
        <Ellipse cx={140} cy={110} rx={105} ry={58} fill="none" stroke={orbit.ring1} strokeWidth={1.2} transform="rotate(-33 140 110)" />
        <Ellipse cx={140} cy={110} rx={74} ry={91} fill="none" stroke={orbit.ring2} strokeWidth={1} transform="rotate(33 140 110)" />
        <Circle cx={140} cy={110} r={29} fill="none" stroke={orbit.core} strokeWidth={1.2} />
        <Circle cx={140} cy={110} r={7} fill={orbit.dot} />
        <Circle cx={213} cy={67} r={3} fill={orbit.spark1} />
        <Circle cx={75} cy={182} r={2} fill={orbit.spark2} />
      </Svg>
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
