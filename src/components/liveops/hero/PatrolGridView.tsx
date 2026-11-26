import { useSiteRobots } from '@/org/useSiteRobots'
import { useEffect, useState } from 'react'
import { GripVertical, Map as MapIcon, Maximize2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { Button, IconButton } from '@/components/kit'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { useSiteMap } from '@/liveops/useSiteMap'
import { useTouchShell } from '@/lib/useTouchShell'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { formatBatteryPercent, batteryLevelColor } from '@/liveops/batteryDisplay'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { robotActivity } from '@/liveops/robotActivity'
import { useControlHolderNames } from '@/liveops/controlOwner'
import { robotAttention } from '@/fleet/attention'
import {
  addMap, clearSlot, GRID_SLOTS, hasMap, isMapSlot, MAP_DRAG_TYPE, MAP_SLOT, parseSavedSlots, placeRobot,
  reconcileSlots, ROBOT_DRAG_TYPE, type GridSlots,
} from '@/liveops/gridSlots'
import type { Mission, RobotState } from '@/types'
import { CameraFeedLayer } from './CameraFeedLayer'
import { attentionText } from '@/i18n/attentionText'

/** One layout per site, so switching sites doesn't wipe the other's. */
const storageKey = (siteId: string) => `rh.liveops.grid.${siteId}`

function readSaved(siteId: string): GridSlots | null {
  try {
    return parseSavedSlots(localStorage.getItem(storageKey(siteId)))
  } catch {
    return null
  }
}

/** What a drag carries: a robot (from a robot row or another slot) or the
 * map tile, as the slot value it would put down. */
function slotValueFromDrag(e: React.DragEvent): string | null {
  if (e.dataTransfer.types.includes(MAP_DRAG_TYPE)) return MAP_SLOT
  return e.dataTransfer.getData(ROBOT_DRAG_TYPE) || null
}

const acceptsDrag = (e: React.DragEvent) =>
  e.dataTransfer.types.includes(ROBOT_DRAG_TYPE) || e.dataTransfer.types.includes(MAP_DRAG_TYPE)

const selectStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: radius.sm, background: color.card,
  border: `1px solid ${color.border}`, color: color.t1, fontFamily: font.family, fontSize: font.size.md,
}

