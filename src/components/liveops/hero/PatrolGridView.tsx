import { useSiteRobots } from '@/org/useSiteRobots'
import { useEffect, useState } from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { formatBatteryPercent, batteryLevelColor } from '@/liveops/batteryDisplay'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { robotActivity } from '@/liveops/robotActivity'
import { robotAttention } from '@/fleet/attention'
import {
  clearSlot, GRID_SLOTS, parseSavedSlots, placeRobot, reconcileSlots, ROBOT_DRAG_TYPE, type GridSlots,
} from '@/liveops/gridSlots'
import type { RobotState } from '@/types'
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

/** Where a drag came from: a robot row (just an id) or another slot. */
function robotFromDrag(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(ROBOT_DRAG_TYPE) || null
}

const selectStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: radius.sm, background: color.card,
  border: `1px solid ${color.border}`, color: color.t1, fontFamily: font.family, fontSize: font.size.md,
}

function Slot({
  index, robot, robots, selected, onPlace, onClear, onSelect, onOpen,
}: {
  index: number
  robot: RobotState | undefined
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
        if (!e.dataTransfer.types.includes(ROBOT_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const id = robotFromDrag(e)
        if (id) onPlace(id)
      }}
      style={{
        position: 'relative', minWidth: 0, minHeight: 0, background: color.videoBg, overflow: 'hidden',
        outline: `2px solid ${edge}`, outlineOffset: -2,
      }}
    >
      {robot ? (
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
            <CameraFeedLayer robot={robot} muted fit={cameraFit} />
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
            {t('grid.chooseRobot')}
          </label>
          <select
            id={`grid-slot-${index}`}
            value=""
            onChange={(e) => e.target.value && onPlace(e.target.value)}
            style={selectStyle}
          >
            <option value="">{t('grid.chooseRobot')}</option>
            {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.name}</option>)}
          </select>
        </div>
      )}
    </div>
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
 * Feeds are muted: four copies of patrol audio would be noise. The layout is
 * kept per browser.
 */
export function PatrolGridView() {
  const { t } = useTranslation()
  const robots = useSiteRobots()
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
  const filled = slots.filter(Boolean).length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, position: 'relative' }}>
      <div style={{
        flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        padding: `${space[2]}px ${space[4]}px`, fontSize: font.size.sm, color: color.t3,
      }}>
        {t('grid.hint', { count: filled })}
      </div>
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 2, background: color.border,
        gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
      }}>
        {slots.map((id, i) => (
          <Slot
            key={i}
            index={i}
            robot={id ? byId.get(id) : undefined}
            robots={robots}
            selected={!!id && id === selectedRobotId}
            onPlace={(robotId) => setSlots((s) => placeRobot(s, i, robotId))}
            onClear={() => setSlots((s) => clearSlot(s, i))}
            onSelect={() => id && setSelectedRobot(id)}
            onOpen={() => { if (id) { setSelectedRobot(id); setViewMode('cockpit') } }}
          />
        ))}
      </div>
      <CommandAckToast />
    </div>
  )
}
