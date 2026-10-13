import 'i18next'
import type { en } from './locales/en'

// Types t() keys from the English dictionary, so a key that doesn't exist
// fails `tsc -b` instead of rendering the raw key at runtime.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}
