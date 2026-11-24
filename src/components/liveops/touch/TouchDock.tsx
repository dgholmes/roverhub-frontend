import { useState } from 'react'
import { Anchor, Maximize2, Minimize2, MoreHorizontal, OctagonX, Pause, Play, Repeat, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button, IconButton } from '@/components/kit'
import { color, radius, space } from '@/design-system/tokens'
import { ActionButton, commandButtonStyle } from '@/components/liveops/mission/ActionButton'
import { ControlToggleButton } from '@/components/liveops/command/ControlToggleButton'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { LedButton } from '@/components/liveops/command/LedButton'
import { ObstacleAvoidanceToggle } from '@/components/liveops/command/ObstacleAvoidanceToggle'
import { PostureButtons } from '@/components/liveops/command/PostureButtons'
import { SpeakButton } from '@/components/liveops/command/SpeakButton'
import { useOperatorName } from '@/lib/auth/useAccount'
import { UNWIRED_COMMANDS, deckEntries, type DeckEntry, type UnwiredCommand } from '@/liveops/commandDeck'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { legConfigLabelKey, legConfigOf, switchLegBodyKey, switchLegLabelKey } from '@/liveops/legConfig'
import type { RobotRunView } from '@/liveops/robotRun'
import { taskBarModel, type TaskBarModel } from '@/liveops/taskBar'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { CommandType, RobotState } from '@/types'
import { TOUCH_TARGET_CSS } from './TouchTopStrip'

/**
 * The touch shell's persistent bottom dock: the operator controls, the "..."
 * sheet for what width demoted, and the E-Stop anchored at the right.
 *
 * It renders `liveops/commandDeck.ts` -- the same declaration the desktop
 * command bar renders -- so a control added to one shell cannot go missing
 * from the other (design anti-goal #2). `CurrentTaskBar.tsx` is the worked
 * example; this file is its counterpart, with its own `deck-controls` region
 * and its own two confirmations.
 *
 * The dock never collapses. Immersive mode hides the shell's own chrome above
 * it (TouchLiveOps), and the E-Stop stays mounted throughout, because the one
 * state in which a stop control may not be on screen does not exist.
 */

/** Dock height: 72 px on a tablet, 64 px on a phone (design §7.2). */
export function touchDockHeight(big: boolean): number {
  return big ? 72 : 64
}

/** Icons for the plain one-command entries, as in `CurrentTaskBar`. The labels
 * are `command.taskBar.buttons.<type>`. */
const COMMAND_ICONS: Record<UnwiredCommand, React.ElementType> = {
  PAUSE: Pause,
  RETURN: RotateCcw,
  DOCK: Anchor,
}

const isUnwired = (type: CommandType): type is UnwiredCommand =>
  (UNWIRED_COMMANDS as readonly CommandType[]).includes(type)

/* ── deck-controls:begin ─────────────────────────────────────────────────────
 *
 * Every operator control this dock renders is declared in
 * `src/liveops/commandDeck.ts` and drawn here, from the one `switch (entry.kind)`
 * below -- the same arrangement as `CurrentTaskBar.tsx`'s region of the same
 * name. `TouchLiveOps.test.tsx` reads this region and fails when a `DeckKind`
 * has no `case`, so a control added to the deck cannot reach the desk and miss
 * the operator's hands.
 *
 * Outside the region, each for the reason `commandDeck.test.ts` records: the
 * E-Stop (anchored, never gated by control ownership, drawn by each shell's own
 * chrome), SpeedControl (a local setting, and on touch it belongs to the drive
 * strip -- Task 13) and the overflow sheet (the presentation of a tier, not a
 * control). Both confirmations stay with this component, which owns their state.
 */

/** What a deck entry needs beyond itself -- the touch counterpart of
 * `CurrentTaskBar`'s `DeckContext`, with the same two dialog openers. */
interface TouchDeckContext {
  robot: RobotState
  run: RobotRunView
  model: TaskBarModel
  /** Opens the leg-switch confirmation (the dialog lives in TouchDock). */
  onLegSwitch: () => void
  legSwitchLabel: string
  /** Opens the Stop mission confirmation (the dialog lives in TouchDock). */
  onStopMission: () => void
}

