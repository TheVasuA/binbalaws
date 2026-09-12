'use client';

import { useState, useEffect, useCallback } from 'react';

// Available themes. `swatch` is used to render the preview dot/gradient.
export const THEMES = [
  { id: 'midnight', name: 'Midnight', swatch: '#111827' },
  { id: 'slate', name: 'Slate', swatch: '#0f172a' },
  { id: 'ocean', name: 'Ocean', swatch: 'linear-gradient(135deg,#0b2540,#04101d)' },
  { id: 'forest', name: 'Forest', swatch: 'linear-gradient(135deg,#0c2a1f,#04120e)' },
  { id: 'grape', name: 'Grape', swatch: 'linear-gradient(135deg,#221540,#100a1e)' },
  { id: 'crimson', name: 'Crimson', swatch: 'linear-gradient(135deg,#3a1220,#17070d)' },
  { id: 'carbon', name: 'Carbon', swatch: '#000000' },
  { id: 'sand', name: 'Sand', swatch: 'linear-gradient(135deg,#2b2417,#12100a)' },
];

export const DEFAULT_THEME = 'midnight';
const STORAGE_KEY = 'app_theme';

export function applyTheme(themeId) {
  if (typeof document === 'undefined') return;
  const id = THEMES.some((t) => t.id === themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', id);
}

/**
 * Theme hook: persists the chosen theme in localStorage and applies it to
 * <html data-theme> so the CSS variables in globals.css take over.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  useEffect(() => {
    let saved = DEFAULT_THEME;
    try {
      saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(saved);
    applyTheme(saved);
  }, []);

  const setTheme = useCallback((id) => {
    setThemeState(id);
    applyTheme(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { /* ignore */ }
  }, []);

  return { theme, setTheme, themes: THEMES };
}
