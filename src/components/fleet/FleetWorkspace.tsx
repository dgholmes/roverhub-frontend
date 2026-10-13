import { useEffect, useState } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { FleetRobotsView } from './v2/FleetRobotsView'
import { DocksPlaceholder } from './v2/DocksPlaceholder'

type FleetTab = 'robots' | 'docks'
const TABS: { key: FleetTab; label: string }[] = [
  { key: 'robots', label: 'Robots' },
  { key: 'docks', label: 'Docks' },
]

/**
 * Fleet workspace (docs/01-prd.md §9, docs/05-ui-ux.md §10): the detailed
 * home of device status. LiveOps only shows compact summaries; here each robot
 * gets an attention-sorted roster entry and a full inspector (Overview,
 * Motors, Motion tests, Edge device, Service).
 *
 * Each robot's edge device lives in its inspector, since a bridge serves one
 * robot. Docks keep their own tab because a dock is shared between robots.
 */
export function FleetWorkspace() {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const robots = useLiveOpsStore((s) => s.robots)
  const [tab, setTab] = useState<FleetTab>('robots')
  // Seeded from the session-shared selection so arriving from LiveOps or the
  // Dashboard opens that robot directly (docs/05-ui-ux.md §2.3). A one-time
  // seed, not a live binding, so browsing robots here doesn't change LiveOps'
  // own selection.
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(
    () => useSessionStore.getState().selectedRobotId,
  )

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

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
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        {tab === 'robots' && (
          <FleetRobotsView robots={robots} selectedRobotId={selectedRobotId} onSelect={setSelectedRobotId} />
        )}
        {tab === 'docks' && <DocksPlaceholder />}
      </div>
    </div>
  )
}
