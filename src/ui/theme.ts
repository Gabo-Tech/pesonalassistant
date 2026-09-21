export const theme = {
  bg: '#0B1020',
  surface: '#151B2E',
  surfaceAlt: '#1E263D',
  border: '#2A3350',
  text: '#F2F4FF',
  textDim: '#9AA3C0',
  accent: '#7C5CFF',
  accentDim: '#5B43C0',
  good: '#3FD68C',
  warn: '#FFC857',
  bad: '#FF6B6B',
  radius: 14,
} as const;

/** Visual state of the assistant orb, mirrored from the voice session machine. */
export const orbColor = {
  off: theme.border,
  idle: theme.accentDim,
  listening: theme.accent,
  thinking: theme.warn,
  speaking: theme.good,
  confirming: theme.warn,
} as const;
