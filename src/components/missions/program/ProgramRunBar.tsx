import { useTranslation } from 'react-i18next'
import { FlaskConical, Hand, Play, Square } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RunBlocker } from '@/missions/program/runBlockers'
import type { ProgramRun } from '@/missions/program/useProgramRun'
import type { RobotState } from '@/types'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { AvailabilityDot, RobotPicker, availabilityText, useRobotAvailability } from '../RobotPicker'
import { reasonText } from './runText'

/**
 * Pinned under the Program canvas: the robot, Dry run, Run (or Take control),
 * Stop, the LiveOps E-Stop, and one line saying what is happening or why Run
 * is disabled. E-Stop is never disabled by a run.
 */
export function ProgramRunBar({ run, robots, robotId, onRobot, fixedRobot = false }: {
  run: ProgramRun
  robots: RobotState[]
  robotId: string | undefined
  onRobot: (robotId: string | undefined) => void
  /** The robot is the task's: shown, not offered for change (a task's Run now). */
  fixedRobot?: boolean
}) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const availability = useRobotAvailability(robots)
  const robot = run.robot
  // Newest-first, so the first match is the most recent attempt for this robot (as CurrentTaskBar).
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robotId))
  const { state, blockers, progress, outcome } = run
  const idle = state === 'idle'
  const needsControl = idle && (blockers.includes('noControl') || run.takingControl)
  const canTake = robot ? getCommandAvailability(robot, 'TAKE_CONTROL') : null

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
  if (state === 'stopping') status = t('missions.program.run.stopping')
  else if (state === 'running') {
    status = progress && progress.sent > 0
      ? t('missions.program.run.step', { n: progress.sent, total: progress.total, label: progress.label })
      : t('missions.program.run.starting')
    tone = color.t1
  } else if (outcome && run.shows === 'run') {
    status = outcome.result === 'completed'
      ? t('missions.program.run.outcome.completed', { count: outcome.commandsSent })
      : t(`missions.program.run.outcome.${outcome.result}`, { reason: outcome.reason ? reasonText(t, outcome.reason) : '' })
    tone = outcome.result === 'completed' ? color.green : outcome.result === 'failed' ? color.red : color.amber
  } else if (run.takeFailure && blockers.includes('noControl')) {
    status = t('missions.program.run.takeControlFailed', { reason: run.takeFailure })
    tone = color.red
  } else if (blockers.length > 0) status = blockerText(blockers[0])
  else status = t('missions.program.run.ready', { robot: robot?.name ?? '' })

  return (
    <div style={{
      // Above Blockly's toolbox (z-index 70), so the robot list can open upwards over it.
      position: 'relative', zIndex: 80,
      flexShrink: 0, background: color.surface, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
      gap: space[2], padding: `${space[2]}px ${space[4]}px`, minHeight: 64,
    }}>
      {fixedRobot ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], minWidth: 0, maxWidth: 240, fontSize: font.size.md, color: color.t1 }}>
          {robotId && availability.get(robotId) && <AvailabilityDot availability={availability.get(robotId)!} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{robot?.name ?? robotId ?? t('missions.program.run.noRobot')}</span>
        </span>
      ) : (
        // The robot is fixed while a run is going.
        <div style={{ width: 240, maxWidth: '100%', opacity: idle ? 1 : 0.6, pointerEvents: idle ? undefined : 'none' }} aria-disabled={!idle}>
          <RobotPicker
            robots={robots} value={robotId} onChange={onRobot} openUp
            noneLabel={t('missions.program.run.noRobot')} noneHint={t('missions.program.run.noRobotHint')}
          />
        </div>
      )}
      <Button size="sm" icon={FlaskConical} disabled={!idle} onClick={run.startDryRun}>{t('missions.program.run.dryRun')}</Button>
      {idle && needsControl ? (
        <Button
          size="sm" variant="primary" icon={Hand} disabled={run.takingControl || !canTake?.enabled} title={canTake?.reason}
          onClick={() => void run.takeControl(t('missions.program.run.takeControlCommand'))}
        >
          {t('missions.program.run.takeControl')}
        </Button>
      ) : idle ? (
        <Button size="sm" variant="primary" icon={Play} disabled={blockers.length > 0} title={blockers[0] ? blockerText(blockers[0]) : undefined} onClick={() => void run.start()}>
          {t('missions.program.run.run')}
        </Button>
      ) : (
        <Button size="sm" icon={Square} disabled={state === 'stopping'} onClick={(e) => run.stop(e.detail)}>{t('missions.program.run.stop')}</Button>
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
