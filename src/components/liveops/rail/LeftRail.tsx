import { color, font, layout, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { RobotList } from './RobotList'

function Section({ label, count, children }: { label: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-label={label} style={{ padding: `${space[3]}px ${space[2]}px` }}>
      <h2 style={{
        display: 'flex', alignItems: 'baseline', gap: space[2], margin: `0 ${space[2]}px ${space[2]}px`,
        fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
      }}>
        {label}
        {count != null && <span style={{ fontSize: font.size.sm, fontWeight: font.weight.regular, color: color.t3 }}>{count}</span>}
      </h2>
      {children}
    </section>
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
 * connectivity is the site bar's ConnectionStatus chip, which shows a single
 * aggregate "System Health" indicator plus a few coarse status items
 * (Cameras/Obstacle Avoidance/Bridge), not the per-link (grpc/dds/
 * edge_to_cloud/bridge_state) detail this rail used to show. That's an
 * accepted granularity tradeoff for this pass, not something this change
 * needs to solve — full connectivity detail still exists via
 * `NetworkStatus`/`BridgeStatus`/`SdkStatus`, which remain in
 * `CockpitStatusOverlay.tsx` for Cockpit view.
 */
export function LeftRail() {
  const count = useLiveOpsStore((s) => s.robots.length)
  return (
    <aside style={{
      width: layout.liveOpsRailWidth, flexShrink: 0,
      background: color.surface,
      display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
    }}>
      <Section label="Robots" count={count}>
        <RobotList />
      </Section>
    </aside>
  )
}
