import { color, font, radius, space } from '@/design-system/tokens'
import { STATE_DISPLAY } from '@/liveops/stateDisplay'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'

/** Left-rail robot list — selecting a robot here stays in sync with
 * RobotSelector in the TopBar (shared selectedRobotId in useSessionStore). */
export function RobotList() {
  const robots = useLiveOpsStore((s) => s.robots)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
      {robots.map((r) => {
        const isSelected = r.robot_id === selectedRobotId
        const v = STATE_DISPLAY[r.abstract_state]
        const online = r.connectivity.bridge_state === 'connected'
        return (
          <button
            key={r.robot_id}
            onClick={() => setSelectedRobot(r.robot_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2],
              padding: `${space[2]}px ${space[2] + 2}px`, borderRadius: radius.md,
              background: isSelected ? color.card : 'transparent',
              border: `1px solid ${isSelected ? color.borderLt : 'transparent'}`,
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: radius.full, flexShrink: 0,
              background: online ? v.color : color.t3,
              boxShadow: online ? `0 0 5px ${v.color}` : undefined,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {r.name}
              </div>
              <div style={{ fontSize: font.size.xs, color: online ? v.color : color.t3 }}>
                {online ? v.label : 'Offline'}
              </div>
            </div>
            <div style={{ fontSize: font.size.xs, color: color.t3, flexShrink: 0 }}>
              {r.battery.percent}%
            </div>
          </button>
        )
      })}
    </div>
  )
}
