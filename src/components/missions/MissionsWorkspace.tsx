import { useState } from 'react'
import { Code2, MapIcon } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { mockMissionLibrary } from '@/mocks/mockMissionLibrary'
import type { MissionLibraryEntry, MissionWaypoint } from '@/types'
import { MissionLibraryPanel } from './MissionLibraryPanel'
import { MissionMapEditor } from './route-editor/MissionMapEditor'
import { WaypointInspector } from './route-editor/WaypointInspector'
import { BlocklyEditor } from './visual-program/BlocklyEditor'

type Mode = 'route' | 'program'

function blankMission(name: string): MissionLibraryEntry {
  return {
    mission_id: `mission-draft-${Date.now()}`,
    name,
    type: 'patrol',
    library_status: 'draft',
    creator: 'MinJae Joo',
    updated_at: new Date().toISOString(),
    waypoints: [],
  }
}

/**
 * Missions workspace (docs/05-ui-ux.md §11) — scoped to MissionLibrary +
 * RouteEditor + WaypointInspector, plus a Visual Program (Blockly) authoring
 * mode. DispatchRuleBuilder and ScheduleCalendar are out of scope for this
 * pass (not requested).
 */
export function MissionsWorkspace() {
  const [missions, setMissions] = useState<MissionLibraryEntry[]>(mockMissionLibrary)
  const [activeId, setActiveId] = useState<string | null>(missions[0]?.mission_id ?? null)
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('route')

  const activeMission = missions.find((m) => m.mission_id === activeId) ?? null

  function updateActiveMission(patch: Partial<MissionLibraryEntry>) {
    if (!activeMission) return
    setMissions((ms) => ms.map((m) => (m.mission_id === activeMission.mission_id ? { ...m, ...patch, updated_at: new Date().toISOString() } : m)))
  }

  function addWaypoint(x_m: number, y_m: number) {
    if (!activeMission) return
    const id = `wp-${Date.now()}`
    const waypoint: MissionWaypoint = { id, label: `Waypoint ${activeMission.waypoints.length + 1}`, x_m, y_m, actions: [], status: 'pending' }
    updateActiveMission({ waypoints: [...activeMission.waypoints, waypoint] })
    setSelectedWaypointId(id)
  }

  function updateWaypoint(id: string, patch: Partial<MissionWaypoint>) {
    if (!activeMission) return
    updateActiveMission({ waypoints: activeMission.waypoints.map((wp) => (wp.id === id ? { ...wp, ...patch } : wp)) })
  }

  function removeWaypoint(id: string) {
    if (!activeMission) return
    updateActiveMission({ waypoints: activeMission.waypoints.filter((wp) => wp.id !== id) })
    setSelectedWaypointId(null)
  }

  function newMission() {
    const m = blankMission(`Untitled Mission ${missions.length + 1}`)
    setMissions((ms) => [m, ...ms])
    setActiveId(m.mission_id)
    setSelectedWaypointId(null)
  }

  function selectMission(id: string) {
    setActiveId(id)
    setSelectedWaypointId(null)
  }

  const selectedWaypoint = activeMission?.waypoints.find((wp) => wp.id === selectedWaypointId) ?? null

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      <MissionLibraryPanel missions={missions} activeId={activeId} onSelect={selectMission} onNew={newMission} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {activeMission ? (
          <>
            <div style={{
              height: 48, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${space[4]}px`,
            }}>
              <input
                value={activeMission.name}
                onChange={(e) => updateActiveMission({ name: e.target.value })}
                style={{
                  background: 'transparent', border: '1px solid transparent', color: color.t1,
                  fontSize: font.size.lg, fontWeight: font.weight.bold, fontFamily: font.family, padding: '4px 6px',
                  borderRadius: radius.sm, minWidth: 200,
                }}
                onFocus={(e) => { e.target.style.border = `1px solid ${color.border}` }}
                onBlur={(e) => { e.target.style.border = '1px solid transparent' }}
              />
              <div style={{ display: 'flex', gap: 2, background: color.card, borderRadius: radius.md, padding: 2, border: `1px solid ${color.border}` }}>
                {([
                  { key: 'route', label: 'Waypoint Editor', icon: MapIcon },
                  { key: 'program', label: 'Visual Program', icon: Code2 },
                ] as const).map(({ key, label, icon: Icon }) => {
                  const active = mode === key
                  return (
                    <button
                      key={key}
                      onClick={() => setMode(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: radius.sm,
                        background: active ? color.accent : 'transparent', border: 'none',
                        color: active ? color.accentText : color.t2, fontSize: font.size.xs, fontWeight: font.weight.semibold,
                        fontFamily: font.family, cursor: 'pointer',
                      }}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  )
                })}
              </div>
            </div>

            {mode === 'route' ? (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                  <MissionMapEditor
                    waypoints={activeMission.waypoints}
                    selectedId={selectedWaypointId}
                    onSelect={setSelectedWaypointId}
                    onAddWaypoint={addWaypoint}
                  />
                </div>
                {selectedWaypoint && (
                  <WaypointInspector
                    waypoint={selectedWaypoint}
                    index={activeMission.waypoints.findIndex((wp) => wp.id === selectedWaypoint.id)}
                    total={activeMission.waypoints.length}
                    onUpdate={(patch) => updateWaypoint(selectedWaypoint.id, patch)}
                    onRemove={() => removeWaypoint(selectedWaypoint.id)}
                  />
                )}
              </div>
            ) : (
              <BlocklyEditor
                initialState={activeMission.program_state}
                onCompile={(waypoints, state) => updateActiveMission({ waypoints, program_state: state })}
              />
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.t3, fontSize: font.size.sm }}>
            Select a mission from the library, or start a new one.
          </div>
        )}
      </div>
    </div>
  )
}
