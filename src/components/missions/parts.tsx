import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { AlertTriangle, CircleCheck, CircleX, Info } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import type { MissionValidation, ValidationIssue } from '@/types'

export const inputStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: radius.sm, background: color.card,
  border: `1px solid ${color.border}`, color: color.t1, fontSize: font.size.md, fontFamily: font.family,
  minWidth: 0,
}

/** A label above its control. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: space[1], minWidth: 0 }}>
      <span style={{ fontSize: font.size.sm, color: color.t2 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  )
}

/** A checkbox with its sentence. */
export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.md, color: disabled ? color.t3 : color.t1, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: color.accent }} />
      {label}
    </label>
  )
}

/** Number input where empty means "not set" (null). */
export function NumberInput({ value, onChange, min, max, step, placeholder, width = 96, disabled }: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  width?: number
  disabled?: boolean
}) {
  return (
    <input
      type="number" inputMode="decimal" value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder} disabled={disabled}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={{ ...inputStyle, width }}
    />
  )
}

export function formatLength(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

export function formatDuration(s: number | null | undefined): string {
  if (s === null || s === undefined) return '—'
  const min = Math.max(1, Math.round(s / 60))
  return min < 60 ? i18n.t('missions.time.min', { n: min }) : i18n.t('missions.time.hmin', { h: Math.floor(min / 60), m: min % 60 })
}

/** One badge for a mission's checks: Ready, n warnings, or n problems.
 * `ready={false}` says the checks pass without claiming the mission can run
 * (the Program tab, when Run is disabled for another reason). */
export function ChecksBadge({ validation, ready = true }: { validation: MissionValidation | undefined; ready?: boolean }) {
  const { t } = useTranslation()
  if (!validation || validation.status === 'unvalidated') return <Badge>{t('missions.checks.unchecked')}</Badge>
  const errors = validation.issues.filter((i) => i.severity === 'error').length
  const warnings = validation.issues.filter((i) => i.severity === 'warning').length
  if (errors) return <Badge tone="red">{t('missions.checks.problems', { count: errors })}</Badge>
  if (warnings) return <Badge tone="amber">{t('missions.checks.warnings', { count: warnings })}</Badge>
  if (!ready) return <Badge>{t('missions.checks.passed')}</Badge>
  return <Badge tone="green">{t('missions.checks.ready')}</Badge>
}

const ICON = { error: CircleX, warning: AlertTriangle, info: Info } as const
const TONE = { error: color.red, warning: color.amber, info: color.t2 } as const

/** Issues as a list; clicking one with a waypoint selects that waypoint. */
export function IssueList({ issues, onSelectWaypoint, hideWhenEmpty }: { issues: ValidationIssue[]; onSelectWaypoint?: (id: string) => void; hideWhenEmpty?: boolean }) {
  const { t } = useTranslation()
  if (issues.length === 0 && hideWhenEmpty) return null
  if (issues.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.md, color: color.green }}>
        <CircleCheck size={15} strokeWidth={1.75} aria-hidden /> {t('missions.checks.allClear')}
      </div>
    )
  }
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1] }}>
      {issues.map((i, n) => {
        const Icon = ICON[i.severity]
        const clickable = i.waypoint_id && onSelectWaypoint
        return (
          <li key={n}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelectWaypoint!(i.waypoint_id!)}
              style={{
                display: 'flex', gap: space[2], alignItems: 'flex-start', width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', padding: `${space[1]}px 0`, color: color.t1,
                fontSize: font.size.sm, fontFamily: font.family, lineHeight: 1.45, cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <Icon size={14} strokeWidth={1.75} color={TONE[i.severity]} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{i.message}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
