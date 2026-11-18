// Choice light / dark / system (SPEC_ETAPPE2 chapter 1.3). No DOM access.
// Only the choice is remembered in localStorage, never a model.

export const THEMES = ['light', 'dark', 'system'];
export const DEFAULT_THEME = 'system';
export const THEME_STORAGE_KEY = 'groundslide.theme';

/** Stored choice, or "system" when nothing valid is stored. */
export function loadTheme(storage) {
  try {
    const stored = storage ? storage.getItem(THEME_STORAGE_KEY) : null;
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Remember the choice. */
export function saveTheme(storage, theme) {
  if (!THEMES.includes(theme)) return;
  try {
    if (storage) storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage may be unavailable (private mode); the choice then lasts for the session only
  }
}
