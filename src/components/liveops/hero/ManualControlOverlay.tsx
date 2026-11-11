import i18n from '@/i18n'
import { useEffect, useReducer, useRef, useState } from 'react'
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
import { speedPctOf, useDriveSpeed } from '@/store/useDriveSpeedStore'
import type { RobotState } from '@/types'
import {
  applyMouseYaw,
  hasMouseYawIntent,
  FULL_STICK_TURN_RADPS,
  KEY_TO_DIRECTION,
  tapReleaseDelayMs,
  quantizeYaw,
  steeringChangeHeld,
  steeringOnlyChange,
  velocityFor,
  type Direction,
} from './manualControlMath'
import { applyLookDelta, LOOK_NEUTRAL, lookTargetDue, type LookTarget } from './lookAround'
import { driveDirectionsDuringLook } from './lookMode'
import { isSpaceKey, spaceHoldFollowUp } from './spaceStop'
import {
  CONFIRM_TIMEOUT_MS, ESTOP_HOLD_MS, estopHoldReducer, initialEstopHoldState,
} from '@/liveops/estopHold'

/** Toggles game-style mouse steering. Clear of WASD/QE, Space, Esc and P. */
const GAME_MODE_KEY = 'm'

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
 * Mouse-yaw steering (horizontal mouse movement added on top of Q/E) works
 * only in game mode, toggled with M: the cursor is hidden and locked to the
 * camera view, as in a game. Outside it the mouse is just a pointer -- moving
 * it to click this panel's own Gait/Avoidance buttons must not turn the
 * robot, nor keep the auto-release deadman below from reaching zero. Losing
 * the lock (Esc, Alt-Tab) stops the robot.
 *
 * Holding the middle button looks around: the robot stops, keys drive
 * nothing, and the mouse tilts and twists the standing body instead
 * (lookAround.ts). Releasing returns it to neutral and held keys drive again.
 *
 * Space taps stop; held for ESTOP_HOLD_MS it fires the E-Stop (spaceStop.ts).
 *
 * Speed is the command bar's setting (SpeedControl), shown here read-only. A
 * held key is full stick and every DRIVE carries the chosen speed %, which the
 * robot caps motion at -- as the handheld remote works (useDriveSpeedStore).
 * docs/superpowers/specs/2026-10-30-manual-control-v2-look-around-and-joy-design.md
 */
