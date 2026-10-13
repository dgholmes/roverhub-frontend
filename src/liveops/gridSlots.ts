/**
 * The 2×2 patrol grid's slot assignments: which robot's live feed sits in
 * which of the four slots. Pure functions over a fixed-length array, so the
 * drag-and-drop rules are testable without a DOM.
 */
export const GRID_SLOTS = 4
export type GridSlots = (string | null)[]

/** Drag payload type for a robot being dragged onto a slot. */
export const ROBOT_DRAG_TYPE = 'application/x-roverhub-robot'

export function emptySlots(): GridSlots {
  return Array.from({ length: GRID_SLOTS }, () => null)
}

/**
 * Put a robot into a slot. A robot appears in at most one slot, so if it is
 * already elsewhere the two slots swap: dragging Atlas onto Rex's slot moves
 * Rex to where Atlas was, rather than duplicating Atlas or dropping Rex.
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

export function clearSlot(slots: GridSlots, index: number): GridSlots {
  if (index < 0 || index >= slots.length || slots[index] === null) return slots
  const next = [...slots]
  next[index] = null
  return next
}

/**
 * Keep slots honest against the robots that exist: a robot that is gone
 * leaves its slot empty. When nothing has been placed yet (a first visit),
 * fills the grid with the first robots so it opens showing something.
 */
export function reconcileSlots(slots: GridSlots, robotIds: string[], firstVisit: boolean): GridSlots {
  const known = new Set(robotIds)
  const kept = Array.from({ length: GRID_SLOTS }, (_, i) => {
    const id = slots[i] ?? null
    return id && known.has(id) ? id : null
  })
  if (firstVisit && kept.every((s) => s === null)) {
    return Array.from({ length: GRID_SLOTS }, (_, i) => robotIds[i] ?? null)
  }
  return kept
}

/** Saved slots from storage; anything malformed reads as a first visit. */
export function parseSavedSlots(raw: string | null): GridSlots | null {
  if (!raw) return null
  try {
    const v: unknown = JSON.parse(raw)
    if (!Array.isArray(v)) return null
    return Array.from({ length: GRID_SLOTS }, (_, i) => (typeof v[i] === 'string' ? (v[i] as string) : null))
  } catch {
    return null
  }
}
