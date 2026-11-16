import { useEffect, useRef, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { parsePgm, type GridPixels } from '@/missions/floorCells'
import { parseCloudBin } from '@/scene3d/sceneData'
import type { MovedLayer } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import { errorText } from '../mapPipeline'
import { planningMatches } from './editorGrid'
import { parsePcd } from './pcd'

export type EditorFloorState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  /** No survey grid stored for the floor: nothing to edit on. */
  | { status: 'unavailable' }
  | {
    status: 'ready'
    structure: GridPixels
    /** Null when the floor has no planning grid (or one of another size). */
    planning: GridPixels | null
    /** Null when the moving-object check has not been run for this floor. */
    moved: MovedLayer | null
    /** The moved layer could not be read (shown, but the rest still works). */
    movedError: string | null
  }

function pgm(bytes: ArrayBuffer, what: string): GridPixels {
  const grid = parsePgm(new Uint8Array(bytes))
  if (!grid) throw new Error(`the ${what} is not a P5 grid of the size its header says`)
  return grid
}

/**
 * The floor's grids and moved layer, read through the provider, again whenever
 * `reloadKey` changes (a save made a new version). Not cached: an editor must
 * start from what the server holds now.
 */
export function useEditorFloor(map: SiteMap, floorIndex: number, reloadKey: string): EditorFloorState {
  const [state, setState] = useState<EditorFloorState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    const load = async (): Promise<EditorFloorState> => {
      const [gridBytes, planningBytes] = await Promise.all([
        dataProvider.getMapFloorFile(map.map_id, floorIndex, 'grid'),
        dataProvider.getMapFloorFile(map.map_id, floorIndex, 'planning'),
      ])
      if (!gridBytes) return { status: 'unavailable' }
      const structure = pgm(gridBytes, 'survey grid')
      const planning = planningBytes ? pgm(planningBytes, 'planning grid') : null
      let moved: MovedLayer | null = null
      let movedError: string | null = null
      try { moved = await dataProvider.getMovedLayer(map.map_id, floorIndex) } catch (e) { movedError = errorText(e) }
      return { status: 'ready', structure, planning: planningMatches(structure, planning) ? planning : null, moved, movedError }
    }
    load()
      .then((s) => { if (!cancelled) setState(s) })
      .catch((e: unknown) => { if (!cancelled) setState({ status: 'error', error: errorText(e) }) })
    return () => { cancelled = true }
  }, [map.map_id, floorIndex, reloadKey])
  return state
}

export type EditorCloudState =
  | { status: 'idle' | 'loading' | 'none' }
  | { status: 'error'; error: string }
  /** `xyz`: map x, y, z. `movedXyh`: the moved points as x, y, height above
   *  the floor (null when the floor has none). */
  | { status: 'ready'; xyz: Float32Array; movedXyh: Float32Array | null }

/** The floor's cloud and moved points, read only once `enabled` (the 3D tab
 *  is opened): a cloud is megabytes the 2D editor never needs. */
export function useEditorCloud(map: SiteMap, floorIndex: number, floorZ: number, reloadKey: string, enabled: boolean): EditorCloudState {
  const [state, setState] = useState<{ key: string; state: EditorCloudState }>({ key: '', state: { status: 'idle' } })
  const key = `${map.map_id}/${floorIndex}/${reloadKey}`
  // The key whose load is running or done; cleared if a load is abandoned.
  const started = useRef('')
  useEffect(() => {
    if (!enabled || started.current === key) return
    started.current = key
    let cancelled = false
    let finished = false
    setState({ key, state: { status: 'loading' } })
    const load = async (): Promise<EditorCloudState> => {
      const [cloudBytes, movedBytes] = await Promise.all([
        dataProvider.getMapFloorFile(map.map_id, floorIndex, 'cloud'),
        dataProvider.getMapFloorFile(map.map_id, floorIndex, 'moved_cloud').catch(() => null),
      ])
      if (!cloudBytes) return { status: 'none' }
      const xyz = parseCloudBin(cloudBytes)
      if (!xyz) throw new Error(`the cloud is ${cloudBytes.byteLength} bytes, not whole x,y,z float32 triples`)
      let movedXyh: Float32Array | null = null
      const moved = movedBytes ? parsePcd(movedBytes) : null
      if (moved) {
        movedXyh = Float32Array.from(moved)
        for (let k = 2; k < movedXyh.length; k += 3) movedXyh[k] -= floorZ
      }
      return { status: 'ready', xyz, movedXyh }
    }
    load()
      .then((s) => { finished = true; if (!cancelled) setState({ key, state: s }) })
      .catch((e: unknown) => { finished = true; if (!cancelled) setState({ key, state: { status: 'error', error: errorText(e) } }) })
    return () => {
      cancelled = true
      if (!finished && started.current === key) started.current = ''
    }
    // `map` and `floorZ` are covered by the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  return state.key === key ? state.state : { status: enabled ? 'loading' : 'idle' }
}
