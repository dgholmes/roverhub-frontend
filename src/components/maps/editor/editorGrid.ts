import type { GridPixels } from '@/missions/floorCells'
import { buildSceneGrid } from '@/scene3d/sceneData'
import type { SceneGrid } from '@/scene3d/types'
import type { MapFloor } from '@/types/maps'
import type { FloorFrame } from './gridEdit'

/** A floor's grid frame. */
export function floorFrame(floor: Pick<MapFloor, 'size_cells' | 'resolution_m' | 'origin_xy_m'>): FloorFrame {
  return { w: floor.size_cells[0], h: floor.size_cells[1], res: floor.resolution_m, origin: [floor.origin_xy_m[0], floor.origin_xy_m[1]] }
}

/**
 * The cell bits the editor paints: the scene's own rules (buildSceneGrid) --
 * walls from the survey grid, furniture and walkable from the planning grid,
 * and a cell the planning grid calls free shown walkable even where the survey
 * grid has a wall. The editor shows what the planner will see, so an erased
 * cell must look erased; the survey grid itself is not edited. The rule lives
 * in buildSceneGrid so LiveOps and Missions draw the same cleaned floor.
 */
export function editorSceneGrid(structure: GridPixels, planning: GridPixels, frame: FloorFrame): SceneGrid {
  return buildSceneGrid(structure, planning, frame.res, frame.origin)
}

/** Whether the planning grid can be edited over this survey grid: the same size. */
export function planningMatches(structure: GridPixels, planning: GridPixels | null): planning is GridPixels {
  return planning !== null && planning.width === structure.width && planning.height === structure.height
}

/** The edited bytes as a GridPixels, for the grid builders. */
export const pixelsOf = (frame: FloorFrame, pixels: Uint8Array): GridPixels => ({ width: frame.w, height: frame.h, pixels })