function Slot({
  index, robot, isMap, mapRobot, mapMission, robots, selected, onPlace, onClear, onSelect, onOpen,
}: {
  index: number
  robot: RobotState | undefined
  /** This slot holds the map tile. */
  isMap: boolean
  /** The robot the map follows: the selected one. */
  mapRobot: RobotState | undefined
  mapMission: Mission | undefined
  robots: RobotState[]
  selected: boolean
  onPlace: (robotId: string) => void
  onClear: () => void
  onSelect: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const missions = useLiveOpsStore((s) => s.missions)
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const [over, setOver] = useState(false)
  const attention = robot ? robotAttention(robot) : null
  const edge = attention?.severity === 'critical' ? color.red : selected ? color.accent : over ? color.accent : 'transparent'

  return (
    <div
      onDragOver={(e) => {
        if (!acceptsDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const value = slotValueFromDrag(e)
        if (value) onPlace(value)
      }}
      style={{
        position: 'relative', minWidth: 0, minHeight: 0, background: color.videoBg, overflow: 'hidden',
        outline: `2px solid ${edge}`, outlineOffset: -2,
      }}
    >
      {isMap ? (
        <MapTile robot={mapRobot} mission={mapMission} onClear={onClear} onOpen={onOpen} />
      ) : robot ? (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label={t('grid.slotAria', { name: robot.name })}
            aria-pressed={selected}
            onClick={onSelect}
            onDoubleClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelect() }}
            style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
          >
            <CameraFeedLayer robot={robot} fit={cameraFit} />
          </div>

          {/* Top: who, and what state. The grip lets the slot itself be
              dragged onto another slot to swap them. */}
          <div className="rh-on-video" style={{
            position: 'absolute', top: 8, left: 8, right: 8, zIndex: 880,
            display: 'flex', alignItems: 'center', gap: space[2], pointerEvents: 'none',
          }}>
            <span
              draggable
              onDragStart={(e) => { e.dataTransfer.setData(ROBOT_DRAG_TYPE, robot.robot_id); e.dataTransfer.effectAllowed = 'move' }}
              title={t('grid.dragToSwap')}
              className="rh-video-label"
              style={{ pointerEvents: 'auto', cursor: 'grab', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <GripVertical size={12} aria-hidden />
              <b style={{ fontWeight: font.weight.semibold }}>{robot.name}</b>
            </span>
            <span className="rh-video-label" style={{ color: stateVisualFor(robot.abstract_state, robot.sdk_state).color }}>
              {stateVisualFor(robot.abstract_state, robot.sdk_state).label}
            </span>
            {attention && (
              <span className="rh-video-label" style={attention.severity === 'critical'
                ? { background: color.red, color: '#fff' }
                : { color: color.amber }}>
                {attentionText(t, attention)}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={onClear}
              aria-label={t('grid.removeAria', { name: robot.name })}
              title={t('grid.remove')}
              className="rh-video-label"
              style={{ pointerEvents: 'auto', cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              <X size={12} aria-hidden />
            </button>
          </div>

          {/* Bottom: the numbers worth scanning across four robots. */}
          <div className="rh-on-video" style={{
            position: 'absolute', left: 8, right: 8, bottom: 8, zIndex: 880, pointerEvents: 'none',
            display: 'flex', gap: space[2], flexWrap: 'wrap',
          }}>
            <span className="rh-video-label" style={{ color: batteryLevelColor(robot.battery.percent) }}>
              {t('grid.battery')} {formatBatteryPercent(robot.battery.percent)}
            </span>
            <span className="rh-video-label">{robot.speed_mps.toFixed(1)} m/s</span>
            <span className="rh-video-label">{robotActivity(robot, missions[robot.robot_id]).text}</span>
          </div>
        </>
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: space[3], border: `1px dashed ${over ? color.accent : color.borderLt}`, margin: space[3], borderRadius: radius.md,
          color: color.t2, textAlign: 'center', padding: space[4],
        }}>
          <Plus size={22} strokeWidth={1.5} aria-hidden color={over ? color.accent : color.t3} />
          <div style={{ fontSize: font.size.md }}>{t('grid.dropHere')}</div>
          <label htmlFor={`grid-slot-${index}`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {t('grid.chooseContent')}
          </label>
          {/* The map is an entry beside the robots: choosing it while it is in
              another slot moves it here, as choosing a placed robot does. */}
          <select
            id={`grid-slot-${index}`}
            value=""
            onChange={(e) => e.target.value && onPlace(e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('grid.chooseContent')}</option>
            <option value={MAP_SLOT}>{t('grid.map')}</option>
            {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

/**
 * The grid's map tile: the same live map the Cockpit shows for the selected
 * robot (MapCanvas, with the site's surveyed floor), opening zoomed in on that
 * robot and following it; a drag pauses the follow and Follow robot resumes
 * it, as on every LiveOps map. Selecting another robot's slot moves the map
 * to that robot.
 *
 * Always the flat Leaflet Plan map (`planOnly`): the 3D views are a WebGL
 * scene, and a grid already decoding up to three camera streams has no room
 * for one. A tile is small enough that MapCanvas treats it as a compact pane
 * anyway (no tools, no captions); `planOnly` keeps a large screen's tile
 * flat too.
 */
function MapTile({
  robot, mission, onClear, onOpen,
}: {
  robot: RobotState | undefined
  mission: Mission | undefined
  onClear: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const siteMap = useSiteMap()
  const title = robot ? t('grid.mapTitle', { name: robot.name }) : t('grid.map')
  return (
    <>
      {robot ? (
        <div data-testid="grid-map-tile" data-robot-id={robot.robot_id} style={{ position: 'absolute', inset: 0 }}>
          {/* The tap-to-go tools sit below the title row. */}
          <MapCanvas robot={robot} mission={mission} variant="full" planOnly {...siteMap} navToolsAt={{ top: 44, left: 8 }} />
        </div>
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color.t3, fontSize: font.size.md, padding: space[4], textAlign: 'center',
        }}>
          {t('grid.mapNoRobot')}
        </div>
      )}
      <div className="rh-on-video" style={{
        position: 'absolute', top: 8, left: 8, right: 8, zIndex: 880,
        display: 'flex', alignItems: 'center', gap: space[2], pointerEvents: 'none',
      }}>
        <span
          draggable
          onDragStart={(e) => { e.dataTransfer.setData(MAP_DRAG_TYPE, MAP_SLOT); e.dataTransfer.effectAllowed = 'move' }}
          title={t('grid.dragToSwap')}
          className="rh-video-label"
          style={{ pointerEvents: 'auto', cursor: 'grab', display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}
        >
          <GripVertical size={12} aria-hidden />
          <b style={{ fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</b>
        </span>
        <span style={{ flex: 1 }} />
        <div className="rh-video-bar" style={{ pointerEvents: 'auto', display: 'inline-flex', gap: 2 }}>
          {robot && (
            <IconButton size="sm" icon={Maximize2} label={t('grid.openCockpit', { name: robot.name })} onClick={onOpen} />
          )}
          <IconButton size="sm" icon={X} label={t('grid.removeMap')} onClick={onClear} />
        </div>
      </div>
    </>
  )
}

/**
 * The 2×2 patrol grid: up to four robots' live front cameras at once, for
 * watching several robots during a patrol.
 *
 * Robots go into slots by dragging a robot from the left rail onto a slot, by
 * dragging one slot onto another to swap them, or with the "Choose robot"
 * menu in an empty slot (the keyboard route). A robot sits in at most one
 * slot. Clicking a slot selects that robot, so the command bar and E-Stop act
 * on it; double-clicking opens it in the Cockpit view. A slot whose robot has
 * a critical problem (fallen, E-Stop, fault) is outlined in red.
 *
 * One slot may hold the live map instead (MapTile), chosen from an empty
 * slot's menu or with Add map; it follows the selected robot. Narrow screens
 * stack the slots in one scrolling column, since four panes side by side on a
 * phone are each too small to read.
 *
 * The layout is
 * kept per browser.
 */
export function PatrolGridView({ robot: focused, mission: focusedMission }: {
  /** The robot LiveOps has selected, which the map tile follows; defaults to
   * the session's selected robot. */
  robot?: RobotState
  mission?: Mission
} = {}) {
  const { t } = useTranslation()
  const { narrow } = useTouchShell()
  const robots = useSiteRobots()
  const missions = useLiveOpsStore((s) => s.missions)
  // Each slot's "Driven by <name>": re-render when a name arrives.
  useControlHolderNames(robots.map((r) => r.control_owner))
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const setViewMode = useSessionStore((s) => s.setViewMode)
  const siteId = useSessionStore((s) => s.activeSiteId)
  const [firstVisit] = useState(() => readSaved(siteId) === null)
  const [slots, setSlots] = useState<GridSlots>(() => readSaved(siteId) ?? Array.from({ length: GRID_SLOTS }, () => null))

  const ids = robots.map((r) => r.robot_id).join('|')
  useEffect(() => {
    setSlots((s) => {
      const next = reconcileSlots(s, ids ? ids.split('|') : [], firstVisit)
      return next.every((v, i) => v === s[i]) ? s : next
    })
  }, [ids, firstVisit])

  useEffect(() => {
    try { localStorage.setItem(storageKey(siteId), JSON.stringify(slots)) } catch { /* per-viewer convenience only */ }
  }, [slots, siteId])

  const byId = new Map(robots.map((r) => [r.robot_id, r]))
  const filled = slots.filter((v) => v && !isMapSlot(v)).length
  const mapRobot = focused ?? (selectedRobotId ? byId.get(selectedRobotId) : undefined) ?? robots[0]
  const mapMission = focused && mapRobot === focused ? focusedMission : mapRobot ? missions[mapRobot.robot_id] : undefined
  const mapShown = hasMap(slots)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
      <div style={{
        flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        padding: `${space[2]}px ${space[4]}px`, fontSize: font.size.sm, color: color.t3,
        display: 'flex', alignItems: 'center', gap: space[3],
      }}>
        {/* The drag instructions are for a mouse and a wide pane; on a narrow
            one they wrap to a column that leaves the slots no height. */}
        <span style={{ flex: 1, minWidth: 0 }}>{narrow ? null : t('grid.hint', { count: filled })}</span>
        {!mapShown && (
          <Button size="sm" icon={MapIcon} title={t('grid.addMapTitle')} style={{ flexShrink: 0 }}
            onClick={() => setSlots((s) => addMap(s, mapRobot?.robot_id ?? null))}>
            {t('grid.addMap')}
          </Button>
        )}
      </div>
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 2, background: color.border,
        ...(narrow
          ? { gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'minmax(240px, 42vh)', overflowY: 'auto' }
          : { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }),
      }}>
        {slots.map((id, i) => (
          <Slot
            key={i}
            index={i}
            robot={id && !isMapSlot(id) ? byId.get(id) : undefined}
            isMap={isMapSlot(id)}
            mapRobot={mapRobot}
            mapMission={mapMission}
            robots={robots}
            selected={!!id && !isMapSlot(id) && id === selectedRobotId}
            // placeRobot is placeMap for the map's token: either way an item
            // already on the grid swaps rather than appearing twice.
            onPlace={(value) => setSlots((s) => placeRobot(s, i, value))}
            onClear={() => setSlots((s) => clearSlot(s, i))}
            onSelect={() => { if (id && !isMapSlot(id)) setSelectedRobot(id) }}
            onOpen={() => {
              // The map tile opens the robot it follows.
              const target = isMapSlot(id) ? mapRobot?.robot_id : id
              if (target) { setSelectedRobot(target); setViewMode('cockpit') }
            }}
          />
        ))}
      </div>
      <CommandAckToast />
    </div>
  )
}
