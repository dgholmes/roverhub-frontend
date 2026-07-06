import { useEffect, useRef, useState } from 'react'
import { color, font, space } from '@/design-system/tokens'
import { StatePill } from '@/legacy/liveops-v1/common/StatePill'
import { EstimatedBadge } from '@/legacy/liveops-v1/common/EstimatedBadge'
import { StaleBadge } from '@/legacy/liveops-v1/common/StaleBadge'
import { STATE_DISPLAY } from '@/legacy/liveops-v1/liveops/stateDisplay'
import type { RobotState } from '@/legacy/liveops-v1/types'

/**
 * LiveOps left-rail quick status (docs/05-ui-ux.md §9). Shows only what §9.1
 * allows — abstract state, speed, position freshness. Battery/network/bridge/
 * SDK render as their own sibling rail components, not duplicated here.
 * Must NOT show (§9.2): raw SDK state, absolute position, config controls.
 */
export function RobotStatusMini({ robot }: { robot: RobotState }) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm }}>
        <span style={{ color: color.t3 }}>Speed</span>
        <span style={{ color: color.t1, fontWeight: font.weight.semibold }}>{robot.speed_mps.toFixed(1)} m/s</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: font.size.sm }}>
        <span style={{ color: color.t3 }}>Position</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {robot.position.freshness !== 'live'
            ? <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
            : <EstimatedBadge compact />}
        </div>
      </div>
    </div>
  )
}
