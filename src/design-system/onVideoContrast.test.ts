import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The one contrast check a DOM sweep cannot make.
//
// Every other surface in this app can be measured in a browser by walking
// computed styles, because the thing behind the text is another element. HUD
// text on a camera pane is not: what is behind it is a video frame, whose
// luminance is whatever the robot is pointed at. A DOM-based checker scores
// that text against the pane's own background colour and reports it clean --
// which is exactly what happened in the 2026-11-18 audit, while the real
// worst case was 1.07:1.
//
// So this test does it analytically. It reads the real kit.css, composites the
// scrim over the brightest frame a camera can produce, and then composites
// each text tier of the .rh-on-video palette over that. A white frame is not a
// contrived case: it is a wall under work lights, a window, snow, or a
// blown-out highlight on a polished floor.
//
// Audit 2026-11-18 §4.3 and §9.

const css = readFileSync(
  fileURLToPath(new URL('./kit.css', import.meta.url)),
  'utf8',
)

type Rgb = [number, number, number]
type Rgba = [number, number, number, number]

const WHITE_FRAME: Rgb = [255, 255, 255]
const BLACK_FRAME: Rgb = [0, 0, 0]

/** WCAG 2.1 minimum for text below 18.66px, which all HUD text is. */
const AA_NORMAL_TEXT = 4.5

function parseRgba(value: string): Rgba {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  throw new Error(`kit.css: cannot parse colour ${JSON.stringify(value)}`)
}

/** Source-over compositing, the same thing the compositor does. */
function over([r, g, b, a]: Rgba, bg: Rgb): Rgb {
  return [
    a * r + (1 - a) * bg[0],
    a * g + (1 - a) * bg[1],
    a * b + (1 - a) * bg[2],
  ]
}

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The `background:` of a rule, e.g. `.rh-video-label`. */
function backgroundOf(selector: string): Rgba {
  const rule = css.match(new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\}`))
  if (!rule) throw new Error(`kit.css: no rule for ${selector}`)
  const bg = rule[1].match(/background:\s*([^;]+);/)
  if (!bg) throw new Error(`kit.css: ${selector} declares no background`)
  return parseRgba(bg[1])
}

/** The text tiers redeclared inside the .rh-on-video palette. */
function onVideoTextTiers(): Record<string, Rgba> {
  const block = css.match(/\.rh-on-video\s*\{([\s\S]*?)\}/)
  if (!block) throw new Error('kit.css: no .rh-on-video rule')
  const tiers: Record<string, Rgba> = {}
  for (const [, name, value] of block[1].matchAll(/(--rh-t[1-4]):\s*([^;]+);/g)) {
    tiers[name] = parseRgba(value)
  }
  return tiers
}

describe('HUD text over live video', () => {
  const scrims = ['.rh-video-label', '.rh-video-bar'] as const

  it.each(scrims)('%s stays legible over the brightest possible frame', (selector) => {
    const plate = over(backgroundOf(selector), WHITE_FRAME)

    for (const [tier, colour] of Object.entries(onVideoTextTiers())) {
      const ratio = contrastRatio(over(colour, plate), plate)
      expect(
        ratio,
        `${tier} on ${selector} over a white frame is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  it.each(scrims)('%s stays legible over a black frame', (selector) => {
    const plate = over(backgroundOf(selector), BLACK_FRAME)

    for (const [tier, colour] of Object.entries(onVideoTextTiers())) {
      const ratio = contrastRatio(over(colour, plate), plate)
      expect(
        ratio,
        `${tier} on ${selector} over a black frame is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
    }
  })

  it('keeps the footage visible behind the HUD rather than blacking it out', () => {
    // The point of the scrim is readability, not a solid panel. If someone
    // "fixes" a future contrast failure by going opaque, the operator loses
    // the part of the frame under every badge -- so this is the other wall.
    for (const selector of scrims) {
      expect(backgroundOf(selector)[3]).toBeLessThan(0.9)
    }
  })
})
