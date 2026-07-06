import { color, font, radius, space } from '@/design-system/tokens'
import type { MaintenanceRecord, MaintenanceSeverity } from '@/types'

const SEVERITY_COLOR: Record<MaintenanceSeverity, string> = {
  info: color.t2,
  warning: color.amber,
  critical: color.red,
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

/** Maintenance log + flag-for-inspection (docs/05-ui-ux.md §10.2). Scheduling
 * maintenance and full attachment/resolution workflow are R1 (docs/01-prd.md
 * FLT-013/FLT-015) — this MVP view is read-only history. */
export function MaintenancePanel({ log, maintenanceFlagged }: { log: MaintenanceRecord[]; maintenanceFlagged: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      {maintenanceFlagged && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]}px ${space[3]}px`,
          background: color.amberBg, border: `1px solid ${color.amberBorder}`, borderRadius: radius.sm,
          color: color.amber, fontSize: font.size.sm, fontWeight: font.weight.semibold,
        }}>
          Flagged for inspection — dispatch blocked until cleared.
        </div>
      )}
      {log.length === 0 ? (
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>No maintenance history.</div>
      ) : (
        log.map((rec) => (
          <div key={rec.id} style={{
            display: 'flex', gap: space[2], padding: `${space[2]}px 0`,
            borderBottom: `1px solid ${color.border}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLOR[rec.severity], marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
                <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{rec.subsystem}</span>
                <span style={{ fontSize: font.size.xs, color: color.t3, flexShrink: 0 }}>{timeAgo(rec.opened_at)}</span>
              </div>
              <div style={{ fontSize: font.size.sm, color: color.t2 }}>{rec.note}</div>
              {rec.resolved && <div style={{ fontSize: font.size.xs, color: color.green, marginTop: 2 }}>Resolved</div>}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
