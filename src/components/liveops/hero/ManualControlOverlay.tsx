import i18n from '@/i18n'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, Segmented } from '@/components/kit'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import {
  DRIVE_INPUT_POLL_MS,
  DRIVE_STOP,
  keepaliveDue,
  setpointChanged,
  type DriveSetpoint,
} from '@/lib/teleop'
import { gaitPickerModelFor } from '@/liveops/postureModel'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import type { RobotState } from '@/types'
import {
  applyMouseYaw,
  hasMouseYawIntent,
  KEY_TO_DIRECTION,
  velocityFor,
  type Direction,
} from './manualControlMath'

/** `ratio` is the SDK speed_ratio (10-100, see dobot_adapter.py::
 * send_velocity_sequence) sent with every drive burst -- previously this
 * picker only scaled the local vx/vy/vyaw clamp and had no effect on the
 * real robot's SDK-side speed at all. 'Normal' keeps the prior default
 * (DRIVE_SPEED_RATIO = 60) so existing behavior at the default tier is
 * unchanged.
 *
 * `label` is the English command label sent with SET_SPEED_RATIO (it reaches
 * the backend); `labelKey` is what the picker shows, in the current language. */
const SPEED_OPTIONS = [
  { label: 'Slow', labelKey: 'liveops.manual.speedSlow', vMax: 0.3, yawMax: 0.35, ratio: 30 },
  { label: 'Normal', labelKey: 'liveops.manual.speedNormal', vMax: 0.6, yawMax: 0.6, ratio: 60 },
  { label: 'Fast', labelKey: 'liveops.manual.speedFast', vMax: 1.0, yawMax: 0.8, ratio: 100 },
] as const

const AUTO_RELEASE_SECONDS = 60

/**
 * Manual/assisted driving surface (docs/01-prd.md §16.3 teleoperation, §16.4
 * control ownership) — keyboard + mouse only, no touch/drag virtual joystick
 * (this is a web app, per product direction). Mounted only while the
 * selected robot is under this operator's manual control; unmounting (view
 * switch, control released) tears down all listeners automatically.
 *
 * Driving is deliberately NOT continuous streaming — the vendored SDK's
 * velocity API is segment-based (ExecuteSequence with timed bursts), not a
 * live per-frame setpoint (LIVEOPS_AUDIT_TRACKER.md SDK verification notes).
 * Holding a key/button re-issues a short burst every DRIVE_TICK_MS; release
 * sends one explicit zero-velocity burst to stop cleanly.
 *
 * Mouse-yaw steering (horizontal mouse movement added on top of Q/E) only
 * accumulates while the right mouse button is held -- an explicit "engage
 * steering" gesture. Without that gate, moving the cursor to click this
 * panel's own Gait/Speed-cap/Obstacle-Avoidance buttons would itself issue
 * real yaw commands to the robot, and incidental mouse movement would keep
 * the auto-release deadman below from ever reaching zero.
 */
