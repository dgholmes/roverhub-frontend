import { color, font, space } from '@/design-system/tokens'
import type { Workspace } from './routes'

const DESCRIPTIONS: Record<Workspace, string> = {
  LiveOps: '',
  Fleet: 'Robot, dock, and edge bridge readiness management.',
  Missions: 'Route planning, waypoint editing, scheduling, and dispatch.',
  Data: 'Mission replay, media library, reports, and exports.',
  Systems: 'Topology, SDK configuration, permissions, and audit log.',
}

/** Placeholder for workspaces not yet built. Present and labeled rather than
 * a missing nav entry — mirrors the R2/Future treatment rule (docs/05-ui-ux.md §18.3). */
export function ComingSoon({ workspace }: { workspace: Workspace }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[2], color: color.t3,
    }}>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.t2 }}>
        {workspace}
      </div>
      <div style={{ fontSize: font.size.sm, maxWidth: 360, textAlign: 'center' }}>
        {DESCRIPTIONS[workspace]}
      </div>
      <div style={{ fontSize: font.size.xs, color: color.t3, marginTop: space[2] }}>
        Coming after the LiveOps workspace is confirmed.
      </div>
    </div>
  )
}
