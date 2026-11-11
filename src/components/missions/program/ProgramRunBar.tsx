import { useTranslation } from 'react-i18next'
import { FlaskConical, Play, Square } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RunBlocker } from '@/missions/program/runBlockers'
import type { EdgeTestRun } from '@/missions/program/useEdgeTestRun'
import type { RobotState } from '@/types'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { RobotPicker, availabilityText, useRobotAvailability } from '../RobotPicker'
import { runReasonText } from './runText'

/**
 * Pinned under the Program canvas, and under a route's map (schema 0.0.16,
 * with no Dry run, since a route has no program to walk): the robot, Dry run, Run on the robot (Stop
 * while its run goes), the LiveOps E-Stop, and one line saying what the robot
 * is doing or why Run is disabled. The run itself is on the robot's edge
 * device; taking control of it happens in LiveOps. E-Stop is never disabled by a run.
 */
export function ProgramRunBar({ run, robots, robotId, onRobot }: {
  run: EdgeTestRun
  robots: RobotState[]
  robotId: string | undefined
  onRobot: (robotId: string | undefined) => void
}) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const availability = useRobotAvailability(robots)
  const robot = run.robot
  // Newest-first, so the first match is the most recent attempt for this robot (as CurrentTaskBar).
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robotId))
  const { state, blockers, ended } = run
  const going = state === 'running' || state === 'paused'
  const idle = !going && state !== 'starting'

  function blockerText(b: RunBlocker): string {
    switch (b) {
      case 'robotUnavailable': {
        const a = robotId ? availability.get(robotId) : undefined
        return t('missions.program.run.blocker.robotUnavailable', { status: a ? availabilityText(a, t) : '' })
      }
      case 'programErrors':
        return t('missions.program.run.blocker.programErrors', { first: run.programIssues.find((i) => i.severity === 'error')?.message ?? '' })
      case 'missionErrors':
        return t('missions.program.run.blocker.missionErrors', { first: run.missionErrors[0]?.message ?? '' })
      default:
        return t(`missions.program.run.blocker.${b}`)
    }
  }

  let status: string
  let tone = color.t2
  if (state === 'starting') status = t('missions.program.run.starting')
  else if (going && run.stopping) status = t('missions.program.run.stopping')
  else if (state === 'paused') {
    status = t('missions.program.run.pausedInLiveOps')
    tone = color.amber
  } else if (state === 'running') {
    status = run.stepLabel ? t('missions.program.run.runningStep', { label: run.stepLabel }) : t('missions.program.run.starting')
    tone = color.t1
  } else if (run.refusal) {
    status = t('missions.program.run.refused', { reason: run.refusal })
    tone = color.red
  } else if (state === 'ended' && ended && run.shows === 'run') {
    const reason = ended.reason ? runReasonText(t, ended.reason) : ''
    status = ended.result === 'completed'
      ? t('missions.program.run.outcome.completed', { count: ended.stepsDone })
      : t(`missions.program.run.outcome.${ended.result === 'failed' ? 'failed' : 'aborted'}`, { reason })
    tone = ended.result === 'completed' ? color.green : ended.result === 'failed' ? color.red : color.amber
  } else if (blockers.length > 0) status = blockerText(blockers[0])
  else status = t('missions.program.run.ready', { robot: robot?.name ?? '' })

  return (
    <div style={{
      // Above Blockly's toolbox (z-index 70), so the robot list can open upwards over it.
      position: 'relative', zIndex: 80,
      flexShrink: 0, background: color.surface, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: space[2], padding: `${space[2]}px ${space[4]}px`, minHeight: 64,
    }}>
      {/* The robot is fixed while a run is going. */}
      <div style={{ width: 240, maxWidth: '100%', opacity: idle ? 1 : 0.6, pointerEvents: idle ? undefined : 'none' }} aria-disabled={!idle}>
        <RobotPicker
          robots={robots} value={robotId} onChange={onRobot} openUp
          noneLabel={t('missions.program.run.noRobot')} noneHint={t('missions.program.run.noRobotHint')}
        />
      </div>
      {run.canDryRun && <Button size="sm" icon={FlaskConical} disabled={!idle} onClick={run.startDryRun}>{t('missions.program.run.dryRun')}</Button>}
      {going ? (
        <Button size="sm" icon={Square} disabled={run.stopping} onClick={run.stop}>{t('missions.program.run.stop')}</Button>
      ) : (
        <Button
          size="sm" variant="primary" icon={Play} disabled={!idle || blockers.length > 0}
          title={blockers[0] ? blockerText(blockers[0]) : undefined} onClick={() => void run.start()}
        >
          {robot ? t('missions.program.run.runOn', { robot: robot.name }) : t('missions.program.run.run')}
        </Button>
      )}
      <span
        role="status" aria-live="polite"
        style={{
          flex: 1, minWidth: 160, fontSize: font.size.sm, color: tone, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
        title={status}
      >
        {status}
      </span>
      {robot && robotId && (
        <EStopButton
          state={robot.abstract_state}
          engageCommand={latestEstopCommand}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robotId, 'ESTOP', t('command.estop.engageCommand'))}
          onRelease={() => dispatchCommand(robotId, 'RESET_ESTOP', t('command.estop.releaseCommand'))}
        />
      )}
    </div>
  )
}
