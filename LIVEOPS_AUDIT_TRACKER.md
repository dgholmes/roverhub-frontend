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
- [x] **1.5** Fix E-Stop copy — turned out much larger than "line 391": the same
      wrong claim (`emergency` → `stand_down`) was repeated across **six docs**
      (01-prd.md, 02-system-architecture.md, 03-sdk-integration.md,
      04-edge-bridge.md, 06-wbs-timeline.md, plus the frontend copy already fixed
      in 1.6), including inside WBS test plans and safety notes. Confirmed via the
      vendored SDK (`robot_client.py` STATE_ALIASES = {"emergency": "passive"};
      changelog v1.0.9: "emergency() — Alias for passive()") that `passive` and
      `stand_down` are two distinct FSM states, and `emergency` (E-Stop) resolves
      to `passive`, never `stand_down` (which is legitimately used elsewhere —
      docking, graceful shutdown, watchdog-on-heartbeat-loss — and those mentions
      were left untouched). Fixed all instances across all six docs, added a
      `passive` glossary/state-table entry alongside `stand_down` so the
      distinction is documented going forward. Also caught and fixed a second
      stale "requires an engineer on-site" claim in 02-system-architecture.md
      that contradicted the recoverable-toggle behavior (same category of error
      as the 05-ui-ux.md §5.3 banner copy fixed in 1.6).

## Phase 2 — Map completeness

- [x] **2.1** Render all site robots on the map (LVO-006), not just the selected
      one — `MapCanvas` currently hardcodes a single `<RobotMarker robot={robot}>`.
      Non-selected robots shown dimmed/smaller; clicking one selects it (same sync
      rule the rail/selector already follow).
- [x] **2.2** Add a layer-visibility toggle to `MapControls` (LVO-006 "toggle
      authorized layers") — Geofence / No-Go Zones / Annotations / Other Robots,
      currently all-or-nothing.

## Phase 3 — Manual / Assisted control (the big one)

Per user direction: **keyboard + mouse only for now** — no touch/drag virtual
joystick (this is a web app, not the reference mobile app).

- [x] **3.1** "Take Control" / "Release Control" flow — `ControlToggleButton`
      in `CurrentTaskBar` (same button relabels, matching the E-Stop toggle
      pattern from Phase 1). `control_owner` field on `RobotState`, enforced by
      `commandPolicy`. MANUAL vs. ASSISTED is driven entirely by the existing
      `obstacle_avoidance` flag (matches the SDK reality — same `walk`/
      `wheel_loco` state either way) rather than treating them as separate
      flows. Also fixed a real pre-existing bug found while building this:
      `CurrentTaskBar` returned early with a "no mission" placeholder that
      skipped the entire button row, including E-Stop, for any robot with no
      active mission — contradicted docs §3 ("command bar and E-stop button
      are always visible... they do not collapse"). Button row now always
      renders; only the mission-info portion is conditional.
- [x] **3.2** Keyboard drive (`ManualControlOverlay`) — W/S forward/back, A/D
      turn, Q/E strafe, Space = immediate stop. Hold-to-move via a 150ms
      re-issue loop, not continuous streaming — the vendored SDK's velocity API
      is segment-based (`ExecuteSequence` with timed bursts), confirmed during
      SDK verification, not a live per-frame setpoint.
- [x] **3.3** On-screen 3×3 D-pad (mouse mousedown/mouseup/mouseleave) sharing
      the same held-directions state as keyboard, so both can combine. Mounted
      in all three views (Hero/Cockpit/Split), not scoped to the dominant view
      like camera-mode-tabs — driving applies to the robot regardless of which
      view is showing.
- [x] **3.4** Gait selector scoped to Walk / Flying Trot only (both SDK-confirmed
      valid gaits for driving) — descoped the reference app's fuller action grid
      (Dance/Wave/Jump/Recovery/Choreo/Crouch/Traverse/Track) as cosmetic and
      not core to driving; noted as a possible follow-up, not built.
- [x] **3.5** Speed-cap dropdown (Slow/Normal/Fast: 0.3/0.6/1.0 m/s, grounded in
      real magnitudes from the SDK's own `e4_velocity_sequence.py` demo steps).
- [-] **3.6** Deferred, as flagged in the original plan — the live Take
      Control flow itself is now the way to reach MANUAL/ASSISTED, exercised
      end-to-end in verification, so a permanently-frozen mock robot in that
      state wasn't needed.
- [x] **3.7** `TAKE_CONTROL` / `RELEASE_CONTROL` / `SET_GAIT` /
      `SET_OBSTACLE_AVOIDANCE` added as real `CommandType`s (staged-ack pipeline,
      same as Pause/Resume/etc). `DRIVE` added too, but *only* as a
      `commandPolicy` availability check — actual driving bypasses
      `dispatchCommand`'s 12-stage/350ms-per-stage lifecycle entirely via a new
      `driveRobot` store action straight to `mockDataProvider`, since running
      multiple-times-a-second velocity bursts through the staged-ack+toast
      pipeline would spam a toast every ~200ms. Matches PRD §16.3's teleoperation
      "low-latency path" being its own command class, distinct from mission
      control.

## Phase 4 — Polish

- [x] **4.1** Upgraded "Speak" to a popover (`SpeakButton`) — Play tab (preset
      clips: "Stand Clear", "Patrol Greeting", plus an "Add clip" flow — real
      file upload via a hidden file input, or a mock "record new clip" toggle
      with an elapsed-seconds counter, since this app has no real audio
      capture pipeline anywhere to fake a genuine getUserMedia call against)
      / Shout tab (hold-to-talk, plus a lock toggle turning it into
      press-to-start / press-again-to-finish-and-send). SDK verification
      during Phase 2/3 already confirmed the Play/Shout split is real, not
      just reference-app UX: `VoiceCmd` has genuine `type: "file"` vs.
      `type: "streaming"` modes. Still dispatches SPEAK through the existing
      command lifecycle underneath.
- [x] **4.2** Added `'reconnecting'` to `DdsLinkStatus` (was a connected/
      unavailable binary). `CameraFeedLayer` shows a distinct spinner +
      "Reconnecting to DDS…" overlay, separate from the harsher static "Feed
      paused" state. RVR-03 "Bolt" switched to this state so it's live in the
      mock fleet, not just theoretical. Media Controls' Audio button is now a
      real mute toggle (was fully decorative) with a visible "Muted" badge on
      the feed. **"permission-denied" deliberately not modeled** — the feed is
      a static mock image, not real getUserMedia/WebRTC, so there's no genuine
      browser permission concept to attach it to honestly; noted as deferred
      rather than faked.
- [x] **4.3** Removed Speed from `RobotStatusMini` (rail) — checked against
      docs §9.1 itself, which doesn't list Speed among what this component
      should show at all; it's kept only in the floating HUD now. Battery left
      as-is in both places since the rail (%+runtime+bar) and HUD (glance pill)
      genuinely serve different purposes, unlike Speed's flat duplication.
- [x] **4.4** Re-checked §7.1, which explicitly requires the estimated badge on
      "coordinate readouts in TelemetryOverlay" — so the real fix wasn't
      removing the orphaned badge, it was that TelemetryOverlay was missing the
      coordinate readout it's supposed to have. Added a compact X/Y position
      pill (with EstimatedBadge/StaleBadge attached, matching the rail's
      pattern) to both `TelemetryOverlay` and `CockpitStatusOverlay`.

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
