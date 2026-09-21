export type Appearance = 'dark' | 'light';

export type Palette = {
  bg: string;
  surface: string;
  ink: string;
  dim: string;
  line: string;
  inverse: string;
  inverseInk: string;
  good: string;
  bad: string;
  radius: number;
  radiusChip: number;
};

export const darkPalette: Palette = {
  bg: '#0C0C0C',
  surface: '#161616',
  ink: '#F4F1EA',
  dim: '#8A8680',
  line: '#2C2C2C',
  inverse: '#F4F1EA',
  inverseInk: '#0C0C0C',
  good: '#D8D8D8',
  bad: '#5A5A5A',
  radius: 20,
  radiusChip: 12,
};

export const lightPalette: Palette = {
  bg: '#F6F3EE',
  surface: '#FFFFFF',
  ink: '#171717',
  dim: '#6F6B66',
  line: '#E4DFD6',
  inverse: '#171717',
  inverseInk: '#F6F3EE',
  good: '#171717',
  bad: '#6F6B66',
  radius: 20,
  radiusChip: 12,
};

export const palettes: Record<Appearance, Palette> = {
  dark: darkPalette,
  light: lightPalette,
};

export type OrbKind = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking' | 'confirming';

/** Grayscale state: empty ring vs ink fill. No hue. */
export function orbInk(palette: Palette, state: OrbKind): { ring: string; fill: string | null } {
  switch (state) {
    case 'listening':
    case 'speaking':
      return { ring: palette.ink, fill: palette.ink };
    case 'thinking':
    case 'confirming':
      return { ring: palette.ink, fill: palette.dim };
    case 'idle':
      return { ring: palette.dim, fill: null };
    default:
      return { ring: palette.line, fill: null };
  }
}
