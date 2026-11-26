import type { LogLevel, LogLine, LogSource } from '@/types/logs'

/**
 * A robot's log as the mock provider tells it: the lines the bridge and Nav2
 * actually write (rover-jetson's journal, 2026-11-13), placed relative to now
 * so every range has something in it. A robot's Logs tab in Fleet reads these through the
 * same interface as the real thing.
 */

const MIN = 60_000
const HOUR = 60 * MIN

/** The line nav repeats thousands of times an hour while the robot has no
 * pose: 5,056 of 5,104 nav warnings in six hours on 2026-11-13. */
export const AMCL_REPEAT_MESSAGE = 'AMCL cannot publish a pose or update the transform. Please set the initial pose...'

const line = (t: number, source: LogSource, level: LogLevel, logger: string | null, message: string, extra: Partial<LogLine> = {}): LogLine =>
  ({ at: new Date(t).toISOString(), source, level, logger, message, repeat: 1, last_at: null, ...extra })

const bridge = (t: number, level: LogLevel, logger: string, message: string) => line(t, 'bridge', level, `robot_bridge.${logger}`, message)
const nav = (t: number, level: LogLevel, logger: string, message: string) => line(t, 'nav', level, logger, message)
const systemd = (t: number, level: LogLevel, message: string) => line(t, 'bridge', level, 'systemd', message)

/** The everyday bridge chatter, one every few minutes across the range. */
const ROUTINE: [LogLevel, string, string][] = [
  ['info', 'command_sender', 'command received: TAKE_CONTROL'],
  ['info', 'safety_manager', 'control taken by operator-dev'],
  ['info', 'command_sender', 'command received: SET_STATE balance_stand'],
  ['info', 'command_sender', 'command received: SNAPSHOT'],
  ['info', 'stream_manager', 'snapshot uploaded: front camera'],
  ['info', 'command_sender', 'command received: RELEASE_CONTROL'],
  ['info', 'safety_manager', 'control released by operator-dev'],
  ['info', 'idle_power', 'idle power-down: lying the robot down after 60 s without a command'],
]

/** The fold of the AMCL line, which the live stream keeps growing. */
export interface MockFold {
  at: number
  repeat: number
  lastAt: number
}

export function amclLine(fold: MockFold): LogLine {
  return line(fold.at, 'nav', 'warn', 'amcl', AMCL_REPEAT_MESSAGE, { repeat: fold.repeat, last_at: new Date(fold.lastAt).toISOString() })
}

/** Every line from `since` to `now`, oldest first, for the given sources. */
export function mockLogHistory(now: number, since: number, sources: LogSource[], fold: MockFold): LogLine[] {
  const out: LogLine[] = []

  // A crash and restart five hours ago: systemd's lines and the traceback.
  const crash = now - 5 * HOUR - 13 * MIN
  out.push(
    bridge(crash - 2_130, 'error', 'robot_link', 'robot link lost: get_state() UNAVAILABLE'),
    bridge(crash - 2_120, 'error', 'robot_link', 'Traceback (most recent call last):'),
    bridge(crash - 2_119, 'error', 'robot_link', '  File "/home/rover/roverhub/roverhub-edge/robot_bridge/telemetry_reader.py", line 112, in _poll'),
    bridge(crash - 2_118, 'error', 'robot_link', 'grpc._channel._InactiveRpcError: <_InactiveRpcError of RPC that terminated with: status = StatusCode.UNAVAILABLE>'),
    systemd(crash, 'error', 'roverhub-bridge.service: Main process exited, code=exited, status=1/FAILURE'),
    systemd(crash + 10, 'warn', 'roverhub-bridge.service: Failed with result \'exit-code\'.'),
    systemd(crash + 5_200, 'info', 'Started roverhub-bridge.service - RoverHub edge bridge.'),
    bridge(crash + 7_840, 'info', 'main', 'connected to robot at 192.168.5.2:50051 (quad)'),
    bridge(crash + 8_020, 'info', 'connection_manager', 'connected to the cloud broker; registration published'),
  )

  // Routine chatter, every seven minutes or so.
  for (let t = now - 24 * HOUR + 3 * MIN, i = 0; t < now - 2 * MIN; t += 7 * MIN + (i % 5) * 23_000, i++) {
    const [level, logger, message] = ROUTINE[i % ROUTINE.length]
    out.push(bridge(t, level, logger, message))
  }

  // The walk the operator watched, three quarters of an hour ago.
  const walk = now - 47 * MIN
  out.push(
    bridge(walk, 'info', 'command_sender', 'command received: NAV_GOTO'),
    bridge(walk + 510, 'info', 'nav_goals', 'nav goal 2 accepted'),
    nav(walk + 2_340, 'warn', 'controller_server', 'Failed to make progress'),
    bridge(walk + 5_920, 'warn', 'nav_goals', 'nav stopped: localization_lost: the scan fits 0.47 m / 3 deg from where AMCL has the robot'),
    bridge(walk + 5_921, 'warn', 'nav_goals', 'nav goal stopped; re-checking its position against the lidar for up to 15 s, then resuming it once'),
    bridge(walk + 9_570, 'info', 'nav_goals', 'resuming nav goal after the lidar corrected the position by 0.40 m / 2.9 deg'),
    nav(walk + 11_200, 'error', 'bt_navigator', 'Goal failed, retrying: Timed out waiting for transform from base_link to map'),
    bridge(walk + 30_610, 'info', 'nav_goals', 'nav goal succeeded'),
    bridge(walk + 9 * MIN + 31_760, 'warn', 'relocalise', 'idle re-localisation: the lidar scan does not clearly match the map where AMCL has the robot (fit 0.46)'),
    nav(now - 3 * HOUR, 'warn', 'global_costmap.global_costmap', 'Timed out waiting for transform from base_link to map to become available, tf error: Invalid frame ID "map" passed to canTransform'),
  )

  out.push(amclLine(fold))

  return out
    .filter((l) => sources.includes(l.source) && Date.parse(l.at) >= since && Date.parse(l.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

/** What the mock bridge says live, one line per tick, in turn. */
const LIVE: [LogSource, LogLevel, string | null, string][] = [
  ['bridge', 'info', 'robot_bridge.command_sender', 'command received: SET_SPEED_RATIO'],
  ['bridge', 'info', 'robot_bridge.command_sender', 'speed ratio set to 60'],
  ['nav', 'warn', 'global_costmap.global_costmap', 'Timed out waiting for transform from base_link to map to become available'],
  ['bridge', 'info', 'robot_bridge.relocalise', 'idle re-localisation: the lidar scan matches the map (fit 0.91)'],
  ['bridge', 'info', 'robot_bridge.command_sender', 'command received: SNAPSHOT'],
  ['bridge', 'info', 'robot_bridge.stream_manager', 'snapshot uploaded: front camera'],
]

export function mockLiveLine(tick: number, now: number): LogLine {
  const [source, level, logger, message] = LIVE[tick % LIVE.length]
  return line(now, source, level, logger, message)
}
