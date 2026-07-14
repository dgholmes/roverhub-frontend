import { Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import type { MissionWaypoint, WaypointAction } from '@/types'

const ACTION_TYPES: { type: WaypointAction['type']; label: string }[] = [
  { type: 'camera_snapshot', label: 'Snapshot' },
  { type: 'thermal_scan', label: 'Thermal Scan' },
  { type: 'voice_prompt', label: 'Voice Prompt' },
  { type: 'led_signal', label: 'LED Signal' },
  { type: 'wait', label: 'Wait' },
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
  function toggleAction(type: WaypointAction['type'], label: string) {
    const has = waypoint.actions.some((a) => a.type === type)
    onUpdate({
      actions: has
        ? waypoint.actions.filter((a) => a.type !== type)
        : [...waypoint.actions, { type, label }],
    })
  }

  return (
    <div style={{
      width: 280, flexShrink: 0, borderLeft: `1px solid ${color.border}`, background: color.surface,
      padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3], overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>Waypoint {index + 1} of {total}</span>
        <button onClick={onRemove} aria-label="Remove waypoint" style={{ background: 'transparent', border: 'none', color: color.red, cursor: 'pointer', padding: 4 }}>
          <Trash2 size={14} />
        </button>
      </div>

      <Field label="Label">
        <input
          value={waypoint.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: radius.sm, background: color.card,
            border: `1px solid ${color.border}`, color: color.t1, fontSize: font.size.sm, fontFamily: font.family,
          }}
        />
      </Field>

      <Field label="Coordinates">
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ fontSize: font.size.sm, color: color.t1, fontWeight: font.weight.semibold }}>
            {waypoint.x_m.toFixed(1)}, {waypoint.y_m.toFixed(1)} m
          </span>
          <EstimatedBadge compact />
        </div>
      </Field>

      <Field label="Actions on arrival">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ACTION_TYPES.map(({ type, label }) => {
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
        Click another point on the map to place the next waypoint, or click an existing marker to select it.
      </div>
    </div>
  )
}
