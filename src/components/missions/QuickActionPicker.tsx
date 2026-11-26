import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { moveLengthText, quickActionMoves, type QuickActionMove } from '@/missions/quickActions'

/** The amber "Needs clear space around the waypoint" line of an airborne move. */
export function ClearSpaceWarning() {
  const { t } = useTranslation()
  return (
    <span data-clear-space-warning="" style={{ display: 'flex', alignItems: 'center', gap: space[1], fontSize: font.size.sm, color: color.amber }}>
      <AlertTriangle size={13} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0 }} />
      {t('missions.actions.quick.clearSpace')}
    </span>
  )
}

/**
 * The Quick actions a waypoint can carry, as LiveOps' menu names them, each
 * with its length (a held move, Wave, lasts as long as the action says). Jump,
 * Backflip and Twirl Jump say they need clear space. A list of buttons rather
 * than a select, so the length and the warning are read before picking.
 */
export function QuickActionPicker({ value, onPick, label }: {
  /** The move already picked, if any. */
  value?: string | null
  onPick: (state: string) => void
  /** Names the list for assistive tech. */
  label: string
}) {
  const { t } = useTranslation()
  const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string
  const moves = quickActionMoves()
  const length = (m: QuickActionMove) => (m.kind === 'held' ? tx('missions.actions.quick.held') : moveLengthText(tx, m.seconds ?? 0))
  return (
    <div role="group" aria-label={label} data-quick-action-picker="" style={{ display: 'grid', gap: 2 }}>
      {moves.map((m) => {
        const on = m.state === value
        return (
          <button
            key={m.state} type="button" data-move={m.state} aria-pressed={on} onClick={() => onPick(m.state)}
            style={{
              display: 'grid', gap: 2, minHeight: 36, padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.sm, border: 'none',
              background: on ? color.accentDim : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: font.family,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: font.size.md, color: color.t1 }}>{m.label}</span>
              <span style={{ fontSize: font.size.sm, color: color.t3, whiteSpace: 'nowrap' }}>{length(m)}</span>
            </span>
            {m.airborne && <ClearSpaceWarning />}
          </button>
        )
      })}
    </div>
  )
}
