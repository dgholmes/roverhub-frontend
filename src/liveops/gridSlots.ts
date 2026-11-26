/**
 * The 2×2 patrol grid's slot assignments: what sits in each of the four
 * slots -- a robot's live feed (its id), the live map (`MAP_SLOT`), or nothing.
 * Pure functions over a fixed-length array, so the drag-and-drop rules are
 * testable without a DOM.
 */
export const GRID_SLOTS = 4
export type GridSlots = (string | null)[]

/**
 * The map's token in a slot. A robot id is a level of its MQTT topics
 * (`roverhub/{site}/{robot}/state`), and MQTT forbids `#` in a topic it
 * publishes on, so no robot can ever have this id. Saved layouts from before
 * the map tile (robot ids and nulls) read unchanged.
 */
export const MAP_SLOT = '#map'

/** Drag payload type for a robot being dragged onto a slot. */
export const ROBOT_DRAG_TYPE = 'application/x-roverhub-robot'
/** Drag payload type for the map tile being dragged onto another slot. */
export const MAP_DRAG_TYPE = 'application/x-roverhub-map'

export const isMapSlot = (v: string | null | undefined): boolean => v === MAP_SLOT

export function emptySlots(): GridSlots {
  return Array.from({ length: GRID_SLOTS }, () => null)
}

/**
 * Put a robot (or, with `MAP_SLOT`, the map) into a slot. Each appears in at
 * most one slot, so if it is already elsewhere the two slots swap: dragging
 * Atlas onto Rex's slot moves Rex to where Atlas was, rather than duplicating
 * Atlas or dropping Rex.
 */
export function placeRobot(slots: GridSlots, index: number, robotId: string): GridSlots {
  if (index < 0 || index >= slots.length) return slots
  const next = [...slots]
  const from = next.indexOf(robotId)
  if (from === index) return slots
  if (from !== -1) next[from] = next[index]
  next[index] = robotId
  return next
}

/** Put the map into a slot, by the same rules as a robot. */
export function placeMap(slots: GridSlots, index: number): GridSlots {
  return placeRobot(slots, index, MAP_SLOT)
}

export function hasMap(slots: GridSlots): boolean {
  return slots.includes(MAP_SLOT)
}

/**
 * "Add map": the first empty slot, or, with the grid full, the last slot that
 * is not the selected robot's -- the operator is working with that one. No
 * change when the map is already on the grid.
 */
export function addMap(slots: GridSlots, selectedRobotId: string | null): GridSlots {
  if (hasMap(slots)) return slots
  const free = slots.indexOf(null)
  if (free !== -1) return placeMap(slots, free)
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i] !== selectedRobotId) return placeMap(slots, i)
  }
  return slots
}

export function clearSlot(slots: GridSlots, index: number): GridSlots {
  if (index < 0 || index >= slots.length || slots[index] === null) return slots
  const next = [...slots]
  next[index] = null
  return next
}

/**
 * Keep slots honest against the robots that exist: a robot that is gone
 * leaves its slot empty; the map is not a robot and stays. When nothing has
 * been placed yet (a first visit), fills the grid with the first robots so it
 * opens showing something -- robots only, never the map.
 */
export function reconcileSlots(slots: GridSlots, robotIds: string[], firstVisit: boolean): GridSlots {
  const known = new Set(robotIds)
  const kept = Array.from({ length: GRID_SLOTS }, (_, i) => {
    const id = slots[i] ?? null
    return id && (isMapSlot(id) || known.has(id)) ? id : null
  })
  if (firstVisit && kept.every((s) => s === null)) {
    return Array.from({ length: GRID_SLOTS }, (_, i) => robotIds[i] ?? null)
  }
  return kept
}

/**
 * Saved slots from storage; anything malformed reads as a first visit. A slot
 * holds a robot id, the map, or null: any other value -- not a string, empty,
 * or another `#` token (a newer build's tile this one cannot draw) -- reads
 * as empty, and a second map reads as empty too.
 */
export function parseSavedSlots(raw: string | null): GridSlots | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return null
    let mapSeen = false
    return Array.from({ length: GRID_SLOTS }, (_, i) => {
      const s: unknown = v[i]
      if (typeof s !== 'string' || s === '') return null
      if (isMapSlot(s)) {
        if (mapSeen) return null
        mapSeen = true
        return s
      }
      return s.startsWith('#') ? null : s
    })
  } catch {
    return null
  }
}