export function ManualControlOverlay({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const driveRobot = useLiveOpsStore((s) => s.driveRobot)
  const lookRobot = useLiveOpsStore((s) => s.lookRobot)
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const panelRef = useRef<HTMLElement>(null)
  const [heldDirs, setHeldDirs] = useState<Set<Direction>>(new Set())
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RELEASE_SECONDS)
  const heldRef = useRef<Set<Direction>>(new Set())
  const speedPct = speedPctOf(useDriveSpeed(robot.robot_id))
  const speedPctRef = useRef(speedPct)
  speedPctRef.current = speedPct
  /** Every DRIVE carries the speed %, stops included: the bridge sets the
   * robot's speed % from each one. */
  const stopRobot = () => driveRobot(robot.robot_id, 0, 0, 0, speedPctRef.current)
  // Accumulated mouse movementX (px) since the last drive tick -- reset to 0
  // every tick once consumed, so it never grows unbounded.
  const mouseYawAccumRef = useRef(0)
  // Game mode: true only while the browser actually holds the pointer lock.
  // Never set optimistically, so a refused lock reads as "off".
  const gameModeRef = useRef(false)
  const [gameMode, setGameMode] = useState(false)
  const lookingRef = useRef(false)
  const [looking, setLooking] = useState(false)
  const lookTargetRef = useRef<LookTarget>(LOOK_NEUTRAL)
  const [lookTarget, setLookTarget] = useState<LookTarget>(LOOK_NEUTRAL)
  const [spaceHold, dispatchSpace] = useReducer(estopHoldReducer, initialEstopHoldState)
  const spaceDownRef = useRef(false)
  const [spaceDown, setSpaceDown] = useState(false)
  // True only when an operator actually took control. See the auto-release
  // effect below for why abstract_state is not a safe proxy for this.
  // Never for a `mission:<run_id>` owner: see operatorHoldsControl.
  const holdsControl = operatorHoldsControl(robot)
  const gaitPicker = gaitPickerModelFor(robot)

  // When each held key went down, and taps waiting out MIN_KEY_HOLD_MS.
  const pressedAtRef = useRef(new Map<Direction, number>())
  const tapTimersRef = useRef(new Map<Direction, ReturnType<typeof setTimeout>>())
  const cancelTapRelease = (dir: Direction) => {
    const timer = tapTimersRef.current.get(dir)
    if (timer === undefined) return
    clearTimeout(timer)
    tapTimersRef.current.delete(dir)
  }

  const press = (dir: Direction) => {
    // Pressed again while a tap is still being held out: keep holding.
    cancelTapRelease(dir)
    if (heldRef.current.has(dir)) return
    pressedAtRef.current.set(dir, Date.now())
    heldRef.current.add(dir)
    setHeldDirs(new Set(heldRef.current))
  }
  /** A key coming up: released now, or once a short tap has been held for
   * MIN_KEY_HOLD_MS. */
  const releaseKey = (dir: Direction) => {
    const pressedAt = pressedAtRef.current.get(dir)
    const delay = pressedAt === undefined ? 0 : tapReleaseDelayMs(pressedAt, Date.now())
    if (delay === 0) {
      release(dir)
      return
    }
    cancelTapRelease(dir)
    tapTimersRef.current.set(dir, setTimeout(() => {
      tapTimersRef.current.delete(dir)
      release(dir)
    }, delay))
  }
  const release = (dir: Direction) => {
    if (!heldRef.current.has(dir)) return
    heldRef.current.delete(dir)
    setHeldDirs(new Set(heldRef.current))
    if (heldRef.current.size === 0) stopRobot()
  }
  /** Drop every held direction and command a stop. Used wherever input can be
   * lost without a matching keyup. Always sends the zero-velocity burst, even
   * when nothing was held, so the robot is stopped rather than assumed
   * stopped. */
  const releaseAllHeld = () => {
    tapTimersRef.current.forEach(clearTimeout)
    tapTimersRef.current.clear()
    heldRef.current.clear()
    setHeldDirs(new Set())
    stopRobot()
  }
  /** Leave look-around: back to neutral, and held keys drive again. Safe to
   * call when not looking. */
  const endLook = () => {
    if (!lookingRef.current) return
    lookingRef.current = false
    setLooking(false)
    lookTargetRef.current = LOOK_NEUTRAL
    setLookTarget(LOOK_NEUTRAL)
    lookRobot(robot.robot_id, LOOK_NEUTRAL)
  }
  const releaseSpace = () => {
    if (!spaceDownRef.current) return
    spaceDownRef.current = false
    setSpaceDown(false)
    dispatchSpace({ type: 'RELEASE' })
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
      if (isSpaceKey(e.key)) {
        // Space stops, and held on fires the E-Stop. It still activates a
        // focused control instead -- except in game mode, where focus was
        // dropped on entry and Space must always mean stop.
        if (!gameModeRef.current && isActivatableTarget(e.target)) return
        e.preventDefault()
        releaseAllHeld()
        if (!spaceDownRef.current) {
          spaceDownRef.current = true
          setSpaceDown(true)
          dispatchSpace({ type: 'PRESS' })
        }
        return
      }
      if (e.key.toLowerCase() === GAME_MODE_KEY) {
        e.preventDefault()
        if (document.pointerLockElement) {
          document.exitPointerLock()
        } else {
          // Drop focus so Space cannot activate a button behind the lock.
          ;(document.activeElement as HTMLElement | null)?.blur?.()
          const target = panelRef.current?.parentElement
          // Chrome returns a promise that rejects when the lock is refused;
          // pointerlockchange simply never fires, and game mode stays off.
          const request = target?.requestPointerLock() as unknown as Promise<void> | undefined
          request?.catch?.(() => {})
        }
        return
      }
      const dir = KEY_TO_DIRECTION[e.key]
      if (!dir) return
      e.preventDefault()
      press(dir)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (isSpaceKey(e.key)) {
        releaseSpace()
        return
      }
      const dir = KEY_TO_DIRECTION[e.key]
      if (!dir) return
      releaseKey(dir)
    }
    function onPointerLockChange() {
      const locked = document.pointerLockElement != null
        && document.pointerLockElement === panelRef.current?.parentElement
      const wasOn = gameModeRef.current
      gameModeRef.current = locked
      setGameMode(locked)
      mouseYawAccumRef.current = 0
      // Leaving game mode -- by M, Esc or Alt-Tab -- stops the robot.
      if (wasOn && !locked) releaseAllHeld()
    }
    // Middle button held: look around. movementX/Y are relative deltas, so
    // they work with or without the pointer lock.
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 1) return
      e.preventDefault() // no Windows autoscroll
      if (lookingRef.current) return
      lookingRef.current = true
      setLooking(true)
      mouseYawAccumRef.current = 0
      lookTargetRef.current = LOOK_NEUTRAL
      stopRobot()
    }
    function onMouseUp(e: MouseEvent) {
      if (e.button !== 1) return
      endLook()
    }
    function onAuxClick(e: MouseEvent) {
      if (e.button === 1) e.preventDefault()
    }
    function onMouseMove(e: MouseEvent) {
      if (lookingRef.current) {
        lookTargetRef.current = applyLookDelta(lookTargetRef.current, e.movementX, e.movementY)
      } else if (gameModeRef.current) {
        mouseYawAccumRef.current += e.movementX
      }
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
      mouseYawAccumRef.current = 0
      releaseSpace()
      endLook()
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
    window.addEventListener('auxclick', onAuxClick)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('pagehide', onWindowBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('pointerlockchange', onPointerLockChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('auxclick', onAuxClick)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('pagehide', onWindowBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      // Unmounting is itself a loss of the drive surface — stop the robot
      // rather than leaving it moving under a control that no longer exists.
      if (gameModeRef.current) document.exitPointerLock()
      gameModeRef.current = false
      endLook()
      releaseAllHeld()
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
    let lastSentRatio: number | null = null

    const t = setInterval(() => {
      const mouseDeltaPx = mouseYawAccumRef.current
      mouseYawAccumRef.current = 0
      const mouseYawIntent = hasMouseYawIntent(mouseDeltaPx)
      // Looking around stands the robot still; held keys wait for the release.
      const dirs = driveDirectionsDuringLook(heldRef.current, lookingRef.current)
      const hasInput = dirs.size > 0 || mouseYawIntent

      // Full stick: the robot caps it at the speed % the DRIVE carries.
      const ratio = speedPctRef.current
      const { vx, vy, vyaw } = velocityFor(dirs)
      // The mouse's turn rate is rounded, so wobble is no change at all
      // (steeringOnlyChange's doc says why that matters on gRPC).
      const next: DriveSetpoint = hasInput
        ? {
            vx, vy,
            vyaw: mouseYawIntent ? quantizeYaw(applyMouseYaw(vyaw, mouseDeltaPx, FULL_STICK_TURN_RADPS)) : vyaw,
          }
        : DRIVE_STOP

      // Once stopped, go quiet: an idle robot needs no keepalive, and the
      // watchdog only guards a drive that is actually held.
      const idle = !hasInput && (lastSent === null || setpointChanged(lastSent, DRIVE_STOP) === false)
      const now = Date.now()
      const steerHeld = mouseYawIntent && steeringOnlyChange(lastSent, next) && steeringChangeHeld(lastSentAt, now)
      // Held keys send the same velocities at any speed, so a new speed % while
      // driving is a changed setpoint of its own: it goes out at once, not at
      // the next keepalive.
      const speedChanged = hasInput && ratio !== lastSentRatio
      const due = (setpointChanged(lastSent, next) && !steerHeld) || speedChanged
        || (!idle && keepaliveDue(lastSentAt, now))
      // Only what actually went out counts as sent. A move the policy refused
      // used to be recorded anyway, so it was not retried until the next
      // keepalive a second later -- which could be refused the same way.
      if (due && driveRobot(robot.robot_id, next.vx, next.vy, next.vyaw, ratio)) {
        lastSent = next
        lastSentAt = now
        lastSentRatio = ratio
      }

      if (hasInput) setSecondsLeft(AUTO_RELEASE_SECONDS)
    }, DRIVE_INPUT_POLL_MS)
    return () => clearInterval(t)
  }, [robot.robot_id, driveRobot])

  // Look loop. The mouse moves a target; this sends the newest one no more
  // often than lookTargetDue allows, since each becomes a robot move of at
  // least half a second that the next target cancels. Looking is activity for
  // the auto-release.
  useEffect(() => {
    let lastSent: LookTarget | null = null
    let lastSentAt = 0
    let shown = LOOK_NEUTRAL
    const t = setInterval(() => {
      if (!lookingRef.current) {
        lastSent = null
        shown = LOOK_NEUTRAL
        return
      }
      const next = lookTargetRef.current
      if (next !== shown) {
        shown = next
        setLookTarget(next)
        setSecondsLeft(AUTO_RELEASE_SECONDS)
      }
      const now = Date.now()
      if (lookTargetDue(lastSent, next, lastSentAt, now) && lookRobot(robot.robot_id, next)) {
        lastSent = next
        lastSentAt = now
      }
    }, DRIVE_INPUT_POLL_MS)
    return () => clearInterval(t)
  }, [robot.robot_id, lookRobot])

  // Space hold, timed exactly as EStopButton times its own hold: a timer
  // commits the fire (animation frames pause in a hidden window, and a stop
  // that silently refuses to arm is the failure to avoid); frames only
  // animate the ring.
  const dispatchCommandRef = useRef(dispatchCommand)
  dispatchCommandRef.current = dispatchCommand
  useEffect(() => {
    if (spaceHold.phase !== 'arming') return
    const start = performance.now()
    const commit = setTimeout(() => dispatchSpace({ type: 'HOLD_TICK', elapsedMs: ESTOP_HOLD_MS }), ESTOP_HOLD_MS)
    let raf = requestAnimationFrame(function tick() {
      dispatchSpace({ type: 'HOLD_TICK', elapsedMs: performance.now() - start })
      raf = requestAnimationFrame(tick)
    })
    return () => { clearTimeout(commit); cancelAnimationFrame(raf) }
  }, [spaceHold.phase])
  useEffect(() => {
    if (spaceHold.phase !== 'sent') return
    dispatchCommandRef.current(robot.robot_id, 'ESTOP', i18n.t('command.estop.engageCommand'))
    const t = setTimeout(() => dispatchSpace({ type: 'TIMEOUT' }), CONFIRM_TIMEOUT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceHold.phase])
  useEffect(() => {
    const next = spaceHoldFollowUp(spaceHold, robot.abstract_state, spaceDown)
    if (next) dispatchSpace(next)
  }, [spaceHold, robot.abstract_state, spaceDown])

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
      ref={panelRef}
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
        <span style={{ marginLeft: 'auto', fontSize: font.size.sm, color: gameMode ? color.blue : color.t3 }}>
          {gameMode
            ? t('liveops.manual.gameModeOn', { key: GAME_MODE_KEY.toUpperCase() })
            : t('liveops.manual.gameModeOff', { key: GAME_MODE_KEY.toUpperCase() })}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', fontSize: font.size.sm }}>
        {looking ? (
          <span style={{ color: color.blue, fontVariantNumeric: 'tabular-nums' }}>
            {/* Shown as people say it: up and right are positive. The SDK's
                pitch is the other way round (forward lean looks down). */}
            {t('liveops.manual.looking', {
              pitch: Math.round(-lookTarget.pitchDeg), yaw: Math.round(lookTarget.yawDeg),
            })}
            <span style={{ color: color.t3 }}> · {t('liveops.manual.lookPreview')}</span>
          </span>
        ) : (
          <span style={{ color: color.t3 }}>{t('liveops.manual.lookHint')}</span>
        )}
        <span
          style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: space[1],
            color: spaceHold.phase === 'arming' ? color.red : color.t3,
          }}
        >
          {spaceHold.phase === 'arming' && <HoldRing progress={spaceHold.progress} />}
          {spaceHold.phase === 'arming' ? t('liveops.manual.spaceArming') : t('liveops.manual.spaceHint')}
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

          {/* Read-only: chosen in the command bar (SpeedControl). */}
          <span style={{ ...label, fontVariantNumeric: 'tabular-nums' }}>
            {t('liveops.manual.speedReadout', { pct: speedPct })}
          </span>

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

/** The Space hold's progress, as a small ring that fills towards the E-Stop. */
function HoldRing({ progress }: { progress: number }) {
  const r = 6
  const circumference = 2 * Math.PI * r
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      <circle cx={8} cy={8} r={r} fill="none" stroke={color.redBg} strokeWidth={2.5} />
      <circle
        cx={8} cy={8} r={r} fill="none" stroke={color.red} strokeWidth={2.5}
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}
