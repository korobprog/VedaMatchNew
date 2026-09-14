import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './tokens';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: Palette;
}

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: light });

/**
 * Пока тема следует системе. Переключатель на три состояния, как на сайте,
 * появится вместе с настройками профиля.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const value: Theme = { scheme, colors: scheme === 'dark' ? dark : light };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
