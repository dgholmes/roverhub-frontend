import i18n from '@/i18n'
import { runReasonText } from '@/components/missions/program/runText'
import type { RobotState } from '@/types'
import { controlHolderName, isMissionOwner, isNavOwner } from './controlOwner'
import { distanceM, formatDistanceM, homeArrivedText, navStopReasonText, readNavGoal, robotPlacementProblem } from './navGoal'
import { STILL_HOME_M } from './returnHome'
import type { RobotRunView } from './robotRun'

/** What CurrentTaskBar's left slot and its run buttons show (spec 2026-10-29 §5.3).
 *
 * `buttons` is the control group the bar renders in place of the plain
 * Take control / Release toggle: `takeControl` and `release` are that toggle,
 * `releaseResume` replaces Release while you hold a paused run, `stopMission`
 * sits beside it, and `viewRun` / `dismiss` live in the Ended slot itself. */
export type TaskBarButton = 'takeControl' | 'releaseResume' | 'release' | 'stopMission' | 'viewRun' | 'dismiss' | 'retry'
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
  /** How the `retry` button reads (0.0.33): `resume` for a run an E-Stop
   * paused, `retry` for a blocked route. The same RESUME either way. Absent
   * means `retry`. */
  retryAs?: 'retry' | 'resume'
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
  return runReasonText(i18n.t, reason)
}

/** `starting`: this console has started a run on the robot that the robot has
 * not shown yet (see liveops/startingRuns.ts). */
