import { describe, expect, it } from 'vitest'
import { clearSlot, emptySlots, parseSavedSlots, placeRobot, reconcileSlots } from './gridSlots'

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
