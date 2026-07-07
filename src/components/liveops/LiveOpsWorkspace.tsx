import { useEffect, useState } from 'react'
import { color, font } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { LeftRail } from './rail/LeftRail'
import { HeroView } from './hero/HeroView'
import { CockpitView } from './hero/CockpitView'
import { SplitView } from './hero/SplitView'
import { CurrentTaskBar } from './mission/CurrentTaskBar'
import { EventLogPanel } from './mission/EventLogPanel'
import { EStopBanner } from './command/EStopBanner'
import { SystemStatusBar } from './systembar/SystemStatusBar'

/**
 * LiveOps control room. View mode (docs/05-ui-ux.md §4) selects between
 * HeroView (Default), CockpitView, and SplitView — only Cockpit collapses the
 * left rail (§3), everything else (CurrentTaskBar, E-Stop, timeline,
 * SystemStatusBar) is unaffected by view mode.
 */
export function LiveOpsWorkspace() {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const robots = useLiveOpsStore((s) => s.robots)
  const missions = useLiveOpsStore((s) => s.missions)
  const events = useLiveOpsStore((s) => s.events)
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const viewMode = useSessionStore((s) => s.viewMode)
  const [logsOpen, setLogsOpen] = useState(false)

  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  const robot = robots.find((r) => r.robot_id === selectedRobotId) ?? robots[0]

  if (!robot) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: color.t3, fontSize: font.size.sm,
      }}>
        No robots assigned to this site yet.
      </div>
    )
  }

  const mission = missions[robot.robot_id]

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      {/* Sidebar spans the full remaining viewport height; everything else
          lives in the column to its right, so the bottom bars start after it
          rather than running full-width underneath it. Cockpit is the one
          mode that collapses it (docs/05-ui-ux.md §3). */}
      {viewMode !== 'cockpit' && <LeftRail />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {viewMode === 'cockpit' ? (
          <CockpitView robot={robot} mission={mission} />
        ) : viewMode === 'split' ? (
          <SplitView robot={robot} mission={mission} />
        ) : (
          <HeroView robot={robot} mission={mission} />
        )}
        <CurrentTaskBar robot={robot} mission={mission} />
        {robot.abstract_state === 'E_STOP' && (
          <EStopBanner
            availability={getCommandAvailability(robot, 'RESET_ESTOP')}
            onConfirmRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', 'Release E-Stop')}
          />
        )}
        <EventLogPanel open={logsOpen} events={events} />
        <SystemStatusBar
          robot={robot}
          logsOpen={logsOpen}
          onToggleLogs={() => setLogsOpen((o) => !o)}
        />
      </div>
    </div>
  )
}
