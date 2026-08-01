import { createContext, useContext } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
const theme = {
    mode: 'warm',
    colors: {
      bg: '#151311',
      surface: '#201e1b',
      accent: '#c8965c',
      accentSoft: '#d4a76a',
      textPrimary: '#e8e0d5',
      textSecondary: '#d4ccc0',
      textMuted: '#a09888',
    }
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
