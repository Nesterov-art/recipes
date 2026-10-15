export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedThemeMode = Exclude<ThemeMode, 'system'>;

export type AppColors = {
  bg: string;
  card: string;
  cardPressed: string;
  separator: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  danger: string;
  success: string;
  secondaryBorder: string;
  fadeEnd: string;
};

export const THEMES: Record<ResolvedThemeMode, AppColors> = {
  dark: {
    bg: '#000000', card: '#1C1C1E', cardPressed: '#2C2C2E', separator: '#38383A',
    text: '#FFFFFF', muted: '#8E8E93', accent: '#FFFFFF', accentText: '#000000',
    danger: '#FF453A', success: '#30D158', secondaryBorder: 'rgba(255,255,255,0.12)', fadeEnd: 'rgba(0,0,0,0.94)',
  },
  light: {
    bg: '#F2F2F7', card: '#FFFFFF', cardPressed: '#E5E5EA', separator: '#D1D1D6',
    text: '#111111', muted: '#6C6C70', accent: '#111111', accentText: '#FFFFFF',
    danger: '#D70015', success: '#248A3D', secondaryBorder: 'rgba(0,0,0,0.08)', fadeEnd: 'rgba(242,242,247,0.96)',
  },
};
