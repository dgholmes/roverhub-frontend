import { Anchor } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import type { Dock } from '@/types'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

/**
 * MVP dock = location record only (docs/05-ui-ux.md §10.3, docs/01-prd.md §9.6).
 * Deliberately does not imply real-time state — no online/offline, no
 * occupancy, no charging-state API until R2 smart dock hardware.
 */
export function DockStatus({ docks, robotNameById }: { docks: Dock[]; robotNameById: Record<string, string> }) {
  const sites = useSessionStore((s) => s.sites)
  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? siteId

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: space[3], padding: space[5] }}>
      {docks.map((dock) => (
        <div key={dock.dock_id} style={{
          background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4],
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
            <Anchor size={16} color={color.t2} strokeWidth={1.8} />
            <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{dock.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.size.sm }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: color.t3 }}>Site</span>
              <span style={{ color: color.t1 }}>{siteName(dock.site_id)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: color.t3 }}>Coordinate</span>
              <span style={{ color: color.t1 }}>{dock.x_m}, {dock.y_m} m · {dock.heading_deg}°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: color.t3 }}>Charging cable</span>
              <span style={{ color: dock.charging_cable ? color.green : color.t3 }}>{dock.charging_cable ? 'Present' : 'Not installed'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: color.t3 }}>Last used</span>
              <span style={{ color: color.t1 }}>
                {dock.last_robot_id
                  ? `${robotNameById[dock.last_robot_id] ?? dock.last_robot_id} · ${timeAgo(dock.last_used_at!)}`
                  : 'Never'}
              </span>
            </div>
          </div>
          {dock.notes && (
            <div style={{ marginTop: space[3], fontSize: font.size.xs, color: color.t3, fontStyle: 'italic' }}>{dock.notes}</div>
          )}
        </div>
      ))}
    </div>
  )
}
