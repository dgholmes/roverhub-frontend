import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'rh-theme'

/** Strict on purpose: a loose `stored || 'dark'` fallback only catches the
 * empty string, so any other stray value would silently resolve to light. */
export function parseStoredTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'dark'
}

function readStoredTheme(): Theme {
  try {
    return parseStoredTheme(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    // Private windows and blocked site data throw on access.
    return 'dark'
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

interface ThemeState {
  theme: Theme
  toggle: () => void
}

/** Dark is the default: this is a field console, often used outdoors at dusk
 * or in a control room. Colours themselves live in design-system/theme.css;
 * this only flips the `data-theme` attribute that selects between them. */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: typeof window === 'undefined' ? 'dark' : readStoredTheme(),
  toggle: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* not persisted */ }
    set({ theme: next })
  },
}))

/** Call once before the first render so the page never paints in the wrong theme. */
export function initTheme() {
  // `?theme=light|dark` previews a theme without saving it — for screenshots
  // and shared review links.
  const override = new URLSearchParams(window.location.search).get('theme')
  if (override === 'light' || override === 'dark') useThemeStore.setState({ theme: override })
  applyTheme(useThemeStore.getState().theme)
}