export function taskBarModel(view: RobotRunView, robot: RobotState, now: number = Date.now(), starting = false): TaskBarModel {
  const t = i18n.t
  const inManualControl = robot.abstract_state === 'MANUAL' || robot.abstract_state === 'ASSISTED'
  // A walk to a tapped goal reads MANUAL, but nobody is driving: the bridge
  // holds it as nav:<goal_id>, and a person takes it over (the goal is
  // cancelled and control handed to them), so the toggle offers Take control.
  const navWalking = inManualControl && isNavOwner(robot.control_owner)
  const toggle: TaskBarButton = inManualControl && !navWalking ? 'release' : 'takeControl'
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
    // An E-Stop paused it (0.0.33). "Stopped by E-Stop" while the latch is
    // set, "Paused" once it is released, with the step Resume will redo.
    // Before the you-hold-control case: a plain Release never resumes an
    // E-Stop pause, only Resume does, so Release & resume is not offered.
    if (view.pausedFor === 'estop') return estopPaused(view, robot, title)
    if (view.youHoldControl) {
      return {
        slot: 'paused', title, tag: t('command.taskBar.run.pausedYou'), tagTone: 'blue',
        detail: step ? t('command.taskBar.run.redoOnRelease', { step }) : t('command.taskBar.run.nextOnRelease'),
        progress: null, buttons: ['releaseResume', 'stopMission'],
      }
    }
    // The ROBOT paused it (schema 0.0.16): a route leg stayed blocked through
    // its retries, and control was handed back. Retry (RESUME) asks it to try
    // the leg again from where it stands; Take control is still the other way.
    // Only while nobody holds control -- the bridge refuses Retry otherwise.
    if (view.pausedFor === 'blocked' && view.owner === null) {
      const reason = (view.pauseReason ? navStopReasonText(view.pauseReason) : null) ?? t('command.taskBar.run.blockedUnknown')
      const waypoint = view.waypointId ? view.route?.waypoints.find((w) => w.waypoint_id === view.waypointId)?.label : undefined
      return {
        slot: 'paused', title, tag: t('command.taskBar.run.pausedBlocked'), tagTone: 'amber',
        detail: waypoint ? t('command.taskBar.run.blockedAt', { waypoint, reason }) : t('command.taskBar.run.blocked', { reason }),
        progress: null, buttons: ['retry', 'takeControl', 'stopMission'], retryAs: 'retry',
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
      slot: 'paused', title, tag: t('command.taskBar.run.pausedOther', { owner: controlHolderName(view.owner) }), tagTone: 'amber',
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

  if (navWalking) {
    return {
      slot: 'manual', title: returningHomeTitle(robot) ?? t('command.taskBar.walkingToGoal'), tag: null, tagTone: 'neutral',
      detail: null, progress: null, buttons: ['takeControl'],
    }
  }
  if (inManualControl) {
    const owner = robot.control_owner
    const who = owner && !isMissionOwner(owner) ? controlHolderName(owner) : t('command.taskBar.operator')
    return {
      slot: 'manual', title: t('command.taskBar.manualControl', { owner: who }), tag: null, tagTone: 'neutral',
      detail: null, progress: null, buttons: ['release'],
    }
  }
  const home = starting ? null : homeTitle(robot)
  return {
    slot: 'none', title: starting ? t('command.taskBar.run.starting') : home ?? t('command.taskBar.noMission'), tag: null, tagTone: 'neutral',
    detail: null, progress: null, buttons: ['takeControl'],
  }
}

/** The paused slot for a run an E-Stop paused (0.0.33). Resume is offered
 * throughout, drawn disabled with its reason while it cannot be pressed
 * (commandPolicy), so it does not appear under the operator's thumb the moment
 * the latch clears. Take control stays beside it, except from a person. */
function estopPaused(view: NonNullable<RobotRunView>, robot: RobotState, title: string): TaskBarModel {
  const t = i18n.t
  const latched = robot.abstract_state === 'E_STOP'
  const step = view.redoStepLabel ?? view.stepLabel
  const waypoint = view.waypointId ? view.route?.waypoints.find((w) => w.waypoint_id === view.waypointId)?.label : undefined
  const detail = latched
    ? (waypoint ? t('command.taskBar.run.interruptedAt', { waypoint })
      : step ? t('command.taskBar.run.interruptedStep', { step })
      : t('command.taskBar.run.interrupted'))
    : (waypoint ? t('command.taskBar.run.resumeWalksTo', { waypoint })
      : step ? t('command.taskBar.run.resumeRedoes', { step })
      : t('command.taskBar.run.resumeNext'))
  // The control toggle as anywhere else: Release while you hold it, Take
  // control while nobody (or the mission) does, nothing from another person.
  const toggle: TaskBarButton[] = view.youHoldControl ? ['release']
    : view.owner === null || isMissionOwner(view.owner) ? ['takeControl']
    : []
  return {
    slot: 'paused', title,
    tag: latched ? t('command.taskBar.run.stoppedByEstop') : t('command.taskBar.run.pausedEstop'),
    tagTone: latched ? 'red' : 'amber',
    detail, progress: null, buttons: ['retry', ...toggle, 'stopMission'], retryAs: 'resume',
  }
}

/** "Returning home · 6.2 m to go" while a walk home (0.0.33) is under way; null
 * for any other walk. The distance is left out when the robot is not on the map. */
function returningHomeTitle(robot: RobotState): string | null {
  const goal = readNavGoal(robot.nav_goal)
  if (goal?.purpose !== 'return') return null
  if (robotPlacementProblem(robot) || !robot.position) return i18n.t('liveops.returnHome.returning')
  return i18n.t('liveops.returnHome.returningLeft', { distance: formatDistanceM(distanceM(robot.position, goal)) })
}

/** "Home · arrived 11:52": the last walk was home, it arrived, and the robot is
 * still there. The status stays on the wire until the next goal, so a robot
 * driven away since is no longer said to be home. */
function homeTitle(robot: RobotState): string | null {
  const goal = readNavGoal(robot.nav_goal)
  if (goal?.purpose !== 'return' || goal.state !== 'succeeded') return null
  if (robotPlacementProblem(robot) || !robot.position) return null
  if (distanceM(robot.position, goal) > STILL_HOME_M) return null
  return homeArrivedText(goal.updated_at)
}
