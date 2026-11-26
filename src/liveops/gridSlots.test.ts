import { describe, expect, it } from 'vitest'
import {
  addMap, clearSlot, emptySlots, hasMap, MAP_SLOT, parseSavedSlots, placeMap, placeRobot, reconcileSlots,
} from './gridSlots'

describe('placeRobot', () => {
  it('puts a robot into an empty slot', () => {
    expect(placeRobot(emptySlots(), 2, 'a')).toEqual([null, null, 'a', null])
  })
  it('replaces whoever was in the slot when the robot was not on the grid', () => {
    expect(placeRobot(['a', 'b', null, null], 1, 'c')).toEqual(['a', 'c', null, null])
  })
  it('swaps when the robot is already in another slot', () => {
    expect(placeRobot(['a', 'b', null, null], 1, 'a')).toEqual(['b', 'a', null, null])
  })
  it('moves into an empty slot, leaving the old one empty', () => {
    expect(placeRobot(['a', null, null, null], 3, 'a')).toEqual([null, null, null, 'a'])
  })
  it('ignores an out-of-range slot', () => {
    const s = emptySlots()
    expect(placeRobot(s, 9, 'a')).toBe(s)
  })
})

describe('clearSlot', () => {
  it('empties a slot', () => expect(clearSlot(['a', 'b', null, null], 0)).toEqual([null, 'b', null, null]))
})

describe('reconcileSlots', () => {
  it('drops robots that no longer exist', () => {
    expect(reconcileSlots(['a', 'gone', null, null], ['a', 'b'], false)).toEqual(['a', null, null, null])
  })
  it('fills the grid on a first visit', () => {
    expect(reconcileSlots(emptySlots(), ['a', 'b', 'c'], true)).toEqual(['a', 'b', 'c', null])
  })
  it('respects a grid the user emptied on purpose', () => {
    expect(reconcileSlots(emptySlots(), ['a', 'b'], false)).toEqual([null, null, null, null])
  })
})

describe('parseSavedSlots', () => {
  it('reads saved slots', () => expect(parseSavedSlots('["a",null,"b"]')).toEqual(['a', null, 'b', null]))
  it('treats junk as a first visit', () => {
    expect(parseSavedSlots('nope')).toBeNull()
    expect(parseSavedSlots('{"a":1}')).toBeNull()
    expect(parseSavedSlots(null)).toBeNull()
  })
})

describe('the map tile', () => {
  const M = MAP_SLOT
  it('goes into an empty slot', () => expect(placeMap(emptySlots(), 1)).toEqual([null, M, null, null]))
  it('replaces a robot that was not elsewhere', () => {
    expect(placeMap(['a', 'b', null, null], 0)).toEqual([M, 'b', null, null])
  })
  it('appears at most once: placing it again swaps with what was there', () => {
    expect(placeMap([M, 'b', null, null], 1)).toEqual(['b', M, null, null])
    expect(placeMap([M, null, null, null], 3)).toEqual([null, null, null, M])
  })
  it('swaps when a robot already on the grid is placed onto it', () => {
    expect(placeRobot(['a', M, null, null], 1, 'a')).toEqual([M, 'a', null, null])
  })
  it('clears like a robot', () => expect(clearSlot([M, 'a', null, null], 0)).toEqual([null, 'a', null, null]))
  it('cannot collide with a robot id: # is illegal in an MQTT topic level the bridge publishes on', () => {
    expect(M.startsWith('#')).toBe(true)
  })
  it('is kept by reconcile, which only drops robots that are gone', () => {
    expect(reconcileSlots([M, 'gone', 'a', null], ['a'], false)).toEqual([M, null, 'a', null])
  })
  it('stops a first visit refilling the grid, and a first visit never adds it', () => {
    expect(reconcileSlots([M, null, null, null], ['a', 'b'], true)).toEqual([M, null, null, null])
    expect(hasMap(reconcileSlots(emptySlots(), ['a', 'b', 'c', 'd', 'e'], true))).toBe(false)
  })
})

describe('addMap', () => {
  it('uses the first free slot', () => expect(addMap(['a', null, 'b', null], 'a')).toEqual(['a', MAP_SLOT, 'b', null]))
  it('on a full grid, replaces the last slot that is not the selected robot', () => {
    expect(addMap(['a', 'b', 'c', 'd'], 'd')).toEqual(['a', 'b', MAP_SLOT, 'd'])
    expect(addMap(['a', 'b', 'c', 'd'], null)).toEqual(['a', 'b', 'c', MAP_SLOT])
  })
  it('does nothing when the map is already there', () => {
    const s = ['a', MAP_SLOT, null, null]
    expect(addMap(s, 'a')).toBe(s)
  })
})

describe('parseSavedSlots with the map', () => {
  it('reads an old layout (robot ids and nulls) unchanged', () => {
    expect(parseSavedSlots('["a",null,"b","c"]')).toEqual(['a', null, 'b', 'c'])
  })
  it('reads a layout with the map', () => {
    expect(parseSavedSlots(`[null,"${MAP_SLOT}","a"]`)).toEqual([null, MAP_SLOT, 'a', null])
  })
  it('keeps only the first of two maps', () => {
    expect(parseSavedSlots(`["${MAP_SLOT}","${MAP_SLOT}"]`)).toEqual([MAP_SLOT, null, null, null])
  })
  it('reads anything else as empty: numbers, objects, empty strings, unknown # tokens', () => {
    expect(parseSavedSlots('[1,{"a":1},"","#camera","a"]')).toEqual([null, null, null, null])
    expect(parseSavedSlots('[1,{"a":1},"","a"]')).toEqual([null, null, null, 'a'])
  })
})
