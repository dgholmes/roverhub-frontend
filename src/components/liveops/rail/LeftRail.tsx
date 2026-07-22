import { color, font, layout, space } from '@/design-system/tokens'
import { RobotList } from './RobotList'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
      letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: space[2] + 2,
    }}>
      {children}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: `${space[3] + 2}px ${space[4]}px`, borderBottom: `1px solid ${color.border}` }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  )
}

/**
 * LiveOps left rail (docs/05-ui-ux.md §3) — always visible, never collapsed
 * except in Cockpit view mode.
 *
 * Deliberately minimal: only the Fleet device list. The rail previously
 * also carried per-robot Robot Status/Battery/Network/Bridge/SDK sections;
 * those were removed per the user's explicit request to declutter repeated
 * telemetry across the LiveOps view (the sidebar shouldn't restate
 * per-field telemetry, the device list can stay). This is a general
 * decluttering ask, not a claim that any one other component reproduces
 * every removed field one-for-one — the closest surviving surface for
 * connectivity is `SystemStatusBar`'s footer, which shows a single
 * aggregate "System Health" indicator plus a few coarse status items
 * (Cameras/Obstacle Avoidance/Bridge), not the per-link (grpc/dds/
 * edge_to_cloud/bridge_state) detail this rail used to show. That's an
 * accepted granularity tradeoff for this pass, not something this change
 * needs to solve — full connectivity detail still exists via
 * `NetworkStatus`/`BridgeStatus`/`SdkStatus`, which remain in
 * `CockpitStatusOverlay.tsx` for Cockpit view.
 */
export function LeftRail() {
  return (
    <aside style={{
      width: layout.liveOpsRailWidth, flexShrink: 0,
      background: color.surface, borderRight: `1px solid ${color.border}`,
      display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
    }}>
      <Section label="Fleet">
        <RobotList />
      </Section>
    </aside>
  )
}
