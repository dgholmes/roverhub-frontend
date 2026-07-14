import { useEffect, useRef, useState } from 'react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { GaitMode, RobotState } from '@/types'

type Direction = 'forward' | 'back' | 'turnLeft' | 'turnRight' | 'strafeLeft' | 'strafeRight'

const KEY_TO_DIRECTION: Record<string, Direction> = {
  w: 'forward', ArrowUp: 'forward',
  s: 'back', ArrowDown: 'back',
  a: 'turnLeft', ArrowLeft: 'turnLeft',
  d: 'turnRight', ArrowRight: 'turnRight',
  q: 'strafeLeft',
  e: 'strafeRight',
}

const SPEED_OPTIONS = [
  { label: 'Slow', vMax: 0.3, yawMax: 0.35 },
  { label: 'Normal', vMax: 0.6, yawMax: 0.6 },
  { label: 'Fast', vMax: 1.0, yawMax: 0.8 },
]

const AUTO_RELEASE_SECONDS = 60
const DRIVE_TICK_MS = 150

function velocityFor(held: Set<Direction>, vMax: number, yawMax: number) {
  let vx = 0, vy = 0, vyaw = 0
  if (held.has('forward')) vx += vMax
  if (held.has('back')) vx -= vMax
  if (held.has('strafeLeft')) vy += vMax
  if (held.has('strafeRight')) vy -= vMax
  if (held.has('turnLeft')) vyaw += yawMax
  if (held.has('turnRight')) vyaw -= yawMax
  return { vx, vy, vyaw }
}

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
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      heldRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot.robot_id])

  // Drive loop: re-issues a burst every tick while any direction is held,
  // and keeps the auto-release countdown topped up while actually driving.
  useEffect(() => {
    const t = setInterval(() => {
      if (heldRef.current.size === 0) return
      const { vMax, yawMax } = SPEED_OPTIONS[speedIdxRef.current]
      const { vx, vy, vyaw } = velocityFor(heldRef.current, vMax, yawMax)
      driveRobot(robot.robot_id, vx, vy, vyaw)
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
      </div>

      <div style={{ display: 'flex', gap: space[4] }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 40px)', gap: 4 }}>
          {padButton('strafeLeft', 'Q')}
          {padButton('forward', 'W')}
          {padButton('strafeRight', 'E')}
          {padButton('turnLeft', 'A')}
          <div />
          {padButton('turnRight', 'D')}
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
            <div style={{ fontSize: font.size['2xs'], color: color.t3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
              Speed cap
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => setSpeedIdx(i)}
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
