import { useEffect, useMemo, useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { scopeToSite } from '@/liveops/siteScope'
import { mockDocks } from '@/mocks/mockDocks'
import { mockEdgeBridges } from '@/mocks/mockEdgeBridges'
import { mockFleetDetails } from '@/mocks/mockFleetDetails'
import { FleetTable } from './FleetTable'
import { DockStatus } from './DockStatus'
import { EdgeBridgeDetail } from './EdgeBridgeDetail'
import { DeviceDetailDrawer } from './DeviceDetailDrawer'

type FleetTab = 'robots' | 'docks' | 'bridges'
const TABS: { key: FleetTab; label: string }[] = [
  { key: 'robots', label: 'Robots' },
  { key: 'docks', label: 'Docks' },
  { key: 'bridges', label: 'Edge Bridges' },
]

/**
 * Fleet workspace (docs/01-prd.md §9, docs/05-ui-ux.md §10) — the detailed
 * home of device status. LiveOps only ever shows compact summaries; the full
 * detail (sensor health, maintenance log, firmware, edge bridge internals)
 * lives here.
 */
/** Docks and bridges are still mock records tied to a mock site, so once the
 * tabs are site-scoped they are legitimately empty on a real deployment. Empty
 * with a reason, rather than a blank pane — a blank pane is indistinguishable
 * from a load failure. docs/audit/2026-08-12-ui-ux-audit.md A-24. */
function FleetEmpty({ what }: { what: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: space[6], color: color.t2, fontSize: font.size.lg, textAlign: 'center',
    }}>
      No {what} recorded for this site.
    </div>
  )
}

export function FleetWorkspace() {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const allRobots = useLiveOpsStore((s) => s.robots)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  // Robots, docks and bridges all carry `site_id`, and none of the three was
  // filtered by it — `site_id` was a display column and a sort key in
  // FleetTable, never a scope. docs/audit/2026-08-12-ui-ux-audit.md A-34.
  const robots = useMemo(() => scopeToSite(allRobots, activeSiteId), [allRobots, activeSiteId])
  const docks = useMemo(() => scopeToSite(mockDocks, activeSiteId), [activeSiteId])
  const bridges = useMemo(() => scopeToSite(mockEdgeBridges, activeSiteId), [activeSiteId])
  const [tab, setTab] = useState<FleetTab>('robots')
  // Seeded from the session-shared selection so arriving from LiveOps opens
  // that robot's detail view directly (docs/05-ui-ux.md §2.3) — a one-time
  // seed, not a live binding, so browsing other robots' drawers here doesn't
  // perturb LiveOps' own selection.
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(
    () => useSessionStore.getState().selectedRobotId,
  )

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  const robotNameById = useMemo(
    () => Object.fromEntries(robots.map((r) => [r.robot_id, r.name])),
    [robots],
  )

  const selectedRobot = robots.find((r) => r.robot_id === selectedRobotId)
  const selectedDetail = selectedRobotId ? mockFleetDetails[selectedRobotId] : undefined
  const selectedBridge = selectedDetail
    ? mockEdgeBridges.find((b) => b.bridge_id === selectedDetail.edge_bridge_id)
    : undefined

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
      <div style={{
        height: 44, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[1],
      }}>
        {TABS.map(({ key, label }) => {
          const active = key === tab
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: '6px 14px', borderRadius: radius.md,
                border: active ? `1px solid ${color.borderLt}` : '1px solid transparent',
                background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
                color: active ? color.t1 : color.t2,
                fontSize: font.size.sm, fontWeight: active ? font.weight.semibold : font.weight.regular,
                fontFamily: font.family, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {tab === 'robots' && <FleetTable robots={robots} onSelectRobot={setSelectedRobotId} />}
        {tab === 'docks' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {docks.length === 0
              ? <FleetEmpty what="docks" />
              : <DockStatus docks={docks} robotNameById={robotNameById} />}
          </div>
        )}
        {tab === 'bridges' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {bridges.length === 0
              ? <FleetEmpty what="edge bridges" />
              : <EdgeBridgeDetail bridges={bridges} robotNameById={robotNameById} />}
          </div>
        )}
      </div>

      {selectedRobot && (
        <DeviceDetailDrawer
          robot={selectedRobot}
          detail={selectedDetail}
          bridge={selectedBridge}
          onClose={() => setSelectedRobotId(null)}
        />
      )}
    </div>
  )
}
