'use client';

import { useState, useEffect, useCallback } from 'react';

// Available themes. `swatch` is used to render the preview dot/gradient.
export const THEMES = [
  // Dark themes
  { id: 'midnight', name: 'Midnight', swatch: '#111827' },
  { id: 'slate', name: 'Slate', swatch: '#0f172a' },
  { id: 'ocean', name: 'Ocean', swatch: 'linear-gradient(135deg,#0b2540,#04101d)' },
  { id: 'forest', name: 'Forest', swatch: 'linear-gradient(135deg,#0c2a1f,#04120e)' },
  { id: 'grape', name: 'Grape', swatch: 'linear-gradient(135deg,#221540,#100a1e)' },
  { id: 'crimson', name: 'Crimson', swatch: 'linear-gradient(135deg,#3a1220,#17070d)' },
  { id: 'carbon', name: 'Carbon', swatch: '#000000' },
  { id: 'sand', name: 'Sand', swatch: 'linear-gradient(135deg,#2b2417,#12100a)' },
  { id: 'teal', name: 'Teal', swatch: 'linear-gradient(135deg,#0c2f2f,#041414)' },
  { id: 'rose', name: 'Rose', swatch: 'linear-gradient(135deg,#3a1530,#180a14)' },
  // Light themes
  { id: 'light', name: 'Light', swatch: '#f3f4f6' },
  { id: 'paper', name: 'Paper', swatch: '#faf7f0' },
];

export const DEFAULT_THEME = 'midnight';
const STORAGE_KEY = 'app_theme';
const WALLPAPER_KEY = 'app_wallpaper';      // stores the image URL ('' = none)
const WALLPAPER_OPACITY_KEY = 'app_wallpaper_opacity'; // 0..100

export function applyTheme(themeId) {
  if (typeof document === 'undefined') return;
  const id = THEMES.some((t) => t.id === themeId) ? themeId : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', id);
}

// Apply the wallpaper as CSS variables consumed by the fixed background layer.
export function applyWallpaper(url, opacity) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--wallpaper-url', url ? `url("${url}")` : 'none');
  root.style.setProperty('--wallpaper-opacity', String((Number(opacity) || 0) / 100));
}

/**
 * Wallpaper hook: persists the chosen wallpaper URL + opacity and applies them
 * to the fixed background layer via CSS variables.
 */
export function useWallpaper() {
  const [wallpaper, setWallpaperState] = useState('');
  const [opacity, setOpacityState] = useState(15);

  useEffect(() => {
    let url = '';
    let op = 15;
    try {
      url = localStorage.getItem(WALLPAPER_KEY) || '';
      const savedOp = localStorage.getItem(WALLPAPER_OPACITY_KEY);
      if (savedOp !== null) op = Number(savedOp);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWallpaperState(url);
    setOpacityState(op);
    applyWallpaper(url, op);
  }, []);

  const setWallpaper = useCallback((url) => {
    setWallpaperState(url);
    try { localStorage.setItem(WALLPAPER_KEY, url || ''); } catch { /* ignore */ }
    setOpacityState((op) => { applyWallpaper(url, op); return op; });
  }, []);

  const setOpacity = useCallback((op) => {
    const val = Number(op) || 0;
    setOpacityState(val);
    try { localStorage.setItem(WALLPAPER_OPACITY_KEY, String(val)); } catch { /* ignore */ }
    setWallpaperState((url) => { applyWallpaper(url, val); return url; });
  }, []);

  return { wallpaper, opacity, setWallpaper, setOpacity };
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
