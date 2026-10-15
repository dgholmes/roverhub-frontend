import { create } from 'zustand'

export type Theme = 'dark' | 'light'
/** Both accents are kept as a per-user preference (decided 2026-10-15),
 * chosen under Settings > Your preferences. Defined in design-system/theme.css. */
export type Accent = 'blue' | 'lime'

const THEME_KEY = 'rh-theme'
const ACCENT_KEY = 'rh-accent'

/** Strict on purpose: a loose `stored || 'dark'` fallback only catches the
 * empty string, so any other stray value would silently resolve to light. */
export function parseStoredTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'dark'
}

export function parseStoredAccent(value: string | null): Accent {
  return value === 'lime' || value === 'blue' ? value : 'blue'
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Private windows and blocked site data throw on access.
    return null
  }
}

function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* not persisted */ }
}

function apply(theme: Theme, accent: Accent) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.setAttribute('data-accent', accent)
}

interface ThemeState {
  theme: Theme
  accent: Accent
  toggle: () => void
  toggleAccent: () => void
  setTheme: (theme: Theme) => void
  setAccent: (accent: Accent) => void
}

/** Dark is the default: this is a field console, often used outdoors at dusk
 * or in a control room. Colours themselves live in design-system/theme.css;
 * this only flips the attributes that select between them. */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: typeof window === 'undefined' ? 'dark' : parseStoredTheme(read(THEME_KEY)),
  accent: typeof window === 'undefined' ? 'blue' : parseStoredAccent(read(ACCENT_KEY)),
  toggle: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    apply(theme, get().accent)
    write(THEME_KEY, theme)
    set({ theme })
  },
  setTheme: (theme) => {
    apply(theme, get().accent)
    write(THEME_KEY, theme)
    set({ theme })
  },
  setAccent: (accent) => {
    apply(get().theme, accent)
    write(ACCENT_KEY, accent)
    set({ accent })
  },
  toggleAccent: () => {
    const accent: Accent = get().accent === 'blue' ? 'lime' : 'blue'
    apply(get().theme, accent)
    write(ACCENT_KEY, accent)
    set({ accent })
  },
}))

/** Call once before the first render so the page never paints in the wrong theme.
 * `?theme=light|dark` and `?accent=blue|lime` preview without saving — for
 * screenshots and shared review links. Build-time defaults come from
 * VITE_DEFAULT_ACCENT so a review build can open on either accent. */
export function initTheme() {
  const params = new URLSearchParams(window.location.search)
  const theme = params.get('theme')
  if (theme === 'light' || theme === 'dark') useThemeStore.setState({ theme })
  const accent = params.get('accent') ?? (read(ACCENT_KEY) === null ? import.meta.env.VITE_DEFAULT_ACCENT : null)
  if (accent === 'lime' || accent === 'blue') useThemeStore.setState({ accent })
  const s = useThemeStore.getState()
  apply(s.theme, s.accent)
}
