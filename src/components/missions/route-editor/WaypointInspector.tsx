import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import type { MissionWaypoint, WaypointActionType } from '@/types'

/** The action menu is a UI concern and is deliberately wider than the wire
 * contract. PRD MIS-007 defers thermal scan to R2, §604 requires it to stay
 * listed rather than vanish, and MIS-008 requires unavailable actions to be
 * disabled and explained — so the menu carries an entry `WaypointActionType`
 * does not admit. It can be shown and explained; it can never be attached to
 * a waypoint. */
type ActionMenuEntry =
  | { type: WaypointActionType; available: true }
  | { type: 'thermal_scan'; available: false; because: 'thermalUnavailable' }

// Labels come from missions.actions.<type>; `because` names a
// missions.inspector.* key.
const ACTION_TYPES: ActionMenuEntry[] = [
  { type: 'snapshot', available: true },
  { type: 'thermal_scan', available: false, because: 'thermalUnavailable' },
  { type: 'voice_prompt', available: true },
  { type: 'led_signal', available: true },
  { type: 'wait', available: true },
  { type: 'operator_approval', available: true },
  { type: 'return_to_dock', available: true },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

/** Selected-waypoint editor (docs/05-ui-ux.md §11.3). Coordinates shown as
 * `estimated` like every other position readout in this app (§7.1) — planning
 * happens on the same dead-reckoned ground plane LiveOps uses, no absolute
 * positioning exists yet. */
export function WaypointInspector({
  waypoint, index, total, onUpdate, onRemove,
}: {
  waypoint: MissionWaypoint
  index: number
  total: number
  onUpdate: (patch: Partial<MissionWaypoint>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  function toggleAction(type: WaypointActionType, label: string) {
    const has = waypoint.actions.some((a) => a.type === type)
    onUpdate({
      actions: has
        ? waypoint.actions.filter((a) => a.type !== type)
        : [...waypoint.actions, { type, label, params: {} }],
    })
  }

  return (
    <div style={{
      width: 280, flexShrink: 0, borderLeft: `1px solid ${color.border}`, background: color.surface,
      padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3], overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.inspector.position', { n: index + 1, total })}</span>
        <button onClick={onRemove} aria-label={t('missions.inspector.remove')} style={{ background: 'transparent', border: 'none', color: color.red, cursor: 'pointer', padding: 4 }}>
          <Trash2 size={14} />
        </button>
      </div>

      <Field label={t('missions.inspector.label')}>
        <input
          value={waypoint.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: radius.sm, background: color.card,
            border: `1px solid ${color.border}`, color: color.t1, fontSize: font.size.sm, fontFamily: font.family,
          }}
        />
      </Field>

      <Field label={t('missions.inspector.coordinates')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.sm, color: color.t1, fontWeight: font.weight.semibold }}>
            {waypoint.x_m.toFixed(1)}, {waypoint.y_m.toFixed(1)} m
          </span>
          <EstimatedBadge compact quality="estimated" />
        </div>
      </Field>

      <Field label={t('missions.inspector.actionsOnArrival')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ACTION_TYPES.map((entry) => {
            if (!entry.available) {
              return (
                <button
                  key={entry.type}
                  disabled
                  title={t(`missions.inspector.${entry.because}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    padding: '6px 8px', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                    background: 'transparent', border: `1px solid ${color.border}`,
                    color: color.t3, cursor: 'not-allowed', opacity: 0.6,
                  }}
                >
                  {t(`missions.actions.${entry.type}`)}
                </button>
              )
            }
            const { type } = entry
            const label = t(`missions.actions.${type}`)
            const active = waypoint.actions.some((a) => a.type === type)
            return (
              <button
                key={type}
                onClick={() => toggleAction(type, label)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  padding: '6px 8px', borderRadius: radius.sm, fontSize: font.size.sm, fontFamily: font.family,
                  background: active ? color.accentDim : 'transparent',
                  border: `1px solid ${active ? color.accentBorder : color.border}`,
                  color: active ? color.accent : color.t2, cursor: 'pointer',
                }}
              >
                {label}
                {active && '✓'}
              </button>
            )
          })}
        </div>
      </Field>

      <div style={{ fontSize: font.size.xs, color: color.t3 }}>
        {t('missions.inspector.hint')}
      </div>
    </div>
  )
}
