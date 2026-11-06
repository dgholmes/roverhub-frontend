import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, shadow, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'

type Tone = 'neutral' | 'accent' | 'green' | 'amber' | 'red' | 'blue'

/**
 * A short status chip whose explanation opens on demand, in place of a
 * sentence-long banner above a table. The chip says the state ("Scheduled runs
 * are off"); the ⓘ opens the why. Click or Enter opens it, Escape or a click
 * elsewhere closes it, and the text stays in the DOM for screen readers via
 * aria-describedby only while open.
 */
export function InfoChip({ label, tone = 'amber', children }: {
  label: string
  tone?: Tone
  /** The explanation. */
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Badge tone={tone}>{label}</Badge>
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-controls={id} aria-label={t('common.whyLabel', { label })}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
          background: open ? color.hover : 'transparent', border: 'none', borderRadius: radius.sm,
          color: color.t3, cursor: 'pointer', padding: 0,
        }}
      >
        <Info size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <span id={id} role="note" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: 340, maxWidth: '80vw',
          background: color.elevated, borderRadius: radius.lg, boxShadow: shadow.lg,
          padding: `${space[2]}px ${space[3]}px`, fontFamily: font.family,
          fontSize: font.size.sm, color: color.t2, lineHeight: 1.5, whiteSpace: 'normal',
        }}>
          {children}
        </span>
      )}
    </span>
  )
}
