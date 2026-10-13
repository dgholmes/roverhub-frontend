import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { ko } from './locales/ko'

/**
 * Localisation, on i18next + react-i18next.
 *
 * Adding a language:
 *   1. Copy locales/ko.ts to locales/<code>.ts and translate every string.
 *      Type it as `Translation` and the compiler lists anything missing.
 *   2. Add it to RESOURCES and LANGUAGES below.
 *   3. Run `npm test`: i18n.test.ts checks every locale has every key.
 *
 * In components: `const { t } = useTranslation()` then `t('fleet.inspector.getUp')`.
 * Keys are typed from en.ts (see i18next.d.ts), so a typo fails the build.
 * Dates and numbers go through `formatLocale()`, not a hardcoded locale.
 */
export const RESOURCES = {
  en: { translation: en },
  ko: { translation: ko },
} as const

export type LanguageCode = keyof typeof RESOURCES

/** Shown in the language menu in each language's own name, so someone who
 * can't read the current language can still find theirs. */
export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
]

const STORAGE_KEY = 'rh.lang'

function isLanguage(v: unknown): v is LanguageCode {
  return typeof v === 'string' && v in RESOURCES
}

/** The saved choice, else the browser's language if we have it, else English. */
export function initialLanguage(saved: string | null, browser: readonly string[]): LanguageCode {
  if (isLanguage(saved)) return saved
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLanguage(base)) return base
  }
  return 'en'
}

function readSaved(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

const browserLanguages = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])

void i18n.use(initReactI18next).init({
  resources: RESOURCES,
  // Tests always run in English, whatever the machine's language, so their
  // expectations don't depend on where they run.
  lng: import.meta.env.MODE === 'test' ? 'en' : initialLanguage(readSaved(), browserLanguages),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes already
  returnNull: false,
})

function applyDocumentLanguage(lng: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
applyDocumentLanguage(i18n.language)
i18n.on('languageChanged', applyDocumentLanguage)

export function setLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code)
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* per-viewer convenience only */ }
}

/** The BCP 47 locale for Intl date and number formatting. */
export function formatLocale(): string {
  return i18n.language === 'ko' ? 'ko-KR' : 'en-GB'
}

export default i18n
