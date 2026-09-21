import { createContext, useContext, useEffect, type ReactNode } from 'react';
import * as SystemUI from 'expo-system-ui';
import { peekSettings, useSettings } from '../settings/store';
import { palettes, type Appearance, type Palette } from './theme';

const ThemeContext = createContext<Palette>(palettes.dark);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings] = useSettings();
  const appearance: Appearance = settings.appearance === 'light' ? 'light' : 'dark';
  const palette = palettes[appearance];

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.bg);
  }, [palette.bg]);

  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Palette {
  return useContext(ThemeContext);
}

export function peekPalette(): Palette {
  const appearance = peekSettings().appearance === 'light' ? 'light' : 'dark';
  return palettes[appearance];
}