/** One deck entry, drawn. The only place a `DeckKind` becomes a control here. */
function TouchDeckControl({ entry, ctx }: { entry: DeckEntry; ctx: TouchDeckContext }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const operatorName = useOperatorName()
  const { robot, run, model } = ctx
  const avail = (type: CommandType) => getCommandAvailability(robot, type, run)

  switch (entry.kind) {
    case 'control':
      return (
        <ControlToggleButton
          active={model.buttons.includes('release')}
          takeAvailability={avail('TAKE_CONTROL')}
          releaseAvailability={avail('RELEASE_CONTROL')}
          onTake={() => dispatchCommand(robot.robot_id, 'TAKE_CONTROL', t('command.control.takeCommand'), { operator: operatorName })}
          onRelease={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.control.releaseCommand'))}
        />
      )

    case 'releaseResume':
      return (
        <ActionButton
          icon={Play}
          tone="blue"
          label={t('command.taskBar.run.releaseResume')}
          availability={avail('RELEASE_CONTROL')}
          onClick={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.taskBar.run.releaseResumeCommand'), { resume_run: true })}
        />
      )

    case 'retry':
      if (!run) return null
      return (
        <ActionButton
          icon={Play}
          tone="blue"
          label={t('command.taskBar.run.retry')}
          availability={avail('RESUME')}
          onClick={() => dispatchCommand(robot.robot_id, 'RESUME', t('command.taskBar.run.retryCommand'), { run_id: run.runId })}
        />
      )

    case 'stopMission':
      return (
        <ActionButton
          icon={OctagonX}
          label={t('command.taskBar.run.stopMission')}
          availability={avail('STOP_MISSION')}
          onClick={ctx.onStopMission}
        />
      )

    case 'posture':
      return (
        <PostureButtons
          robot={robot}
          run={run}
          onSetState={(state, label) => dispatchCommand(robot.robot_id, 'SET_STATE', label, { state })}
        />
      )

    case 'legSwitch':
      return (
        <ActionButton
          icon={Repeat}
          label={ctx.legSwitchLabel}
          availability={avail('CHANGE_MODE')}
          onClick={ctx.onLegSwitch}
        />
      )

    case 'avoidance':
      return (
        <ObstacleAvoidanceToggle
          robot={robot}
          onToggle={(enabled) => dispatchCommand(
            robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
            enabled ? t('command.avoidance.enableCommand') : t('command.avoidance.disableCommand'),
            { enabled },
          )}
        />
      )

    case 'led':
      return (
        <LedButton
          availability={avail('LED_SIGNAL')}
          onToggle={(params, label) => dispatchCommand(robot.robot_id, 'LED_SIGNAL', label, params)}
        />
      )

    case 'speak':
      return (
        <SpeakButton
          availability={avail('SPEAK')}
          stopAvailability={avail('STOP_SPEAK')}
          robotId={robot.robot_id}
          onPlay={(clip) => dispatchCommand(robot.robot_id, 'SPEAK', t('command.speak.playCommand', { label: clip.label }), { clip_id: clip.clipId, volume: clip.volume })}
          onStop={() => dispatchCommand(robot.robot_id, 'STOP_SPEAK', t('command.speak.stopAudio'))}
        />
      )

    case 'command': {
      if (!entry.type || !isUnwired(entry.type)) return null
      const type = entry.type
      const label = t(`command.taskBar.buttons.${type}`)
      return (
        <ActionButton
          icon={COMMAND_ICONS[type]}
          label={label}
          availability={avail(type)}
          onClick={() => dispatchCommand(robot.robot_id, type, label)}
        />
      )
    }
  }
}

/* ── deck-controls:end ───────────────────────────────────────────────────── */

/** The "..." sheet. Unlike the desktop's `CommandOverflowMenu`, which lists
 * one-command rows, this draws the demoted controls themselves: at phone width
 * the overflow tier holds Speak, LED, avoidance, the leg switch and Stop
 * mission, none of which is a plain command button. */
function OverflowSheet({ entries, ctx, onClose }: {
  entries: DeckEntry[]; ctx: TouchDeckContext; onClose: () => void
}) {
  return (
    <div
      data-touch-more=""
      role="menu"
      style={{
        position: 'absolute', bottom: '100%', right: space[3], left: space[3],
        marginBottom: space[2], padding: space[3], zIndex: 60,
        display: 'flex', flexWrap: 'wrap', gap: space[2],
        background: color.elevated, border: `1px solid ${color.border}`,
        borderRadius: radius.md,
      }}
      onClick={onClose}
    >
      {entries.map((entry) => <TouchDeckControl key={entry.key} entry={entry} ctx={ctx} />)}
    </div>
  )
}

export function TouchDock({ robot, run, big, driving, immersive, onToggleImmersive }: {
  robot: RobotState
  run: RobotRunView
  big: boolean
  /** True while the operator holds control. The corner stop is mounted then,
   * so this dock gives up its own rather than showing a second one, and its
   * set narrows to leave room beside the sticks (design §7.2.5). */
  driving: boolean
  immersive: boolean
  onToggleImmersive: () => void
}) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  const [more, setMore] = useState(false)
  const [stopConfirm, setStopConfirm] = useState(false)
  const [legConfirm, setLegConfirm] = useState(false)

  const h = touchDockHeight(big)
  const legConfig = legConfigOf(robot)
  const switchLegLabel = t(switchLegLabelKey(legConfig))
  const model = taskBarModel(run, robot)
  // Width, not device: a tablet dock has the room the desktop bar has.
  // Driving narrows the set whatever the screen: the sticks own the bottom
  // corners, so only the few controls an operator reaches for mid-drive stay
  // out of the overflow sheet.
  const entries = deckEntries(model, robot, big && !driving ? 'wide' : 'narrow')
  const ctx: TouchDeckContext = {
    robot, run, model,
    legSwitchLabel: switchLegLabel,
    onLegSwitch: () => setLegConfirm(true),
    onStopMission: () => setStopConfirm(true),
  }
  const primary = entries.filter((e) => e.tier === 'primary')
  const overflow = entries.filter((e) => e.tier === 'overflow')

  return (
    <div
      data-touch-dock=""
      className="rh-touchdeck"
      style={{
        ['--rh-touch-target' as string]: `${big ? 48 : 44}px`,
        position: 'relative', flexShrink: 0, height: h,
        display: 'flex', alignItems: 'center', gap: space[2],
        padding: `0 ${space[3]}px`,
        background: color.surface, borderTop: `1px solid ${color.border}`,
      } as React.CSSProperties}
    >
      <style>{TOUCH_TARGET_CSS}</style>

      {/* The controls. Scrolls rather than wrapping: the dock's height is
          fixed, so a wrapped row would be clipped instead of pushing anything
          down -- the failure mode docs/audit/2026-08-12-ui-ux-audit.md A-01
          describes for the desktop bar. */}
      <div
        data-touch-deck=""
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: space[2],
          flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
        {primary.map((entry) => <TouchDeckControl key={entry.key} entry={entry} ctx={ctx} />)}
        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setMore((o) => !o)}
            aria-expanded={more}
            aria-haspopup="menu"
            title={t('command.overflow.moreTitle', { count: overflow.length })}
            style={{ ...commandButtonStyle(), cursor: 'pointer', background: more ? color.cardHover : color.card }}
          >
            <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
            <span>{t('command.overflow.more')}</span>
          </button>
        )}
      </div>

      {more && <OverflowSheet entries={overflow} ctx={ctx} onClose={() => setMore(false)} />}

      {/* Immersive mode is a CSS collapse of the shell's own chrome, not the
          Fullscreen API: iPhone Safari has none, and `useFullscreenToggle`
          silently does nothing there. The control lives in the dock rather
          than the strip, because the strip is what collapses. */}
      <IconButton
        icon={immersive ? Minimize2 : Maximize2}
        label={immersive ? t('liveops.camera.exitFullscreen') : t('liveops.camera.fullscreen')}
        aria-pressed={immersive}
        onClick={onToggleImmersive}
        style={{ flexShrink: 0 }}
      />

      {/* Anchored at the end, never shrinks, never scrolls, never gated by
          control ownership -- and mounted in every state of this shell,
          immersive included, EXCEPT while driving, when `TouchLiveOps` mounts
          the corner stop instead. `driving` is the same `operatorHoldsControl`
          predicate that mounts that one, read once in the shell, so the two
          cannot disagree and leave no stop on screen. */}
      {!driving && (
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, alignSelf: 'stretch', paddingLeft: space[2] }}>
        <EStopButton
          state={robot.abstract_state}
          engageCommand={latestEstopCommand}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', t('command.estop.engageCommand'))}
          onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', t('command.estop.releaseCommand'))}
        />
      </div>
      )}

      {/* A stopped run cannot be resumed -- same confirmation as the desktop bar. */}
      <Dialog open={stopConfirm} onOpenChange={setStopConfirm}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.taskBar.run.stopTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>{t('command.taskBar.run.stopBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: space[2] }}>
            <Button onClick={() => setStopConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (run && (run.phase === 'running' || run.phase === 'paused')) {
                  dispatchCommand(robot.robot_id, 'STOP_MISSION', t('command.taskBar.run.stopMission'), { run_id: run.runId })
                }
                setStopConfirm(false)
              }}
            >
              {t('command.taskBar.run.stopMission')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CHANGE_MODE is a blind toggle on the SDK side; while the reading is
          'unknown' the body copy says so rather than naming a target. */}
      <Dialog open={legConfirm} onOpenChange={setLegConfirm}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.taskBar.switchLegTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t(switchLegBodyKey(legConfig), {
                current: t(legConfigLabelKey(legConfig)),
                target: t(legConfigLabelKey(legConfig === 'normal' ? 'x' : 'normal')),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: space[2] }}>
            <Button onClick={() => setLegConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatchCommand(robot.robot_id, 'CHANGE_MODE', switchLegLabel)
                setLegConfirm(false)
              }}
            >
              {switchLegLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
