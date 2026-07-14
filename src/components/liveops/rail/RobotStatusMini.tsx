import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { hashForSiteWorkspace } from '@/app/routes'
import { StatePill } from '@/components/common/StatePill'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { STATE_DISPLAY } from '@/liveops/stateDisplay'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'

/**
 * LiveOps left-rail quick status (docs/05-ui-ux.md §9). Shows only what §9.1
 * allows — abstract state, position freshness. Battery/network/bridge/SDK
 * render as their own sibling rail components, not duplicated here. Speed
 * is deliberately not shown here either — §9.1 doesn't list it, and it's
 * already shown in the floating telemetry HUD (LIVEOPS_AUDIT_TRACKER.md
 * 4.3: this was the one genuine redundancy between the rail and the HUD).
 * Must NOT show (§9.2): raw SDK state, absolute position, config controls.
 */
export function RobotStatusMini({ robot }: { robot: RobotState }) {
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const [prevState, setPrevState] = useState<RobotState['abstract_state'] | null>(null)
  const lastState = useRef(robot.abstract_state)

  useEffect(() => {
    if (lastState.current !== robot.abstract_state) {
      const was = lastState.current
      lastState.current = robot.abstract_state
      setPrevState(was)
      const t = setTimeout(() => setPrevState(null), 5000)
      return () => clearTimeout(t)
    }
  }, [robot.abstract_state])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatePill state={robot.abstract_state} />
      </div>
      {prevState && (
        <div style={{ fontSize: font.size.xs, color: color.t3 }}>
          was: {STATE_DISPLAY[prevState].label}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: font.size.sm }}>
        <span style={{ color: color.t3 }}>Position</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {robot.position.freshness !== 'live'
            ? <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
            : <EstimatedBadge compact />}
        </div>
      </div>
      <a
        href={hashForSiteWorkspace(activeSiteId, 'Fleet')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: font.size.xs, color: color.t2, textDecoration: 'none',
          paddingTop: space[1], marginTop: 2, borderTop: `1px solid ${color.border}`,
        }}
      >
        View full device details
        <ChevronRight size={11} strokeWidth={2} />
      </a>
    </div>
  )
}
