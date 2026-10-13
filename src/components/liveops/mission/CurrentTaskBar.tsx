import { useState } from 'react'
import { Anchor, Camera, Pause, Play, Repeat, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { partitionCommandButtons } from '@/liveops/commandOverflow'
import { nextWaypointInfo } from '@/liveops/waypointGeometry'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { missionProgress } from '@/types'
import type { CommandType, Mission, RobotState } from '@/types'
import { ActionButton } from './ActionButton'
import { EStopButton } from '../command/EStopButton'
import { ControlToggleButton } from '../command/ControlToggleButton'
import { SpeakButton } from '../command/SpeakButton'
import { LedButton } from '../command/LedButton'
import { PostureButtons } from '../command/PostureButtons'
import { ObstacleAvoidanceToggle } from '../command/ObstacleAvoidanceToggle'
import { CommandOverflowMenu } from '../command/CommandOverflowMenu'

/** Labels are `command.taskBar.buttons.<type>`, looked up at render. */
const BUTTONS: { type: 'PAUSE' | 'RESUME' | 'RETURN' | 'DOCK' | 'SNAPSHOT'; icon: React.ElementType }[] = [
  { type: 'PAUSE', icon: Pause },
  { type: 'RESUME', icon: Play },
  { type: 'RETURN', icon: RotateCcw },
  { type: 'DOCK', icon: Anchor },
  { type: 'SNAPSHOT', icon: Camera },
]

/** Command types demoted into the "..." menu instead of the row.
 *
 * All five are undispatchable on this build, so they were costing row width
 * that working controls needed: PAUSE/RESUME/RETURN/DOCK all require
 * `mission_executor.py`, still an empty placeholder, and SNAPSHOT needs camera
 * DDS plumbing that does not exist. None are in `WIRED_COMMAND_TYPES`, so the
 * backend rejects every one of them with a 400.
 *
 * That made them the obvious demotion: the row keeps only controls an operator
 * can actually use, which is what stopped Speak from being pushed off the end
 * (see src/liveops/commandOverflow.ts for the full history).
 *
 * **Remove an entry here the moment its command becomes wired** -- a working
 * command belongs on the row, not buried in a menu.
 */
const OVERFLOW_COMMANDS = new Set<CommandType>([
  'PAUSE', 'RESUME', 'RETURN', 'DOCK', 'SNAPSHOT',
])

/**
 * Restores the original CurrentTask bar layout (task info · ETA · next
 * waypoint · action buttons) as a single data-driven, command-wired bar —
 * folds in what used to be the separate MissionCard + CommandBar split.
 *
 * The button row (Take Control/Pause/Resume/.../E-Stop) always renders
 * regardless of whether a mission exists — only the mission-info portion is
 * conditional. Command bar and E-Stop must never collapse just because a
 * robot happens to have no active mission (docs/05-ui-ux.md §3).
 */
export function CurrentTaskBar({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const operatorName = useSessionStore((s) => s.operatorName)
  const [changeModeConfirm, setChangeModeConfirm] = useState(false)
  // Newest-first, so the first match is the most recent attempt for this robot.
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  const inManualControl = robot.abstract_state === 'MANUAL' || robot.abstract_state === 'ASSISTED'
  const { inline: inlineButtons, overflow: overflowButtons } =
    partitionCommandButtons(
      BUTTONS.map((b) => ({ ...b, label: t(`command.taskBar.buttons.${b.type}`) })),
      OVERFLOW_COMMANDS,
    )

  const missionInfo = mission ? (() => {
    const { pct } = missionProgress(mission)
    const activeWp = mission.waypoints[mission.current_waypoint_index]
    const next = nextWaypointInfo(robot, mission)
    // Two lines instead of three stat columns: the ETA and next-waypoint
    // figures were 22px numbers in their own boxes, which is where the bar's
    // width went. They read just as well inline, in tabular figures.
    return (
      <div className="rh-cmdbar__mission" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
          <span style={{
            fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.t1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }} title={mission.name}>
            {mission.name}
          </span>
          <Badge>{t(`command.taskBar.missionType.${mission.type}`)}</Badge>
        </div>
        <div style={{
          fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {t('command.taskBar.waypoint', { current: mission.current_waypoint_index + 1, total: mission.waypoints.length })}
          {activeWp?.label ? ` · ${activeWp.label}` : ''}
          {mission.eta_min != null ? ` · ${t('command.taskBar.eta', { minutes: mission.eta_min })}` : ''}
          {next ? ` · ${t('command.taskBar.next', { distance: Math.round(next.distance_m), compass: next.compass })}` : ''}
        </div>
        <div
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={t('command.taskBar.progressAria')}
          style={{ height: 3, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: color.accentSolid, borderRadius: radius.full }} />
        </div>
      </div>
    )
  })() : (
    <div className="rh-cmdbar__mission" style={{ color: color.t2, fontSize: font.size.md }}>
      {inManualControl
        ? t('command.taskBar.manualControl', { owner: robot.control_owner ?? t('command.taskBar.operator') })
        : t('command.taskBar.noMission')}
    </div>
  )

  return (
    // Height follows content (min 64px). It was a fixed 100px with a wrapping
    // button row inside, so at laptop widths the second row of buttons painted
    // over the status bar below instead of pushing it down.
    <div className="rh-cmdbar" style={{
      minHeight: 64, flexShrink: 0,
      background: color.surface, borderTop: `1px solid ${color.border}`,
      padding: `${space[2]}px ${space[4]}px`,
    }}>
    <div className="rh-cmdbar__row" style={{ minHeight: 48 }}>
      {missionInfo}


      {/* Command group; the E-Stop below is anchored separately and never
          shrinks. No button in here can be hidden by width pressure: the five
          undispatchable commands live in the "..." menu (OVERFLOW_COMMANDS),
          and if what remains still cannot fit, the row wraps rather than
          clipping or scrolling out of view.

          Both earlier layouts lost a control silently. One non-wrapping row
          needing ~1340px inside an `overflow: hidden` ancestor clipped from the
          right and took the E-Stop with it (~9px visible at 1280px, gone at
          1024px). Anchoring the E-Stop and making this group scroll
          horizontally fixed that and moved it -- Speak became the last child of
          the scroll group, so Speak disappeared instead, with no affordance
          showing the row scrolled. docs/audit/2026-08-12-ui-ux-audit.md A-01,
          and src/liveops/commandOverflow.ts. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: space[2] - 2, alignItems: 'center',
        minWidth: 0, flex: 1,
      }}>
        <ControlToggleButton
          active={inManualControl}
          takeAvailability={getCommandAvailability(robot, 'TAKE_CONTROL')}
          releaseAvailability={getCommandAvailability(robot, 'RELEASE_CONTROL')}
          onTake={() => dispatchCommand(robot.robot_id, 'TAKE_CONTROL', t('command.control.takeCommand'), { operator: operatorName })}
          onRelease={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.control.releaseCommand'))}
        />
        <PostureButtons
          robot={robot}
          onSetState={(state, label) => dispatchCommand(robot.robot_id, 'SET_STATE', label, { state })}
        />
        <ActionButton
          icon={Repeat}
          label={t('command.taskBar.switchLegConfig')}
          availability={getCommandAvailability(robot, 'CHANGE_MODE')}
          onClick={() => setChangeModeConfirm(true)}
        />
        {inlineButtons.map(({ type, label, icon }) => (
          <ActionButton
            key={type}
            icon={icon}
            label={label}
            availability={getCommandAvailability(robot, type)}
            onClick={() => dispatchCommand(robot.robot_id, type, label)}
          />
        ))}
        <ObstacleAvoidanceToggle
          robot={robot}
          onToggle={(enabled) => dispatchCommand(
            robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
            enabled ? t('command.avoidance.enableCommand') : t('command.avoidance.disableCommand'),
            { enabled },
          )}
        />
        <LedButton
          availability={getCommandAvailability(robot, 'LED_SIGNAL')}
          onToggle={(params, label) => dispatchCommand(robot.robot_id, 'LED_SIGNAL', label, params)}
        />
        <SpeakButton
          availability={getCommandAvailability(robot, 'SPEAK')}
          robotId={robot.robot_id}
          onPlay={(clip) => dispatchCommand(robot.robot_id, 'SPEAK', t('command.speak.playCommand', { label: clip.label }), { clip_id: clip.clipId, volume: clip.volume })}
          // Shout has no real streaming/mic-capture pipeline anywhere in this
          // codebase, so a real SPEAK dispatch here would always fail
          // dobot_adapter.py::speak's params["file_path"] lookup just like the
          // old mode:'play' shape did. forceMock keeps Shout on the simulated
          // ack path (still gives the operator normal command-lifecycle
          // feedback) until a real voice-streaming pipeline exists to send to.
          onShout={() => dispatchCommand(robot.robot_id, 'SPEAK', t('command.speak.shoutCommand'), { mode: 'shout' }, { forceMock: true })}
          onStop={() => dispatchCommand(robot.robot_id, 'STOP_SPEAK', t('command.speak.stopAudio'))}
        />
        {/* Last in the row deliberately: this is the one control that loses
            nothing by sitting at the end, because its contents stay reachable
            through the menu no matter how narrow the window gets. */}
        <CommandOverflowMenu
          entries={overflowButtons.map(({ type, label, icon }) => ({
            key: type,
            label,
            icon,
            availability: getCommandAvailability(robot, type),
            onClick: () => dispatchCommand(robot.robot_id, type, label),
          }))}
        />
      </div>

      {/* Anchored, never shrinks, never scrolls — see the note above. */}
      <div style={{
        display: 'flex', alignItems: 'center', flexShrink: 0,
        marginLeft: 'auto', paddingLeft: space[4], alignSelf: 'stretch',
      }}>
        <EStopButton
          state={robot.abstract_state}
          engageCommand={latestEstopCommand}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', t('command.estop.engageCommand'))}
          onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', t('command.estop.releaseCommand'))}
        />
      </div>
    </div>

      <Dialog open={changeModeConfirm} onOpenChange={setChangeModeConfirm}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.taskBar.switchLegTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t('command.taskBar.switchLegBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: space[2] }}>
            <Button onClick={() => setChangeModeConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatchCommand(robot.robot_id, 'CHANGE_MODE', t('command.taskBar.switchLegConfig'))
                setChangeModeConfirm(false)
              }}
            >
              {t('command.taskBar.switchLegConfig')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
