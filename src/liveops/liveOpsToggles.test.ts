import { describe, expect, it } from 'vitest'
import { VIEW_MEMORY_PREFIX } from '@/lib/viewMemory'
import {
  COCKPIT_MAIN_KEY, DUALCAM_MAP_KEY, MAP_DOCK_SIZE_KEY, TOUCH_DRIVE_FULL_KEY,
  isCockpitMain, isDockSize, isShowMap, isTouchDriveFull,
} from './liveOpsToggles'

/**
 * The per-viewer layout toggles inside LiveOps' views. Each is remembered for
 * the viewer, not per robot: which picture is big is how this person likes the
 * layout, whatever robot is in it.
 */
describe('the toggle keys', () => {
  it('are distinct and under the view-memory prefix', () => {
    const keys = [COCKPIT_MAIN_KEY, MAP_DOCK_SIZE_KEY, DUALCAM_MAP_KEY, TOUCH_DRIVE_FULL_KEY]
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) expect(k.startsWith(`${VIEW_MEMORY_PREFIX}liveops.`), k).toBe(true)
  })
})

describe('the toggle validators', () => {
  it('accept exactly their unions', () => {
    expect(['camera', 'map'].every(isCockpitMain)).toBe(true)
    expect(['sm', 'lg'].every(isDockSize)).toBe(true)
    expect([true, false].every(isShowMap)).toBe(true)
    expect(['camera', 'map'].every(isTouchDriveFull)).toBe(true)
  })

  it('reject anything else', () => {
    for (const v of [null, undefined, '', 'md', 'video', 1, 0, 'true', {}]) {
      expect(isCockpitMain(v), String(v)).toBe(false)
      expect(isDockSize(v), String(v)).toBe(false)
      expect(isShowMap(v), String(v)).toBe(false)
      expect(isTouchDriveFull(v), String(v)).toBe(false)
    }
  })
})
