import { describe, expect, it, vi } from 'vitest'
import { acceptGrantedStream, releaseRecorder, shouldFinishRecording } from './recorderCleanup'

describe('recorder cleanup', () => {
  it('stops an active recorder and every track on unmount', () => {
    const stop = vi.fn()
    const t1 = { stop: vi.fn() }, t2 = { stop: vi.fn() }
    const rec = { state: 'recording', stop } as unknown as MediaRecorder
    releaseRecorder(rec, { getTracks: () => [t1, t2] } as unknown as MediaStream)
    expect(stop).toHaveBeenCalledOnce()
    expect(t1.stop).toHaveBeenCalledOnce()
    expect(t2.stop).toHaveBeenCalledOnce()
  })
  it('does not call stop on an already inactive recorder, but still frees tracks', () => {
    const stop = vi.fn(), tr = { stop: vi.fn() }
    releaseRecorder({ state: 'inactive', stop } as unknown as MediaRecorder, { getTracks: () => [tr] } as unknown as MediaStream)
    expect(stop).not.toHaveBeenCalled()
    expect(tr.stop).toHaveBeenCalledOnce()
  })
  it('tolerates nothing to release', () => {
    expect(() => releaseRecorder(null, null)).not.toThrow()
  })
  it('only finishes (upload/onChange) while still mounted', () => {
    expect(shouldFinishRecording(true)).toBe(true)
    expect(shouldFinishRecording(false)).toBe(false)
  })
})

describe('stream granted after unmount', () => {
  it('releases the stream and refuses when unmounted', () => {
    const tr = { stop: vi.fn() }
    expect(acceptGrantedStream(false, { getTracks: () => [tr] } as unknown as MediaStream)).toBe(false)
    expect(tr.stop).toHaveBeenCalledOnce()
  })
  it('keeps the stream when still mounted', () => {
    const tr = { stop: vi.fn() }
    expect(acceptGrantedStream(true, { getTracks: () => [tr] } as unknown as MediaStream)).toBe(true)
    expect(tr.stop).not.toHaveBeenCalled()
  })
})
