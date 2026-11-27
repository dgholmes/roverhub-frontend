import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { useCursor, type RunCursor } from '@/data/runCursor'
import { formatRunClock, legIndexAt } from '@/data/runTrack'
import type { MissionWaypoint, RunTrackMarker, TraceLeg } from '@/types'

const m = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} m`)
const s = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} s`)

/**
 * One row per nav goal (the bridge's walk score): how far it walked against
 * its first plan and the straight line, time turning in place and on the
 * tight controller, plans and route changes, stuck stops. Clicking a row
 * seeks to the leg's start; the leg under the cursor is highlighted, and the
 * table re-renders only when that changes.
 */
export const RunLegsTable = memo(function RunLegsTable({ legs, waypoints, markers, cursor, onSeek }: {
  legs: TraceLeg[]
  waypoints: MissionWaypoint[]
  markers: RunTrackMarker[]
  cursor: RunCursor
  onSeek: (t: number) => void
}) {
  const { t } = useTranslation()
  const current = useCursor(cursor, (v) => legIndexAt(legs, v))
  if (legs.length === 0) return <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3 }}>{t('data.run.legs.none')}</p>
  const wpLabel = (id: string | null) => {
    const i = id ? waypoints.findIndex((w) => w.waypoint_id === id) : -1
    return i >= 0 ? `${i + 1}. ${waypoints[i].label}` : '—'
  }
  const cols = ['time', 'waypoint', 'outcome', 'walked', 'firstPlan', 'straight', 'turn', 'tight', 'plans', 'changes'] as const
  const cell = { padding: `${space[1]}px ${space[2]}px`, whiteSpace: 'nowrap' } as const
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.sm, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{ ...cell, textAlign: 'left', fontSize: font.size['2xs'], fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: font.tracking.wider, color: color.t3 }}>
                {t(`data.run.legs.col.${c}`)}
              </th>
            ))}
            <th style={{ ...cell, textAlign: 'left', fontSize: font.size['2xs'], fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: font.tracking.wider, color: color.t3 }}>
              {t('data.run.marker.stuck')}
            </th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => {
            const on = i === current
            const stuck = markers.filter((k) => k.kind === 'stuck' && k.t >= l.t_start && k.t <= l.t_end).length
            return (
              <tr key={i} onClick={() => onSeek(l.t_start)} aria-selected={on} title={l.line}
                style={{ cursor: 'pointer', background: on ? color.selected : 'transparent', color: on ? color.t1 : color.t2 }}>
                <td style={cell}>{formatRunClock(l.t_start)}–{formatRunClock(l.t_end)}</td>
                <td style={cell}>{wpLabel(l.waypoint_id)}</td>
                <td style={{ ...cell, color: l.outcome && l.outcome !== 'succeeded' ? color.amber : undefined }}>{l.outcome ?? '—'}</td>
                <td style={cell}>{m(l.walked_m)}</td>
                <td style={cell}>{m(l.first_plan_m)}</td>
                <td style={cell}>{m(l.straight_m)}</td>
                <td style={cell}>{s(l.turn_in_place_s)}</td>
                <td style={cell}>{s(l.tight_s)}</td>
                <td style={cell}>{l.plans}</td>
                <td style={cell}>{l.route_changes}</td>
                <td style={{ ...cell, color: stuck ? color.amber : undefined }}>{stuck || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
