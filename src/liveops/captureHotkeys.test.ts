import { describe, expect, it } from 'vitest'
import { captureActionFor } from './captureHotkeys'

describe('captureActionFor', () => {
  it('maps P to a photo and R to record, either case', () => {
    expect(captureActionFor({ key: 'p' })).toBe('photo')
    expect(captureActionFor({ key: 'P' })).toBe('photo')
    expect(captureActionFor({ key: 'r' })).toBe('record')
  })

  it('ignores key repeat, so holding P takes one photo', () => {
    expect(captureActionFor({ key: 'p', repeat: true })).toBeNull()
  })

  it('leaves browser chords alone', () => {
    expect(captureActionFor({ key: 'p', ctrlKey: true })).toBeNull()
    expect(captureActionFor({ key: 'p', metaKey: true })).toBeNull()
    expect(captureActionFor({ key: 'r', altKey: true })).toBeNull()
  })

  it('ignores typing in fields', () => {
    expect(captureActionFor({ key: 'p', targetTag: 'input' })).toBeNull()
    expect(captureActionFor({ key: 'p', targetTag: 'TEXTAREA' })).toBeNull()
    expect(captureActionFor({ key: 'p', targetTag: 'SELECT' })).toBeNull()
    expect(captureActionFor({ key: 'p', targetTag: 'DIV', targetEditable: true })).toBeNull()
  })

  it('does not claim the teleop keys', () => {
    for (const key of ['w', 'a', 's', 'd', 'q', 'e', ' ']) {
      expect(captureActionFor({ key })).toBeNull()
    }
  })
})
