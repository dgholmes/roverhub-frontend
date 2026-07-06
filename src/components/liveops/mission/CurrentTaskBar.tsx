import { Anchor, Camera, Mic2, Pause, Play, RotateCcw } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { nextWaypointInfo } from '@/liveops/waypointGeometry'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { missionProgress } from '@/types'
import type { CommandType, Mission, RobotState } from '@/types'
import { ActionButton } from './ActionButton'
import { EStopButton } from '../command/EStopButton'

const TYPE_LABEL: Record<Mission['type'], string> = {
  patrol: 'Patrol',
  inspection: 'Inspection',
  escort: 'Escort',
  return_to_dock: 'Return to Dock',
  emergency: 'Emergency',
}

const BUTTONS: { type: CommandType; label: string; icon: React.ElementType }[] = [
  { type: 'PAUSE', label: 'Pause', icon: Pause },
  { type: 'RESUME', label: 'Resume', icon: Play },
  { type: 'RETURN', label: 'Return', icon: RotateCcw },
  { type: 'DOCK', label: 'Dock', icon: Anchor },
  { type: 'SNAPSHOT', label: 'Snapshot', icon: Camera },
  { type: 'SPEAK', label: 'Speak', icon: Mic2 },
]

/**
 * Restores the original CurrentTask bar layout (task info · ETA · next
 * waypoint · action buttons) as a single data-driven, command-wired bar —
 * folds in what used to be the separate MissionCard + CommandBar split.
 */
export function CurrentTaskBar({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)

  if (!mission) {
    return (
      <div style={{
        height: layout.currentTaskHeight, flexShrink: 0, background: color.surface,
        borderTop: `1px solid ${color.border}`, display: 'flex', alignItems: 'center',
        padding: `0 ${space[4]}px`, color: color.t3, fontSize: font.size.sm,
      }}>
        No active mission for this robot.
      </div>
    )
  }

  const { pct } = missionProgress(mission)
  const activeWp = mission.waypoints[mission.current_waypoint_index]
  const next = nextWaypointInfo(robot, mission)

  return (
    <div style={{
      height: layout.currentTaskHeight, flexShrink: 0,
      background: color.surface, borderTop: `1px solid ${color.border}`,
      display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[5],
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
          letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
        }}>
          Current Task
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: 4 }}>
          <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1, letterSpacing: '-0.01em' }}>
            {mission.name}
          </span>
          <span style={{
            fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.accent,
            background: color.accentDim, border: `1px solid ${color.accentBorder}`,
            borderRadius: radius.xs, padding: '1px 7px', letterSpacing: '0.04em',
          }}>
            {TYPE_LABEL[mission.type]}
          </span>
        </div>
        <div style={{ fontSize: font.size.sm, color: color.t3, marginBottom: 6 }}>
          Waypoint {mission.current_waypoint_index + 1} of {mission.waypoints.length} · {activeWp?.label ?? '—'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
          <div style={{ flex: 1, height: 4, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color.accent, borderRadius: radius.full }} />
          </div>
          <span style={{ fontSize: font.size.xs, color: color.t3, flexShrink: 0 }}>{pct}%</span>
        </div>
      </div>

      <div style={{ width: 1, height: 60, background: color.border, flexShrink: 0 }} />

      <div style={{ textAlign: 'center', minWidth: 60 }}>
        <div style={{
          fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
        }}>
          ETA
        </div>
        <div style={{ fontSize: font.size['3xl'], fontWeight: font.weight.bold, color: color.t1, lineHeight: 1.1 }}>
          {mission.eta_min ?? '—'}
        </div>
        <div style={{ fontSize: font.size.xs, color: color.t3 }}>min</div>
      </div>

      <div style={{ width: 1, height: 60, background: color.border, flexShrink: 0 }} />

      <div style={{ minWidth: 84 }}>
        <div style={{
          fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
        }}>
          Next Waypoint
        </div>
        {next ? (
          <>
            <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.t1 }}>
              {Math.round(next.distance_m)} m
            </div>
            <div style={{ fontSize: font.size.sm, color: color.t3 }}>
              {Math.round(next.bearing_deg)}° {next.compass}
            </div>
          </>
        ) : (
          <div style={{ fontSize: font.size.sm, color: color.t3 }}>—</div>
        )}
      </div>

      <div style={{ width: 1, height: 60, background: color.border, flexShrink: 0 }} />

      <div style={{ display: 'flex', gap: space[1] + 2, alignItems: 'center', flexShrink: 0 }}>
        {BUTTONS.map(({ type, label, icon }) => (
          <ActionButton
            key={type}
            icon={icon}
            label={label}
            availability={getCommandAvailability(robot, type)}
            onClick={() => dispatchCommand(robot.robot_id, type, label)}
          />
        ))}
        <EStopButton
          availability={getCommandAvailability(robot, 'ESTOP')}
          onConfirm={() => dispatchCommand(robot.robot_id, 'ESTOP', 'Emergency Stop')}
        />
      </div>
    </div>
  )
}
