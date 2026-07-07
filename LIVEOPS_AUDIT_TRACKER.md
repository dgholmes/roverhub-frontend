# LiveOps Audit Tracker

Source: full audit of Default/Cockpit/Split LiveOps views against `docs/05-ui-ux.md`
and `docs/01-prd.md §8`, cross-referenced with Dobot's own rover-control app
(`reference_images/`). Conversation date: 2026-07-06/07.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred (with reason)

Each item must end up `[x]` or explicitly `[-]` with a reason — nothing left silently
unaddressed. Update this file as each change lands (commit alongside the code change).

**Manual control input method:** keyboard + mouse only (this is a web app) — no
touch/drag virtual joystick like the reference mobile app. See Phase 3.

---

## SDK verification notes (edge/vendor/dobot_quad_sdk)

Checked against the actual vendored SDK rather than assuming from docs alone.
Confirms some things, corrects others:

- **E-Stop copy is factually wrong.** `robot_client.py`'s `STATE_ALIASES = {"emergency":
  "passive"}` and the `passive()` docstring ("急停/emergency stop") confirm E-Stop maps
  to the SDK's `passive` state, **not** `stand_down` as our `EStopButton.tsx` and
  `EStopBanner.tsx` copy currently claims ("engages a soft stop (stand_down)"). This same
  wrong claim is also in `docs/01-prd.md` line 391 — it's a doc-level error that
  cascaded into the frontend copy, not just a frontend typo. **Flagging for
  confirmation before fixing** (see item 1.5) since it touches safety-relevant copy
  and an authoritative doc.
- **`kill_robot` is confirmed real and confirmed separate from E-Stop** — a distinct,
  more severe motion (`execute("kill_robot")`, kills controller processes, not
  remotely recoverable) vs. E-Stop's recoverable `passive` toggle. Matches PRD's
  "kill_robot explicitly separated from E-stop" note. Confirms kill_robot correctly
  has no place in LiveOps' command bar (Engineer-only, Systems-scoped) — no gap here.
- **No continuous joystick/cmd_vel streaming RPC exists.** The gRPC service exposes
  exactly 5 RPCs (`GetAvailableMotions`, `ExecuteSequence`, `GetRobotState`,
  `SetSpeedRatio`, `SetObstacleAvoidance`). Velocity control goes through
  `ExecuteSequence` with a pre-built `(vx, vy, vyaw, duration)` segment string
  (`velocity_sequence()`), not a live per-frame streamed setpoint. This matters for
  Phase 3: "hold key, robot moves, release key, robot stops" has to be realized as
  short repeated bursts re-issued while a key is held, not a naive continuous stream.
  Design/copy for 3.2/3.3 should be honest about this rather than promising
  drone-joystick-grade responsiveness.
- **Confirmed gait vocabulary.** `VALID_GAITS = {walk, flying_trot}` (+ `wheel_loco`
  for the wheeled variant) exactly matches our existing `GaitMode` type — no change
  needed there. Broader FSM `VALID_STATES` (passive, ready, stand_down, balance_stand,
  walk, flying_trot, rl, choreo, dance0, wave, jump, backflip, recovery) gives a
  confirmed list for Phase 3.4's gait/action selector. Reference app's exact labels
  "Crouch"/"Traverse"/"Track" are **not** confirmed 1:1 SDK states in this vendored
  version — only wire buttons with a confirmed backing method (Ready, Walk, Flying
  Trot, Dance, Jump, Wave, Recovery, Choreo, and the `dynamic_pose`/`static_pose`
  balance motions), flag the rest as unconfirmed rather than guessing.
- **Real velocity magnitudes confirmed** from `e4_velocity_sequence.py`'s demo steps
  (~0.3–0.8 m/s translation, ~0.4–0.8 rad/s turn) — grounds Phase 3.5's speed-cap
  dropdown in real numbers instead of arbitrary ones.
- **"Speak" split (Play vs. Shout) is SDK-backed, not just reference-app UX.**
  `e7_voice_pub.py`'s `VoiceCmd` has a real `type: "file"` (play a path) vs.
  `type: "streaming"` (live 100ms-chunked mic capture) mode — exactly the Play/Shout
  split proposed for Phase 4.1. De-risks that item.
- **LED/indicator light control exists** (`LedsCmd`/`LEDControl` — named lights like
  `leg_light1-4`, `fill_light1/3`, RGB + brightness) and isn't represented anywhere in
  RoverHub today beyond a passing PRD mention ("snapshot, voice, LED, wait"). Not core
  to this audit; added as a new low-priority idea (H.2).
- **Per-motor telemetry is real and rich**: `motor_state()` DDS message carries 16
  motors × `{mode, q, dq, ddq, tau_est, motor_temp}` (position/velocity/accel/torque/
  temp per motor), and BMS exposes a clean `battery_level()`. This is exactly the
  source of the Dobot reference app's Joint Information/Joint Limits screens.
  Confirms (from the SDK side, not just docs §9.2) that this tier of detail belongs
  in Fleet's `DeviceDetailDrawer` / a Systems diagnostics tab, not LiveOps — reinforces
  removing the fabricated Motors/Sensors literals (1.3) rather than trying to wire
  real diagnostic data into a workspace that's documented to exclude it.

---

## Phase 1 — Quick fixes (small, independent, no new data model)

- [x] **1.1** Fix dead Settings link in `SystemStatusBar` — currently hardcodes
      `window.location.hash = '#/systems'` (pre-nested-routing scheme, resolves to
      the Org Dashboard fallback today). Use `hashForSiteWorkspace(activeSiteId, 'Systems')`.
- [x] **1.2** Wire `SystemStatusBar`'s "Alerts" pill to a real popover. It's currently
      `cursor: 'default'`, fully decorative — `AlertCenterButton` (badge + slide-over +
      acknowledge) exists and works, but only mounts in `OrgTopBar` now, so alerts are
      unreachable from inside LiveOps entirely. Reuse `AlertCenterButton`, opening
      upward instead of downward (it's in the footer).
- [x] **1.3** Remove fabricated "Motors: OK" / "Sensors: OK" in `SystemStatusBar` —
      hardcoded literals (`value="OK" ok`, not read from `robot` at all). Will read
      "OK" during a real fault. `RobotState` has no field behind either. Remove until
      real data exists, or repurpose the slots for a field we do have
      (e.g. `maintenance_flagged`).
- [x] **1.4** Fix `FleetWorkspace`'s drawer to honor docs §2.3 ("Navigating from
      LiveOps to Fleet with a robot selected opens that robot's detail view
      directly") — seed its local drawer state from the already-shared
      `useSessionStore.selectedRobotId` instead of `useState(null)`. Then add a
      "View full device details →" link in LiveOps (`RobotStatusMini` in the rail,
      and `CockpitStatusOverlay`) pointing at `hashForSiteWorkspace(activeSiteId, 'Fleet')`.
- [ ] **1.5** Fix E-Stop copy — `EStopButton.tsx`/`EStopBanner.tsx` say "soft stop
      (stand_down)"; SDK confirms E-Stop/emergency maps to `passive`, not `stand_down`.
      Also present in `docs/01-prd.md` line 391 (doc-level error, not just frontend).
      **Needs explicit confirmation before changing** — safety-relevant copy + touches
      an authoritative doc, not just app code.

## Phase 2 — Map completeness

- [ ] **2.1** Render all site robots on the map (LVO-006), not just the selected
      one — `MapCanvas` currently hardcodes a single `<RobotMarker robot={robot}>`.
      Non-selected robots shown dimmed/smaller; clicking one selects it (same sync
      rule the rail/selector already follow).
- [ ] **2.2** Add a layer-visibility toggle to `MapControls` (LVO-006 "toggle
      authorized layers") — Geofence / No-Go Zones / Annotations / Other Robots,
      currently all-or-nothing.

## Phase 3 — Manual / Assisted control (the big one)

Per user direction: **keyboard + mouse only for now** — no touch/drag virtual
joystick (this is a web app, not the reference mobile app).

- [ ] **3.1** "Take Control" / "Release Control" flow — new affordance in
      `CurrentTaskBar` to request a transition into MANUAL/ASSISTED (PRD §8.8),
      enforcing single control-owner semantics and an auto-release timeout
      (PRD's teleoperation "deadman/timeout policy").
- [ ] **3.2** Keyboard-driven drive control (WASD/arrow keys, hold-to-move,
      key-up stops — deadman-style) active only while MANUAL/ASSISTED and control
      is held.
- [ ] **3.3** On-screen control surface (mouse-operable — click/hold direction
      buttons, not a drag joystick) as the discoverable/mouse-only equivalent of 3.2,
      floated on whichever view is dominant (mirrors the camera-mode-tabs
      dominant-view rule already established).
- [ ] **3.4** Gait/posture selector (Ready/Walk/Crouch/Pose/Traverse/Trot — from
      the reference app) — currently `robot.gait` is a read-only `Pill` everywhere,
      no selector exists.
- [ ] **3.5** Speed-limit affordance for manual driving (echoes the reference
      app's password-gated high-speed toggle) — simplified to a dropdown cap for now.
- [ ] **3.6** Add at least one MANUAL and one ASSISTED mock robot to
      `mockRobots.ts` — neither state is exercised anywhere in the current mock
      fleet, so this whole surface has never been visually tested.
- [ ] **3.7** New `CommandType`s (or a dedicated velocity/gait channel) in
      `types/commands.ts` + `commandPolicy.ts` rules for the above.

## Phase 4 — Polish

- [ ] **4.1** Upgrade "Speak" from a generic fire-and-forget command to a small
      popover matching the reference app's Play (clip picker) / Shout (hold-to-talk)
      split. Still dispatches through the existing command lifecycle underneath.
- [ ] **4.2** Add distinct feed states beyond connected/DDS-lost — reconnecting,
      muted, permission-denied (LVO-015 requires all of these; only two exist today).
- [ ] **4.3** Telemetry redundancy cleanup — Battery/Speed currently shown in both
      the LeftRail and the floating HUD simultaneously in Default/Split. Decide a
      deliberate split of responsibility (glance overlay vs. detailed rail) rather
      than duplicating the same numbers.
- [ ] **4.4** Fix orphaned "EST." badge in `TelemetryOverlay` — floats in the pill
      cluster with no attached coordinate/position value in that widget, so it
      currently reads as attached to nothing.

- [x] **1.6** Implement E-Stop as a recoverable toggle, not a one-way state —
      `RESET_ESTOP` command, `commandPolicy` carve-out, `EStopBanner` release
      button + confirm dialog, `mockDataProvider` E_STOP→STAND transition.
      Also updates `docs/05-ui-ux.md §5.3`'s mandated banner copy, which
      previously said "hard recovery requires an engineer on-site" — directly
      contradicting `docs/01-prd.md §16.2`'s own "Authorized reset (Operator+
      with confirmation)" transition rule. Confirmed with user before
      implementing (per standing instruction) since it touches safety-relevant
      copy and resolves a cross-doc conflict.

## Housekeeping (lower priority, not a functional gap)

- [ ] **H.1** `docs/05-ui-ux.md §2.2`'s AppShell diagram (TopBar with WorkspaceNav/
      SiteSelector/RobotSelector/AlertCenter at every level) is stale relative to the
      shipped Org/Site nav split (Org keeps TopBar+tabs; Site has no TopBar, sidebar
      instead). Update the doc to match reality once the nav settles.
- [ ] **H.2** LED/indicator light control (`LedsCmd` — named lights, RGB+brightness)
      is a real SDK capability with no RoverHub representation anywhere beyond a
      passing PRD mention. Not core to LiveOps; note for a future operator-actions
      pass (visual signaling to bystanders near the robot).

## Deferred to Fleet/Systems/Missions audits (not LiveOps, noted so they aren't lost)

- Per-joint diagnostics (Position / MCU Temp / MOS Temp / Motor Temp / Error Flag,
  Joint Limits: Position/Torque/Speed/KP/KD) → candidate material for Fleet's
  `DeviceDetailDrawer` or a Systems diagnostics tab.
- Rover Debugging structure (Version Info, Calibration, Foot Type, 4G Traffic,
  OTA/firmware update flow) → Systems workspace.
- Blockly-style visual mission programming → Missions workspace.
