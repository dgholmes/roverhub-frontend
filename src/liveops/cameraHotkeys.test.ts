import { describe, expect, it } from 'vitest'
import { cameraModeFor } from './cameraHotkeys'

describe('cameraModeFor', () => {
  it('maps 1 to RGB and 2 to Depth', () => {
    expect(cameraModeFor({ key: '1' })).toBe('rgb')
    expect(cameraModeFor({ key: '2' })).toBe('depth')
    expect(cameraModeFor({ key: '3' })).toBeNull()
  })

  it('leaves browser chords alone', () => {
    expect(cameraModeFor({ key: '1', ctrlKey: true })).toBeNull()
    expect(cameraModeFor({ key: '1', metaKey: true })).toBeNull()
    expect(cameraModeFor({ key: '2', altKey: true })).toBeNull()
  })

  it('ignores typing and held keys', () => {
    expect(cameraModeFor({ key: '1', targetTag: 'input' })).toBeNull()
    expect(cameraModeFor({ key: '1', targetTag: 'TEXTAREA' })).toBeNull()
    expect(cameraModeFor({ key: '1', targetEditable: true })).toBeNull()
    expect(cameraModeFor({ key: '1', repeat: true })).toBeNull()
  })

  it('does not claim teleop or capture keys', () => {
    for (const key of ['w', 'a', 's', 'd', 'q', 'e', ' ', 'p', 'r']) expect(cameraModeFor({ key })).toBeNull()
  })
})
