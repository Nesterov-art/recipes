import type { ImageSourcePropType } from 'react-native';

import type { ResolvedThemeMode } from '@/constants/theme';

// Existing app icons: white book on dark for the dark theme, dark book on white for light.
export const APP_ICONS: Record<ResolvedThemeMode, ImageSourcePropType> = {
  dark: require('../../assets/icon.png'),
  light: require('../../assets/icon-light.png'),
};
