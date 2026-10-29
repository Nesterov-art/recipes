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

// Approved Monorec palette (docs/design/design-guide.md, section 4). Screens adopt
// it one redesign pass at a time through PaletteProvider; THEMES stays the default.
export const MONOREC_THEMES: Record<ResolvedThemeMode, AppColors> = {
  dark: {
    bg: '#0B0B0C', card: '#1C1C1E', cardPressed: '#2C2C2E', separator: '#38383A',
    text: '#F5F5F7', muted: '#A0A0A6', accent: '#FFFFFF', accentText: '#000000',
    danger: '#FF6961', success: '#73C995', secondaryBorder: 'rgba(255,255,255,0.12)', fadeEnd: 'rgba(11,11,12,0.94)',
  },
  light: {
    bg: '#F5F4F0', card: '#FFFFFF', cardPressed: '#E9E8E4', separator: '#DEDDD8',
    text: '#171717', muted: '#65656B', accent: '#000000', accentText: '#FFFFFF',
    danger: '#B42318', success: '#246B45', secondaryBorder: 'rgba(0,0,0,0.08)', fadeEnd: 'rgba(245,244,240,0.96)',
  },
};

// Settings, Backups and About: neutral grey screens under white (or raised dark) cards, so
// each group reads as a card without borders or shadows. Accent and status colours stay
// Monorec's. Light muted is #6B6B6B rather than #737373 to keep 4.5:1 on the grey screen.
export const SETTINGS_THEMES: Record<ResolvedThemeMode, AppColors> = {
  dark: {
    ...MONOREC_THEMES.dark,
    bg: '#191919', card: '#272727', cardPressed: '#333333', separator: '#404040',
    text: '#FAFAFA', muted: '#A1A1A1', fadeEnd: 'rgba(25,25,25,0.94)',
  },
  light: {
    ...MONOREC_THEMES.light,
    bg: '#F2F2F2', card: '#FFFFFF', cardPressed: '#EBEBEB', separator: '#E8E8E8',
    text: '#171717', muted: '#6B6B6B', fadeEnd: 'rgba(242,242,242,0.96)',
  },
};
