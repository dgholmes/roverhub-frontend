import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadClips, saveClip } from './clipLibrary'

// vitest runs in the node environment, which has no localStorage.
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k) },
    setItem: (k, v) => { m.set(k, String(v)) },
  }
}

describe('clip library', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
  afterEach(() => { vi.unstubAllGlobals() })
  it('saves newest first, de-duplicates by clip id, caps at 50, per site', () => {
    for (let i = 0; i < 55; i++) saveClip('s1', { clip_id: `c${i}`, label: `L${i}`, text: null, created_at: `2026-10-15T00:00:${String(i).padStart(2, '0')}Z` })
    saveClip('s1', { clip_id: 'c54', label: 'again', text: null, created_at: 'z' })
    const clips = loadClips('s1')
    expect(clips).toHaveLength(50)
    expect(clips[0]).toMatchObject({ clip_id: 'c54', label: 'again' })
    expect(clips.filter((c) => c.clip_id === 'c54')).toHaveLength(1)
    expect(loadClips('s2')).toEqual([])
  })
  it('survives corrupt storage', () => {
    localStorage.setItem('rh.clips.s1', '{nope')
    expect(loadClips('s1')).toEqual([])
  })
})
