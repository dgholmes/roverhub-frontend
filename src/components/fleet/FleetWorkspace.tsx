import { useEffect, useMemo, useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { mockDocks } from '@/mocks/mockDocks'
import { mockEdgeBridges } from '@/mocks/mockEdgeBridges'
import { mockFleetDetails } from '@/mocks/mockFleetDetails'
import { FleetTable } from './FleetTable'
import { DockStatus } from './DockStatus'
import { EdgeBridgeDetail } from './EdgeBridgeDetail'
import { DeviceDetailDrawer } from './DeviceDetailDrawer'
import { Segmented } from '@/components/kit'
import { FleetRobotsView } from './v2/FleetRobotsView'
import { BridgesView } from './v2/BridgesView'
import { DocksPlaceholder } from './v2/DocksPlaceholder'

type FleetTab = 'robots' | 'docks' | 'bridges'

/** The redesigned Fleet (layout A) runs beside the original while the two are
 * compared; the original stays one click away until one is retired. */
type FleetLayout = 'new' | 'classic'
const LAYOUT_KEY = 'rh.fleet.layout'

function readLayout(): FleetLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'classic' ? 'classic' : 'new'
  } catch {
    return 'new'
  }
}
const TABS: { key: FleetTab; label: string }[] = [
  { key: 'robots', label: 'Robots' },
  { key: 'docks', label: 'Docks' },
  { key: 'bridges', label: 'Edge bridges' },
]

/**
 * Fleet workspace (docs/01-prd.md §9, docs/05-ui-ux.md §10) — the detailed
 * home of device status. LiveOps only ever shows compact summaries; the full
 * detail (sensor health, maintenance log, firmware, edge bridge internals)
 * lives here.
 */
export function FleetWorkspace() {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const robots = useLiveOpsStore((s) => s.robots)
  const [tab, setTab] = useState<FleetTab>('robots')
  const [layout, setLayoutState] = useState<FleetLayout>(readLayout)
  const setLayout = (next: FleetLayout) => {
    setLayoutState(next)
    try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* per-viewer convenience only */ }
  }
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
                background: active ? color.selected : 'transparent',
                color: active ? color.t1 : color.t2,
                fontSize: font.size.sm, fontWeight: active ? font.weight.semibold : font.weight.regular,
                fontFamily: font.family, cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <Segmented
          label="Fleet layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'new', label: 'New', title: 'Redesigned Fleet: roster and inspector' },
            { value: 'classic', label: 'Classic', title: 'The original Fleet table and drawer' },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {layout === 'new' && tab === 'robots' && (
          <FleetRobotsView
            robots={robots}
            selectedRobotId={selectedRobotId}
            onSelect={setSelectedRobotId}
            onOpenBridge={(robotId) => { setSelectedRobotId(robotId); setTab('bridges') }}
          />
        )}
        {layout === 'new' && tab === 'docks' && <DocksPlaceholder />}
        {layout === 'new' && tab === 'bridges' && (
          <BridgesView robots={robots} selectedRobotId={selectedRobotId} onSelect={setSelectedRobotId} />
        )}
        {layout === 'classic' && tab === 'robots' && <FleetTable robots={robots} onSelectRobot={setSelectedRobotId} />}
        {layout === 'classic' && tab === 'docks' && <div style={{ flex: 1, overflowY: 'auto' }}><DockStatus docks={mockDocks} robotNameById={robotNameById} /></div>}
        {layout === 'classic' && tab === 'bridges' && <div style={{ flex: 1, overflowY: 'auto' }}><EdgeBridgeDetail bridges={mockEdgeBridges} robotNameById={robotNameById} /></div>}
      </div>

      {layout === 'classic' && selectedRobot && (
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
