import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useOperatorName } from '@/lib/auth/useAccount'
import { useOperatorId } from '@/lib/realtime/operator'
import { calibrationTurn, takeControl } from '@/sensors/sensorCommands'
import { turnBlock, turnGate, type TurnGate } from '@/sensors/turnGate'
import { TURN_ANGLE_DEG, TURN_COUNT, TurnRunner, type TurnRunEnd } from '@/sensors/turnRunner'
import type { RobotState } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import { StepActions, StepNote, StepText } from './sensorsParts'

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'running'; turn: number; stopping: boolean }
  | { kind: 'ended'; end: TurnRunEnd }

/**
 * Step 2's "Turn it for me" (option C): eight half turns on the spot, sent by
 * this console, so the operator does not have to drive them. Shown only to
 * people who may configure the robot; enabled only while it stands under their
 * control (sensors/turnGate.ts). Asks in place first, shows "Turning k/8"
 * through `onTurning` (the step's chip), and stops -- after the turn in flight
 * -- on Stop, on any of the runner's reasons, or when the page is left.
 * E-Stop stays where it always is.
 */
export function CalibrationTurns({ robot, status, onTurning }: {
  robot: RobotState
  status: LidarMountStatus
  /** The turn being sent (1-based) while a run lasts, else null. */
  onTurning: (turn: number | null) => void
}) {
  const { t } = useTranslation()
  const me = useOperatorId()
  const operatorName = useOperatorName()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [taking, setTaking] = useState<string | null>(null)
  const runner = useRef<TurnRunner | null>(null)
  // The runner asks about the robot between turns: always the latest one.
  const latest = useRef({ robot, me })
  useEffect(() => { latest.current = { robot, me } }, [robot, me])

  useEffect(() => { runner.current?.observe(status.measured) }, [status.measured])
  // Leaving the page (or picking another robot) sends no more turns.
  useEffect(() => () => { runner.current?.cancel() }, [])
  const reportTurning = useRef(onTurning)
  useEffect(() => { reportTurning.current = onTurning }, [onTurning])

  const gateText = (gate: Exclude<TurnGate, { ok: true }>): string =>
    gate.reason === 'policy' ? gate.text : t(`sensors.turns.blocked.${gate.reason}`)

  const robotId = robot.robot_id
  const start = () => {
    const r = new TurnRunner({
      send: async (direction, index) => {
        const outcome = await calibrationTurn(robotId, direction, TURN_ANGLE_DEG, index + 1, TURN_COUNT)
        if (outcome.result === 'completed') return { ok: true }
        return {
          ok: false,
          reason: outcome.command.failure_reason ?? (outcome.result === 'unknown' ? t('sensors.turns.noAnswer') : outcome.result),
        }
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      blocked: () => turnBlock(latest.current.robot, latest.current.me),
      onTurn: (turn) => {
        setPhase({ kind: 'running', turn, stopping: r.stopRequested })
        reportTurning.current(turn)
      },
    }, status.measured)
    runner.current = r
    // The lead-in still wait counts as the first turn's: it is about to go.
    setPhase({ kind: 'running', turn: 1, stopping: false })
    reportTurning.current(1)
    void r.run().then((end) => {
      if (end.kind === 'cancelled') return
      if (runner.current === r) runner.current = null
      reportTurning.current(null)
      setPhase({ kind: 'ended', end })
    })
  }

  const stop = () => {
    runner.current?.stop()
    setPhase((p) => (p.kind === 'running' ? { ...p, stopping: true } : p))
  }

  const take = async () => {
    setTaking('')
    const outcome = await takeControl(robotId, operatorName)
    setTaking(outcome.result === 'completed' ? null
      : outcome.command.failure_reason ?? (outcome.result === 'unknown' ? t('sensors.turns.noAnswer') : outcome.result))
  }

  if (phase.kind === 'running') {
    return (
      <div style={{ display: 'grid', gap: space[2] }}>
        <StepActions caption={phase.stopping ? t('sensors.turns.stopping') : t('sensors.turns.stopCaption')}>
          <Button onClick={stop} disabled={phase.stopping}>{t('sensors.turns.stop')}</Button>
        </StepActions>
      </div>
    )
  }

  const gate = turnGate(robot, status, me)
  // Done measuring: nothing to turn for, and the step says so itself.
  if (!gate.ok && gate.reason === 'done' && phase.kind !== 'ended') return null

  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {phase.kind === 'ended' && <EndNote end={phase.end} />}
      {phase.kind === 'confirm' ? (
        <div role="alertdialog" aria-label={t('sensors.turns.start')} style={{
          display: 'grid', gap: space[2], padding: space[3], marginLeft: 24, borderRadius: radius.md, background: color.amberBg,
        }}>
          <p style={{ margin: 0, fontSize: font.size.md, color: color.t1, lineHeight: 1.5, wordBreak: 'keep-all' }}>{t('sensors.turns.confirm')}</p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button variant="primary" disabled={!gate.ok} onClick={start}>{t('sensors.turns.go')}</Button>
            <Button onClick={() => setPhase({ kind: 'idle' })}>{t('sensors.cancel')}</Button>
          </div>
          {!gate.ok && <span style={{ fontSize: font.size.xs, color: color.t3 }}>{gateText(gate)}</span>}
        </div>
      ) : gate.ok || gate.reason !== 'done' ? (
        <StepActions caption={gate.ok ? t('sensors.turns.needs') : gateText(gate)}>
          <Button variant="primary" disabled={!gate.ok} onClick={() => setPhase({ kind: 'confirm' })}>{t('sensors.turns.start')}</Button>
          {!gate.ok && gate.reason === 'takeControl' && gate.canTake && (
            <Button disabled={taking === ''} onClick={() => { void take() }}>{t('sensors.turns.takeControl')}</Button>
          )}
        </StepActions>
      ) : null}
      {taking && <StepText>{t('sensors.result.failed', { robot: robot.name, reason: taking })}</StepText>}
    </div>
  )
}

function EndNote({ end }: { end: TurnRunEnd }) {
  const { t } = useTranslation()
  switch (end.kind) {
    case 'confident': return <StepNote tone="green">{t('sensors.turns.end.confident')}</StepNote>
    case 'finished': return <StepNote tone="neutral">{t('sensors.turns.end.finished')}</StepNote>
    case 'stopped': return <StepNote tone="neutral">{t('sensors.turns.end.stopped')}</StepNote>
    case 'turnFailed': return <StepNote tone="red">{t('sensors.turns.end.turnFailed', { reason: end.reason })}</StepNote>
    case 'refused':
      return <StepNote tone="amber">{t('sensors.turns.end.refused', { reason: t(`sensors.refusal.${end.reason ?? 'unknown'}`) })}</StepNote>
    case 'noneCounted': return <StepNote tone="amber">{t('sensors.turns.end.noneCounted')}</StepNote>
    case 'notStanding':
    case 'lostControl':
    case 'offline':
      return <StepNote tone="amber">{t(`sensors.turns.end.${end.kind}`)}</StepNote>
    default: return null
  }
}
