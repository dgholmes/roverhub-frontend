import { useEffect, useRef, useState } from 'react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { DRIVE_TICK_MS } from '@/lib/teleop'
import type { GaitMode, RobotState } from '@/types'
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
 * unchanged. */
const SPEED_OPTIONS = [
  { label: 'Slow', vMax: 0.3, yawMax: 0.35, ratio: 30 },
  { label: 'Normal', vMax: 0.6, yawMax: 0.6, ratio: 60 },
  { label: 'Fast', vMax: 1.0, yawMax: 0.8, ratio: 100 },
]

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

  // Keyboard: hold-to-move, ignores OS key-repeat, releases on keyup.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null
      return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.repeat) return
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault()
        heldRef.current.clear()
        setHeldDirs(new Set())
        driveRobot(robot.robot_id, 0, 0, 0)
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
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('blur', disengageSteering)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('blur', disengageSteering)
      heldRef.current.clear()
      steeringRef.current = false
      mouseYawAccumRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot.robot_id])

  // Drive loop: re-issues a burst every tick while any direction is held or
  // there's genuine mouse-yaw intent (steering engaged AND the accumulated
  // delta clears a small dead-zone -- see hasMouseYawIntent), and keeps the
  // auto-release countdown topped up on that SAME condition, so incidental
  // sub-threshold mouse jitter can neither drive the robot nor stall the
  // deadman timeout.
  useEffect(() => {
    const t = setInterval(() => {
      const mouseDeltaPx = mouseYawAccumRef.current
      mouseYawAccumRef.current = 0
      const mouseYawIntent = hasMouseYawIntent(mouseDeltaPx)
      if (heldRef.current.size === 0 && !mouseYawIntent) return
      const { vMax, yawMax, ratio } = SPEED_OPTIONS[speedIdxRef.current]
      const { vx, vy, vyaw } = velocityFor(heldRef.current, vMax, yawMax)
      const combinedVyaw = applyMouseYaw(vyaw, mouseYawIntent ? mouseDeltaPx : 0, yawMax)
      driveRobot(robot.robot_id, vx, vy, combinedVyaw, ratio)
      setSecondsLeft(AUTO_RELEASE_SECONDS)
    }, DRIVE_TICK_MS)
    return () => clearInterval(t)
  }, [robot.robot_id, driveRobot])

  // Auto-release timeout (docs/01-prd.md §16.3: teleoperation deadman/timeout
  // policy) — ticks every second regardless; the drive loop above keeps
  // resetting it to full while there's actual input, so it only reaches zero
  // during genuine inactivity.
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', 'Release Control (auto-timeout)')
          return AUTO_RELEASE_SECONDS
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot.robot_id])

  const dirBtnStyle = (dir: Direction): React.CSSProperties => ({
    width: 40, height: 32, borderRadius: radius.sm,
    background: heldDirs.has(dir) ? color.blueBg : 'rgba(255,255,255,0.06)',
    border: `1px solid ${heldDirs.has(dir) ? color.blueBorder : 'rgba(255,255,255,0.12)'}`,
    color: heldDirs.has(dir) ? color.blue : color.t1,
    fontSize: font.size.sm, fontWeight: font.weight.bold, fontFamily: font.family,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none',
  })

  function padButton(dir: Direction, label: string) {
    return (
      <button
        style={dirBtnStyle(dir)}
        onMouseDown={() => press(dir)}
        onMouseUp={() => release(dir)}
        onMouseLeave={() => release(dir)}
        aria-label={dir}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', bottom: 68, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
      ...glass.heavy, borderRadius: radius.md, padding: space[3],
      display: 'flex', flexDirection: 'column', gap: space[2], alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.blue }}>
          {robot.abstract_state === 'ASSISTED' ? 'ASSISTED CONTROL' : 'MANUAL CONTROL'}
        </span>
        <span style={{ fontSize: font.size.xs, color: color.t3 }}>
          auto-release in {secondsLeft}s
        </span>
        <span style={{ fontSize: font.size['2xs'], color: steering ? color.blue : color.t3 }}>
          {steering ? 'steering (right-click held)' : 'hold right-click + move to steer'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: space[4] }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 4 }}>
          {padButton('turnLeft', 'Q')}
          {padButton('forward', 'W')}
          {padButton('turnRight', 'E')}
          {padButton('strafeLeft', 'A')}
          <div />
          {padButton('strafeRight', 'D')}
          <div />
          {padButton('back', 'S')}
          <div />
        </div>

        <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2], minWidth: 150 }}>
          <div>
            <div style={{ fontSize: font.size['2xs'], color: color.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
              Gait
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['walk', 'flying_trot'] as GaitMode[]).map((g) => (
                <button
                  key={g}
                  onClick={() => dispatchCommand(robot.robot_id, 'SET_GAIT', 'Set Gait', { gait: g })}
                  style={{
                    padding: '4px 8px', borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family,
                    background: robot.gait === g ? color.accentDim : 'transparent',
                    border: `1px solid ${robot.gait === g ? color.accentBorder : color.border}`,
                    color: robot.gait === g ? color.accent : color.t2, cursor: 'pointer',
                  }}
                >
                  {g === 'walk' ? 'Walk' : 'Flying Trot'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              fontSize: font.size['2xs'], color: color.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3,
            }}>
              <span>Speed cap</span>
              <span style={{ textTransform: 'none', letterSpacing: 'normal', color: color.t2 }}>
                live: {robot.speed_ratio}%
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => {
                    setSpeedIdx(i)
                    // Persist the base speed_ratio -- VELOCITY_SEQUENCE's own
                    // speed_ratio param only overrides temporarily for that one
                    // burst and reverts once it completes (high_level.md §2.6),
                    // so without this the picker had no observable, lasting
                    // effect on the robot's actual speed setting.
                    dispatchCommand(robot.robot_id, 'SET_SPEED_RATIO', `Set Speed ${opt.label}`, { ratio: opt.ratio })
                  }}
                  style={{
                    padding: '4px 8px', borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family,
                    background: speedIdx === i ? color.accentDim : 'transparent',
                    border: `1px solid ${speedIdx === i ? color.accentBorder : color.border}`,
                    color: speedIdx === i ? color.accent : color.t2, cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => dispatchCommand(
              robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
              robot.obstacle_avoidance ? 'Disable Obstacle Avoidance' : 'Enable Obstacle Avoidance',
              { enabled: !robot.obstacle_avoidance },
            )}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 8px', borderRadius: radius.sm, fontSize: font.size.xs, fontFamily: font.family,
              background: 'transparent', border: `1px solid ${color.border}`,
              color: robot.obstacle_avoidance ? color.green : color.t2, cursor: 'pointer',
            }}
          >
            Obstacle Avoid.
            <span style={{ marginLeft: space[2], fontWeight: font.weight.bold }}>
              {robot.obstacle_avoidance ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
