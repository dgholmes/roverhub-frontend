// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ROBOT_MARKER, ROBOT_MARKER_KEY, getRobotMarkerStyle,
  resetRobotMarkerStyleForTests, setRobotMarkerStyle,
} from './robotMarkerPref'

beforeEach(() => {
  localStorage.clear()
  resetRobotMarkerStyleForTests()
})
afterEach(() => vi.restoreAllMocks())

describe('robot marker preference', () => {
  // The new marker is the default; the classic one is the choice (user, 2026-11-25).
  it('starts on the body marker', () => {
    expect(DEFAULT_ROBOT_MARKER).toBe('body')
    expect(getRobotMarkerStyle()).toBe('body')
  })

  it('remembers classic across a reload', () => {
    setRobotMarkerStyle('classic')
    expect(localStorage.getItem(ROBOT_MARKER_KEY)).toBe('classic')
    resetRobotMarkerStyleForTests()
    expect(getRobotMarkerStyle()).toBe('classic')
  })

  it('reads anything it does not recognise as the default', () => {
    localStorage.setItem(ROBOT_MARKER_KEY, 'triangle')
    expect(getRobotMarkerStyle()).toBe('body')
  })

  it('still works in a browser that refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(getRobotMarkerStyle()).toBe('body')
    expect(() => setRobotMarkerStyle('classic')).not.toThrow()
    expect(getRobotMarkerStyle()).toBe('classic')
  })
})
