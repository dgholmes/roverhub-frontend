import { describe, expect, it } from 'vitest'
import { parseCssColor, rgbCss } from './cssColor'

describe('parseCssColor', () => {
  it('reads the forms theme.css uses', () => {
    expect(parseCssColor(' #30d158 ')).toEqual([48, 209, 88])
    expect(parseCssColor('#fff')).toEqual([255, 255, 255])
    expect(parseCssColor('rgb(31, 138, 59)')).toEqual([31, 138, 59])
    expect(parseCssColor('rgba(31, 138, 59, 0.10)')).toEqual([31, 138, 59])
  })

  it('refuses what it cannot read', () => {
    for (const v of ['', 'green', 'var(--rh-green)', '#12345']) expect(parseCssColor(v)).toBeNull()
  })

  it('writes a colour back with its alpha', () => {
    expect(rgbCss([1, 2, 3], 0.5)).toBe('rgba(1, 2, 3, 0.5)')
  })
})
