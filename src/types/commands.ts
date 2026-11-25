/**
 * Mirrors the command lifecycle in docs/05-ui-ux.md §6 and the issue → validate
 * → execute → ack → state change → telemetry update flow in CLAUDE.md.
 * `shared/schemas/commands.py` is now populated and is the source of truth
 * for the `CommandType` literals below (see the doc comment on `SET_STATE`).
 */

export type CommandType =
  | 'PAUSE'
  | 'RESUME'
  | 'RETURN'
  | 'DOCK'
  // Defined in the contract, not wired: queueing needs the mission executor (run-records spec §5.4).
  | 'ANNOUNCE'
  | 'CANCEL_ANNOUNCEMENT'
  // Defined in the contract, not wired: needs bridge handling and a map control
  // (shared/schemas/commands.py, position_provider.set_map_origin()).
  | 'RESET_POSITION'
  | 'SNAPSHOT'
  | 'SPEAK'
  /** Cancels an in-flight SPEAK. Its own command type rather than a parameter on
   * SPEAK because it has to arrive *while* a SPEAK is still executing -- the edge
   * bridge cancels the chunk loop mid-stream. */
  | 'STOP_SPEAK'
  /** Changes the volume of the SPEAK that is playing now, `{ volume: 0-100 }`.
   * Sent quietly (no toast) by useLiveOpsStore.setSpeakVolume while the slider
   * moves. The robot's own speaker level is out of reach, so this scales the
   * samples still to be streamed -- it can only turn a clip down. */
  | 'SET_SPEAK_VOLUME'
  | 'ESTOP'
  | 'RESET_ESTOP'
  | 'TAKE_CONTROL'
  | 'RELEASE_CONTROL'
  | 'SET_GAIT'
  | 'SET_OBSTACLE_AVOIDANCE'
  /** Flashes the robot's indicator lights (SDK-confirmed real capability —
   * LedsCmd/LEDControl, named lights like leg_light1-4/fill_light1/3, RGB +
   * brightness — LIVEOPS_AUDIT_TRACKER.md H.2). Non-motion operator action,
   * same tier as SNAPSHOT/SPEAK. */
  | 'LED_SIGNAL'
  /** Teleoperation intent (docs/01-prd.md §16.3: its own "low-latency path"
   * command class). Wired for real, but sent by useLiveOpsStore.driveRobot →
   * RealDataProvider.postCommand rather than dispatchCommand's staged-ack
   * toast pipeline: on change plus a ~1 Hz keepalive, which the bridge's
   * velocity_driver turns into one held velocity sequence. */
  | 'DRIVE'
  /** High-level SDK command surface wired for real by the edge/backend side
   * of the "Full High-Level SDK Command Expansion" plan (shared/schemas/commands.py
   * is the source of truth for this list) -- state/mode/speed, canned movement
   * routines, and balance/pose primitives. */
  | 'SET_STATE'
  | 'CHANGE_MODE'
  | 'SET_SPEED_RATIO'
  | 'VELOCITY_SEQUENCE'
  | 'LINE_WALK'
  | 'ROTATE'
  | 'CIRCLE'
  | 'BALANCE_AXIS'
  | 'BALANCE_NEUTRAL'
  | 'BALANCE_SEQUENCE'
  | 'DYNAMIC_POSE'
  | 'STATIC_POSE'
  /** Runs a compiled block program on the bridge. Sent by POST /robots/{id}/runs; /commands refuses it. */
  | 'START_MISSION'
  /** Stops the run `{ run_id }`. */
  | 'STOP_MISSION'
  /** Walks the robot to a map point, `NavGotoParams` (x_m, y_m, yaw_rad | null, map_id, floor_id). */
  | 'NAV_GOTO'
  /** Cancels the goal in progress; its own command because it lands while NAV_GOTO is running. */
  | 'NAV_CANCEL'
  /** Survey a site from the console (schema 0.0.23, types/survey.ts): start, and
   * stop & save or discard. STOP_SURVEY never expires: a late stop is a stop. */
  | 'START_SURVEY'
  | 'STOP_SURVEY'
  /** Re-run the moving-object search on a kept survey recording, FindMovingParams. */
  | 'FIND_MOVING'
  /** The lidar mount and the robot's own calibration (0.0.23, types/sensors.ts). */
  | 'SET_LIDAR_MOUNT'
  | 'SET_CALIBRATION_MODE'
  /** Make the robot's map files this floor of this map, exactly this version
   * (0.0.26, types/maps.ts SyncMapParams): Missions › Maps' Send to robot. */
  | 'SYNC_MAP'
  /** Answer a stuck walk (0.0.27, liveops/navStuck.ts NavResolveParams): walk
   * one of the offered routes, plan again, or end the walk. */
  | 'NAV_RESOLVE'
  /** What the robot does when a walk gets stuck: ask, auto or stop (0.0.27). */
  | 'SET_NAV_STUCK_POLICY'
  /** The map ready checklist (0.0.29). Process again / Rebuild from recording
   * (types/survey.ts ReprocessSurveyParams), Keep and Delete recording
   * (SetSurveyKeepParams, SurveyIdParams), Skip for now on the moved search
   * (SurveyIdParams), Use this map on a robot (types/maps.ts UseNavMapParams)
   * and Move to site (SetSiteParams below). */
  | 'REPROCESS_SURVEY'
  | 'SET_SURVEY_KEEP'
  | 'DELETE_SURVEY_RECORDING'
  | 'SKIP_MOVING_SEARCH'
  | 'USE_NAV_MAP'
  | 'SET_SITE'
  /** Switch AI detection on or off and pick its detectors (0.0.31,
   * types/perception.ts SetDetectionParams; built by liveops/detection.ts).
   * Moves nothing: allowed during a mission and a survey, refused under the
   * E-Stop latch like every bridge setting. */
  | 'SET_DETECTION'

