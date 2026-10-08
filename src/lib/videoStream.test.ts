import { describe, expect, it } from 'vitest'
import {
  STREAM_RECYCLE_INTERVAL_MS, recycleGeneration, shouldConnectStream, streamKey,
} from './videoStream'

const base = { documentVisible: true, hasUrl: true, ddsAvailable: true, errored: false }

describe('shouldConnectStream', () => {
  it('connects when everything is ready and the tab is visible', () => {
    expect(shouldConnectStream(base)).toBe(true)
  })

  it('disconnects while the tab is hidden — the overnight-dashboard case', () => {
    expect(shouldConnectStream({ ...base, documentVisible: false })).toBe(false)
  })

  it('does not connect without a relay URL', () => {
    expect(shouldConnectStream({ ...base, hasUrl: false })).toBe(false)
  })

  it('does not connect when DDS is down — there are no frames to receive', () => {
    expect(shouldConnectStream({ ...base, ddsAvailable: false })).toBe(false)
  })

  it('does not reconnect after an error', () => {
    expect(shouldConnectStream({ ...base, errored: true })).toBe(false)
  })
})

describe('recycleGeneration', () => {
  it('starts at generation 0', () => {
    expect(recycleGeneration(0)).toBe(0)
    expect(recycleGeneration(1_000)).toBe(0)
  })

  it('advances once per interval', () => {
    expect(recycleGeneration(STREAM_RECYCLE_INTERVAL_MS)).toBe(1)
    expect(recycleGeneration(STREAM_RECYCLE_INTERVAL_MS * 3.5)).toBe(3)
  })

  it('is monotonic — a feed never goes backwards and re-blinks', () => {
    let last = -1
    for (let t = 0; t < STREAM_RECYCLE_INTERVAL_MS * 4; t += 30_000) {
      const g = recycleGeneration(t)
      expect(g).toBeGreaterThanOrEqual(last)
      last = g
    }
  })

  it('tolerates nonsense input rather than producing NaN keys', () => {
    expect(recycleGeneration(NaN)).toBe(0)
    expect(recycleGeneration(-5)).toBe(0)
    expect(recycleGeneration(1000, 0)).toBe(0)
  })
})

describe('streamKey', () => {
  it('changes when the recycle generation advances — this is what frees memory', () => {
    expect(streamKey('u', 0, true)).not.toBe(streamKey('u', 1, true))
  })

  it('changes when the camera URL changes', () => {
    expect(streamKey('front', 0, true)).not.toBe(streamKey('back', 0, true))
  })

  it('is stable across re-renders with the same inputs — no gratuitous blink', () => {
    expect(streamKey('u', 2, true)).toBe(streamKey('u', 2, true))
  })

  it('collapses to one placeholder key when disconnected, whatever the generation', () => {
    expect(streamKey('u', 7, false)).toBe('placeholder')
    expect(streamKey(undefined, 0, true)).toBe('placeholder')
  })
})
