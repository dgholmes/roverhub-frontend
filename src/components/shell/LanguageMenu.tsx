import { Check, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { color, font } from '@/design-system/tokens'
import { LANGUAGES, setLanguage, type LanguageCode } from '@/i18n'

/** Language picker beside the theme switches. Each language is listed in its
 * own name, so it can be found from any current language. */
export function LanguageMenu() {
  const { t, i18n } = useTranslation()
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rh-icon-btn"
          aria-label={`${t('language.change')}: ${current.label}`}
          title={t('language.change')}
          style={{ width: 'auto', padding: '0 8px', gap: 4, display: 'inline-flex', alignItems: 'center', fontFamily: font.family, fontSize: font.size.sm, color: color.t2 }}
        >
          <Languages size={15} strokeWidth={1.75} aria-hidden />
          {current.code.toUpperCase()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1, minWidth: 160 }}>
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLanguage(l.code as LanguageCode)}
            lang={l.code}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: font.family, fontSize: font.size.md, cursor: 'pointer' }}
          >
            {l.label}
            {l.code === current.code && <Check size={14} aria-label="✓" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
