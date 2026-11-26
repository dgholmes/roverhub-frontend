import { viewKey } from '@/lib/viewMemory'

/**
 * The layout toggles inside LiveOps' views, remembered for the viewer with
 * `useRemembered` so a reload keeps them (2026-11-26).
 *
 * Per viewer, not per robot or site: which picture is big, or whether the map
 * inset is up, is how this person likes the layout, whatever robot is in it.
 * The camera itself is different and lives in `cameraChoice.ts`.
 *
 * Deliberately not here: anything about driving (held directions, game mode,
 * the look target) and the session store's `liveOpsImmersed`, which is where
 * this visit to LiveOps has got to rather than a standing preference.
 */

/** Cockpit (HeroView): whether the camera or the map has the pane. */
export const COCKPIT_MAIN_KEY = viewKey('liveops', 'cockpit', 'main')
export type CockpitMain = 'camera' | 'map'
export const isCockpitMain = (v: unknown): v is CockpitMain => v === 'camera' || v === 'map'

/** Map view (MapFirstView): the camera dock's size. */
export const MAP_DOCK_SIZE_KEY = viewKey('liveops', 'map', 'dockSize')
export type DockSize = 'sm' | 'lg'
export const isDockSize = (v: unknown): v is DockSize => v === 'sm' || v === 'lg'

/** Dual cam (DualCamView): whether the map inset is shown. */
export const DUALCAM_MAP_KEY = viewKey('liveops', 'dualcam', 'showMap')
export const isShowMap = (v: unknown): v is boolean => typeof v === 'boolean'

/** The touch driving body in landscape: which picture has the body. */
export const TOUCH_DRIVE_FULL_KEY = viewKey('liveops', 'touchDrive', 'full')
export type TouchDriveFull = 'camera' | 'map'
export const isTouchDriveFull = (v: unknown): v is TouchDriveFull => v === 'camera' || v === 'map'