export function ManualControlOverlay({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const driveRobot = useLiveOpsStore((s) => s.driveRobot)
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const [heldDirs, setHeldDirs] = useState<Set<Direction>>(new Set())
  const [speedIdx, setSpeedIdx] = useState(1)
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RELEASE_SECONDS)
  const heldRef = useRef<Set<Direction>>(new Set())
  const speedIdxRef = useRef(speedIdx)
  speedIdxRef.current = speedIdx
  // Accumulated mouse movementX (px) since the last drive tick -- reset to 0
  // every tick once consumed, so it never grows unbounded.
  const mouseYawAccumRef = useRef(0)
  // Mouse-steer must be explicitly engaged (right mouse button held) --
  // otherwise every incidental cursor movement (e.g. reaching for this
  // panel's own Gait/Speed-cap/Obstacle-Avoidance buttons) would emit a real
  // VELOCITY_SEQUENCE yaw burst to the robot and keep the auto-release
  // deadman from ever firing.
  const steeringRef = useRef(false)
  const [steering, setSteering] = useState(false)
  // True only when an operator actually took control. See the auto-release
  // effect below for why abstract_state is not a safe proxy for this.
  // Never for a `mission:<run_id>` owner: see operatorHoldsControl.
  const holdsControl = operatorHoldsControl(robot)
  const gaitPicker = gaitPickerModelFor(robot)

  const press = (dir: Direction) => {
    if (heldRef.current.has(dir)) return
    heldRef.current.add(dir)
    setHeldDirs(new Set(heldRef.current))
  }
  const release = (dir: Direction) => {
    if (!heldRef.current.has(dir)) return
    heldRef.current.delete(dir)
    setHeldDirs(new Set(heldRef.current))
    if (heldRef.current.size === 0) driveRobot(robot.robot_id, 0, 0, 0)
  }
  /** Drop every held direction and command a stop. Used wherever input can be
   * lost without a matching keyup. Always sends the zero-velocity burst, even
   * when nothing was held, so the robot is stopped rather than assumed
   * stopped. */
  const releaseAllHeld = () => {
    heldRef.current.clear()
    setHeldDirs(new Set())
    driveRobot(robot.robot_id, 0, 0, 0)
  }

  // Keyboard: hold-to-move, ignores OS key-repeat, releases on keyup.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null
      // SELECT was missing: typing into a dropdown moved the robot.
      return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA'
        || el?.tagName === 'SELECT' || el?.isContentEditable
    }
    /** Space and Enter activate whatever control has focus. Swallowing Space
     * globally meant no focused button in the app could be activated by
     * keyboard while this overlay was mounted — including "Engage E-Stop".
     * docs/audit/2026-08-12-ui-ux-audit.md A-11. */
    function isActivatableTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null
      if (!el) return false
      return !!el.closest?.('button, a[href], [role="button"], [role="menuitem"], [role="tab"], summary')
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.repeat) return
      // Never claim a browser/OS chord (Ctrl+W, Cmd+D, Alt+Tab…). These used to
      // fall straight through to the direction map and drive the robot
      // alongside whatever the shortcut did.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === ' ' || e.key === 'Spacebar') {
        // Halt-on-space stays, but only when the operator is not focused on a
        // control that Space is supposed to activate.
        if (isActivatableTarget(e.target)) return
        e.preventDefault()
        releaseAllHeld()
        return
      }
      const dir = KEY_TO_DIRECTION[e.key]
      if (!dir) return
      e.preventDefault()
      press(dir)
    }
    function onKeyUp(e: KeyboardEvent) {
      const dir = KEY_TO_DIRECTION[e.key]
      if (!dir) return
      release(dir)
    }
    // Mouse: horizontal movement contributes a continuous yaw-steering input
    // on top of Q/E, but ONLY while the right mouse button is held (a
    // deliberate "engage steering" action -- see steeringRef doc above).
    // movementX (relative delta) is used rather than clientX so no pointer
    // lock is required.
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 2) return
      e.preventDefault()
      steeringRef.current = true
      setSteering(true)
    }
    function disengageSteering() {
      if (!steeringRef.current) return
      steeringRef.current = false
      setSteering(false)
      mouseYawAccumRef.current = 0
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button !== 2) return
      disengageSteering()
    }
    function onMouseMove(e: MouseEvent) {
      if (!steeringRef.current) return
      mouseYawAccumRef.current += e.movementX
    }
    // Right-click is repurposed as the steering trigger while this overlay
    // is mounted -- suppress the OS/browser context menu it would otherwise
    // open, and drop steering if focus leaves the window mid-hold (alt-tab,
    // etc.) so it can never get stuck "on".
    function onContextMenu(e: MouseEvent) {
      e.preventDefault()
    }
    /**
     * Any loss of keyboard input must stop the robot.
     *
     * `blur` previously cleared only mouse steering, leaving `heldRef`
     * populated: alt-tab while holding W and the keyup never arrived, so the
     * drive loop kept issuing forward bursts *and* kept topping the
     * auto-release deadman back up — a backgrounded tab could drive the robot
     * indefinitely with the operator's hands off the keyboard.
     * `visibilitychange` and `pagehide` cover the cases blur does not (tab
     * switch, OS window manager, navigation away).
     * docs/audit/2026-08-12-ui-ux-audit.md A-09.
     */
    function onWindowBlur() {
      disengageSteering()
      releaseAllHeld()
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') onWindowBlur()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('pagehide', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('pagehide', onWindowBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // Unmounting is itself a loss of the drive surface — stop the robot
      // rather than leaving it moving under a control that no longer exists.
      releaseAllHeld()
      steeringRef.current = false
      mouseYawAccumRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot.robot_id])

  // Drive loop. Samples held keys/mouse frequently but only SENDS when the
  // velocity actually changes, plus a slow keepalive while driving continues.
  //
  // It used to re-issue a bounded burst every 250 ms. Measured on hardware, that
  // cost the robot a settle on every burst and half its achievable speed --
  // every RPC boundary settles, while step boundaries inside one sequence are
  // free. The bridge now holds one long sequence (velocity_driver.py) and this
  // publishes intent, so polling fast is free and re-sending an unchanged
  // setpoint costs the robot nothing. See @/lib/teleop.
  //
  // The keepalive is a liveness signal, not motion: the bridge brakes if
  // setpoints stop arriving, so a dropped uplink cannot leave the robot driving
  // for an absent operator.
  //
  // Auto-release stays pinned to the SAME condition as before -- real input, so
  // sub-threshold mouse jitter can neither drive the robot nor stall the deadman.
  useEffect(() => {
    let lastSent: DriveSetpoint | null = null
    let lastSentAt = 0

    const t = setInterval(() => {
      const mouseDeltaPx = mouseYawAccumRef.current
      mouseYawAccumRef.current = 0
      const mouseYawIntent = hasMouseYawIntent(mouseDeltaPx)
      const hasInput = heldRef.current.size > 0 || mouseYawIntent

      const { vMax, yawMax, ratio } = SPEED_OPTIONS[speedIdxRef.current]
      const { vx, vy, vyaw } = velocityFor(heldRef.current, vMax, yawMax)
      const next: DriveSetpoint = hasInput
        ? { vx, vy, vyaw: applyMouseYaw(vyaw, mouseYawIntent ? mouseDeltaPx : 0, yawMax) }
        : DRIVE_STOP

      // Once stopped, go quiet: an idle robot needs no keepalive, and the
      // watchdog only guards a drive that is actually held.
      const idle = !hasInput && (lastSent === null || setpointChanged(lastSent, DRIVE_STOP) === false)
      const now = Date.now()
      const due = setpointChanged(lastSent, next) || (!idle && keepaliveDue(lastSentAt, now))
      if (due) {
        driveRobot(robot.robot_id, next.vx, next.vy, next.vyaw, ratio)
        lastSent = next
        lastSentAt = now
      }

      if (hasInput) setSecondsLeft(AUTO_RELEASE_SECONDS)
    }, DRIVE_INPUT_POLL_MS)
    return () => clearInterval(t)
  }, [robot.robot_id, driveRobot])

  // Auto-release timeout (docs/01-prd.md §16.3: teleoperation deadman/timeout
  // policy) — ticks every second regardless; the drive loop above keeps
  // resetting it to full while there's actual input, so it only reaches zero
  // during genuine inactivity.
  //
  // Gated on actual control ownership, not on abstract_state. A wheel robot
  // reports MANUAL/ASSISTED merely for being upright, because `wheel_loco` is
  // simultaneously its upright state and its drive state. Keying the deadman off
  // state alone therefore meant pressing Stand mounted this overlay and then
  // fired RELEASE_CONTROL a minute later, lowering the robot unprompted. An
  // operator-initiated TAKE_CONTROL still auto-releases as designed.
  useEffect(() => {
    if (!holdsControl) return
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', i18n.t('misc.cmdReleaseAuto'))
          return AUTO_RELEASE_SECONDS
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot.robot_id, holdsControl])

  // Keycaps: a raised face (inset bottom edge) that sinks and turns blue while
  // held, so the pad reads as the keyboard it mirrors.
  const keyStyle = (dir: Direction): React.CSSProperties => {
    const held = heldDirs.has(dir)
    return {
      width: 44, height: 40, borderRadius: radius.sm + 1, flexShrink: 0,
      background: held ? color.blueBg : color.card,
      border: `1px solid ${held ? color.blueBorder : color.border}`,
      boxShadow: held ? 'none' : `inset 0 -2px 0 ${color.borderLt}`,
      transform: held ? 'translateY(1px)' : undefined,
      color: held ? color.blue : color.t1, fontFamily: font.family,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
      cursor: 'pointer', userSelect: 'none', padding: 0,
    }
  }

  function key(dir: Direction, letter: string, hint: string) {
    return (
      <button
        style={keyStyle(dir)}
        onMouseDown={() => press(dir)}
        onMouseUp={() => release(dir)}
        onMouseLeave={() => release(dir)}
        aria-label={t('liveops.manual.keyAria', { hint, letter })}
      >
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, lineHeight: 1 }}>{letter}</span>
        <span style={{ fontSize: font.size['2xs'], color: heldDirs.has(dir) ? color.blue : color.t3, lineHeight: 1 }}>{hint}</span>
      </button>
    )
  }

  const label: React.CSSProperties = { fontSize: font.size.sm, color: color.t3 }

  return (
    <section
      aria-label={t('liveops.manual.title')}
      className="rh-panel rh-panel--float"
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
        borderRadius: radius.lg + 2, padding: space[3] + 2,
        display: 'flex', flexDirection: 'column', gap: space[3],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.blue }}>
          {robot.abstract_state === 'ASSISTED' ? t('liveops.manual.assistedTitle') : t('liveops.manual.title')}
        </span>
        {holdsControl && (
          <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
            {t('liveops.manual.releasesIn', { seconds: secondsLeft })}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: font.size.sm, color: steering ? color.blue : color.t3 }}>
          {steering ? t('liveops.manual.steering') : t('liveops.manual.holdToSteer')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: space[5], alignItems: 'flex-start' }}>
        {/* QWE over ASD, with the bottom row shifted right as on a physical
            keyboard, so S sits between W and E's columns the way the fingers
            expect. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {key('turnLeft', 'Q', t('liveops.manual.keyTurn'))}
            {key('forward', 'W', t('liveops.manual.keyForward'))}
            {key('turnRight', 'E', t('liveops.manual.keyTurn'))}
          </div>
          <div style={{ display: 'flex', gap: 6, paddingLeft: 14 }}>
            {key('strafeLeft', 'A', t('liveops.manual.keyLeft'))}
            {key('back', 'S', t('liveops.manual.keyBack'))}
            {key('strafeRight', 'D', t('liveops.manual.keyRight'))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[3], minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
            <span style={label}>{t('liveops.manual.gait')}</span>
            {gaitPicker.kind === 'toggle' ? (
              <Segmented
                label={t('liveops.manual.gait')}
                value={gaitPicker.options.find((o) => o.active)?.gait ?? ''}
                onChange={(gait) => dispatchCommand(robot.robot_id, 'SET_GAIT', t('misc.cmdSetGait'), { gait })}
                options={gaitPicker.options.map((o) => ({ value: o.gait, label: o.label }))}
              />
            ) : (
              <span style={{ fontSize: font.size.md, color: color.t1, fontWeight: font.weight.medium }}>
                {gaitPicker.options[0]?.label}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
            <span style={label}>
              {t('liveops.manual.speed')} <span style={{ color: color.t2, fontVariantNumeric: 'tabular-nums' }}>{t('liveops.manual.speedLive', { ratio: robot.speed_ratio })}</span>
            </span>
            <Segmented
              label={t('liveops.manual.speedCap')}
              value={String(speedIdx)}
              onChange={(v) => {
                const i = Number(v)
                setSpeedIdx(i)
                // Persist the base speed_ratio -- VELOCITY_SEQUENCE's own
                // speed_ratio param only overrides temporarily for that one
                // burst and reverts once it completes (high_level.md §2.6),
                // so without this the picker had no observable, lasting
                // effect on the robot's actual speed setting.
                dispatchCommand(robot.robot_id, 'SET_SPEED_RATIO', t('misc.cmdSetSpeed', { speed: t(SPEED_OPTIONS[i].labelKey) }), { ratio: SPEED_OPTIONS[i].ratio })
              }}
              options={SPEED_OPTIONS.map((opt, i) => ({ value: String(i), label: t(opt.labelKey) }))}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
            <span style={label}>{t('liveops.manual.avoidance')}</span>
            <Button
              size="sm"
              active={robot.obstacle_avoidance}
              onClick={() => dispatchCommand(
                robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
                robot.obstacle_avoidance ? t('misc.cmdAvoidanceOff') : t('misc.cmdAvoidanceOn'),
                { enabled: !robot.obstacle_avoidance },
              )}
              style={robot.obstacle_avoidance ? { color: color.green, borderColor: color.greenBorder, background: color.greenBg } : undefined}
            >
              {robot.obstacle_avoidance ? t('fleet.overview.on') : t('common.off')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
