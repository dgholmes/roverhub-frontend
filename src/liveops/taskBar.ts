import i18n from '@/i18n'
import { reasonText } from '@/components/missions/program/runText'
import type { RunReason } from '@/missions/program/runReasons'
import type { RobotState } from '@/types'
import { isMissionOwner } from './controlOwner'
import type { RobotRunView } from './robotRun'

/** What CurrentTaskBar's left slot and its run buttons show (spec 2026-10-29 §5.3).
 *
 * `buttons` is the control group the bar renders in place of the plain
 * Take control / Release toggle: `takeControl` and `release` are that toggle,
 * `releaseResume` replaces Release while you hold a paused run, `stopMission`
 * sits beside it, and `viewRun` / `dismiss` live in the Ended slot itself. */
export type TaskBarButton = 'takeControl' | 'releaseResume' | 'release' | 'stopMission' | 'viewRun' | 'dismiss'
export type TaskBarSlot = 'none' | 'manual' | 'running' | 'paused' | 'ended'
export type TaskBarTone = 'green' | 'amber' | 'blue' | 'red' | 'neutral'

export interface TaskBarModel {
  slot: TaskBarSlot
  title: string
  tag: string | null
  tagTone: TaskBarTone
  detail: string | null
  /** The bar is drawn only when `estimateS` is set; otherwise elapsed time alone. */
  progress: { elapsedS: number; estimateS: number | null } | null
  buttons: TaskBarButton[]
}

/** 0:05, 4:10, 1:02:05. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const secondsBetween = (from: string, toMs: number): number => {
  const start = Date.parse(from)
  return Number.isFinite(start) ? Math.max(0, Math.floor((toMs - start) / 1000)) : 0
}

/** A reason this build knows is translated; one it does not is shown as sent. */
function reasonLabel(reason: string): string {
  return i18n.exists(`missions.program.run.reason.${reason}`) ? reasonText(i18n.t, reason as RunReason) : reason
}

export function taskBarModel(view: RobotRunView, robot: RobotState, now: number = Date.now()): TaskBarModel {
  const t = i18n.t
  const inManualControl = robot.abstract_state === 'MANUAL' || robot.abstract_state === 'ASSISTED'
  const toggle: TaskBarButton = inManualControl ? 'release' : 'takeControl'
  const title = view?.missionName ?? t('command.taskBar.run.mission')

  if (view?.phase === 'running') {
    return {
      slot: 'running', title, tag: t('command.taskBar.run.running'), tagTone: 'green',
      detail: view.stepLabel,
      progress: { elapsedS: secondsBetween(view.startedAt, now), estimateS: view.estimateS },
      buttons: ['takeControl', 'stopMission'],
    }
  }

  if (view?.phase === 'paused') {
    const step = view.redoStepLabel
    if (view.youHoldControl) {
      return {
        slot: 'paused', title, tag: t('command.taskBar.run.pausedYou'), tagTone: 'blue',
        detail: step ? t('command.taskBar.run.redoOnRelease', { step }) : t('command.taskBar.run.nextOnRelease'),
        progress: null, buttons: ['releaseResume', 'stopMission'],
      }
    }
    const detail = step ? t('command.taskBar.run.redoOnResume', { step }) : t('command.taskBar.run.nextOnResume')
    if (view.owner === null || isMissionOwner(view.owner)) {
      return {
        slot: 'paused', title, tag: t('command.taskBar.run.pausedNobody'), tagTone: 'amber',
        detail, progress: null, buttons: ['takeControl', 'stopMission'],
      }
    }
    // Another operator holds it: control cannot be taken from a person.
    return {
      slot: 'paused', title, tag: t('command.taskBar.run.pausedOther', { owner: view.owner }), tagTone: 'amber',
      detail, progress: null, buttons: ['stopMission'],
    }
  }

  if (view?.phase === 'ended' && view.ended) {
    const { result, reason, endedAt, stepsDone } = view.ended
    const parts = [
      t('command.taskBar.run.stepsDone', { count: stepsDone }),
      formatClock(secondsBetween(view.startedAt, Date.parse(endedAt))),
    ]
    if (reason) parts.push(reasonLabel(reason))
    return {
      slot: 'ended', title, tag: t(`command.taskBar.run.result.${result}`),
      tagTone: result === 'completed' ? 'green' : result === 'failed' ? 'red' : 'neutral',
      detail: parts.join(' · '), progress: null,
      buttons: [toggle, 'viewRun', 'dismiss'],
    }
  }

  if (inManualControl) {
    const owner = robot.control_owner
    const who = owner && !isMissionOwner(owner) ? owner : t('command.taskBar.operator')
    return {
      slot: 'manual', title: t('command.taskBar.manualControl', { owner: who }), tag: null, tagTone: 'neutral',
      detail: null, progress: null, buttons: ['release'],
    }
  }
  return {
    slot: 'none', title: t('command.taskBar.noMission'), tag: null, tagTone: 'neutral',
    detail: null, progress: null, buttons: ['takeControl'],
  }
}
