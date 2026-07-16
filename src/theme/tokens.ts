export const Colors = {
  canvas: '#070B12',
  surface: '#0D131D',
  surfaceRaised: '#121A26',
  surfacePressed: '#182231',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#F4F7FB',
  textSecondary: '#A8B3C4',
  textMuted: '#6F7C91',
  brand: '#22D3A5',
  brandPressed: '#16B88D',
  brandSoft: 'rgba(34,211,165,0.12)',
  blue: '#5B9CFF',
  amber: '#F7B84B',
  red: '#F46F82',
  redSoft: 'rgba(244,111,130,0.12)',
  white: '#FFFFFF',
  black: '#06100D',
} as const;

export const Space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const Type = {
  display: 30,
  title: 22,
  headline: 17,
  body: 15,
  caption: 13,
  micro: 11,
} as const;

export const Elevation = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;