/** Every CommandType, for the drift test against shared/schemas/commands.py. */
export const COMMAND_TYPES: readonly CommandType[] = [
  'PAUSE',
  'RESUME',
  'RETURN',
  'DOCK',
  'ANNOUNCE',
  'CANCEL_ANNOUNCEMENT',
  'RESET_POSITION',
  'SNAPSHOT',
  'SPEAK',
  'STOP_SPEAK',
  'SET_SPEAK_VOLUME',
  'ESTOP',
  'RESET_ESTOP',
  'TAKE_CONTROL',
  'RELEASE_CONTROL',
  'SET_GAIT',
  'SET_OBSTACLE_AVOIDANCE',
  'LED_SIGNAL',
  'DRIVE',
  'SET_STATE',
  'CHANGE_MODE',
  'SET_SPEED_RATIO',
  'VELOCITY_SEQUENCE',
  'LINE_WALK',
  'ROTATE',
  'CIRCLE',
  'BALANCE_AXIS',
  'BALANCE_NEUTRAL',
  'BALANCE_SEQUENCE',
  'DYNAMIC_POSE',
  'STATIC_POSE',
  'START_MISSION',
  'STOP_MISSION',
  'NAV_GOTO',
  'NAV_CANCEL',
  'START_SURVEY',
  'STOP_SURVEY',
  'FIND_MOVING',
  'SET_LIDAR_MOUNT',
  'SET_CALIBRATION_MODE',
  'SYNC_MAP',
  'NAV_RESOLVE',
  'SET_NAV_STUCK_POLICY',
  'REPROCESS_SURVEY',
  'SET_SURVEY_KEEP',
  'DELETE_SURVEY_RECORDING',
  'SKIP_MOVING_SEARCH',
  'USE_NAV_MAP',
  'SET_SITE',
  'SET_DETECTION',
]

/** Mirrors `REPROCESS_SURVEY_BUDGET_S` (0.0.29): how long the bridge lets the
 * processing run -- the rebuild, saving, the moved search and the upload. */
export const REPROCESS_SURVEY_BUDGET_S = 3600
/** Mirrors `USE_NAV_MAP_BUDGET_S` (0.0.29): downloading and building the
 * floor's files and restarting the nav stack. */
export const USE_NAV_MAP_BUDGET_S = 300

/** Mirrors `SITE_ID_PATTERN`: a site id becomes a topic level
 * (`roverhub/<site>/<robot>/...`), so no "/", "+", "#" or whitespace. */
export const SITE_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/

/** SET_SITE's params (0.0.29): move a robot to another site of the
 * organisation. The bridge refuses unless idle, clears its map choice (a map
 * belongs to one site) and restarts itself under the new site; its ack says
 * `restarting`. */
export interface SetSiteParams {
  site_id: string
}

export type CommandStage =
  | 'requested'
  | 'cloud_received'
  | 'cloud_validated'
  | 'bridge_received'
  | 'local_safety_check'
  | 'sdk_sent'
  | 'robot_acknowledged'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'timed_out'
  | 'cancelled'

/**
 * The happy path, in the order the bridge actually emits stages. Progress is
 * derived from a stage's index here (`CommandAckToast.stageProgress`), so every
 * entry must be something the bridge can genuinely observe, in an order it can
 * genuinely observe it in.
 *
 * Mirrors `shared/schemas/commands.py`'s COMMAND_STAGE_ORDER — see that file for
 * why `robot_acknowledged` is absent while remaining a valid `CommandStage`:
 * the SDK's wrapper API returns only the final `SequenceProgress`, so there is
 * no honest moment to stamp it. It returns when the bridge drives
 * `stub.ExecuteSequence` directly (2026-08-12 audit F3/F6).
 */
export const COMMAND_STAGE_ORDER: CommandStage[] = [
  'requested',
  'cloud_received',
  'cloud_validated',
  'bridge_received',
  'local_safety_check',
  'sdk_sent',
  'execution_started',
  'execution_completed',
]

export interface CommandStageEvent {
  stage: CommandStage
  at: string
}

export interface Command {
  command_id: string
  robot_id: string
  type: CommandType
  label: string
  params?: Record<string, unknown>
  stages: CommandStageEvent[]
  current_stage: CommandStage
  failure_reason?: string
  /** What the command produced, for the few that produce anything. SNAPSHOT
   * returns `{ snapshot_id, camera }` so the console can fetch the image; the
   * bridge cannot supply a URL because it only knows its own CLOUD_API_URL,
   * which need not be reachable under that name from the operator's machine.
   * Absent for every command that produces no artifact. */
  result?: Record<string, unknown>
  initiated_by: string
  /** True when this command's lifecycle was simulated rather than sent to a
   * robot — the unwired types (PAUSE/RESUME/RETURN/DOCK; SNAPSHOT became
   * real on 2026-08-13) and the
   * `forceMock` shapes, which `RealDataProvider` routes to `mockDataProvider`
   * even against a real backend. They previously played the full nine-stage
   * success animation with nothing distinguishing them from a real dispatch,
   * so an operator pressing Return against a real robot watched a command
   * succeed that had done nothing.
   * docs/audit/2026-08-12-ui-ux-audit.md A-15. */
  simulated?: boolean
}

/** Blocking reasons a command can be disabled for — surfaced via tooltip per
 * docs/05-ui-ux.md §6.4 and §14, never a silently-hidden control. */
export interface CommandAvailability {
  enabled: boolean
  reason?: string
}
