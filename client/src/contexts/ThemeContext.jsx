import { createContext, useContext } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const theme = {
    mode: 'pro-dark',
    colors: {
      bg: '#080a0f',
      surface: '#0f141f',
      surfaceBorder: 'rgba(56, 189, 248, 0.15)',
      accent: '#0ea5e9',
      accentSoft: '#38bdf8',
      accentGlow: 'rgba(14, 165, 233, 0.25)',
      textPrimary: '#f8fafc',
      textSecondary: '#cbd5e1',
      textMuted: '#94a3b8',
      point: '#22c55e',
      fault: '#ef4444',
      positive: '#f59e0b',
    },
  };

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
