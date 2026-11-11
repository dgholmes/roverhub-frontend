/**
 * A theme colour as numbers, for the two map layers that paint pixels rather
 * than style elements (the walkable image and the lidar canvas): a canvas
 * cannot take `var(--rh-green)`. Read from the live theme, so they follow
 * design-system/theme.css; callers re-read when the theme changes.
 */

export type Rgb = [number, number, number]

/** `#rgb`, `#rrggbb`, `rgb(r, g, b)` or `rgba(r, g, b, a)` as [r, g, b], or null. */
export function parseCssColor(value: string): Rgb | null {
  const s = value.trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)) as Rgb
  m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as Rgb
  m = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(s)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])].map((n) => Math.max(0, Math.min(255, Math.round(n)))) as Rgb
  return null
}

/** `--rh-<name>` as the page currently resolves it, or `fallback`. */
export function themeRgb(name: string, fallback: Rgb): Rgb {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(`--rh-${name}`)
    return parseCssColor(value) ?? fallback
  } catch {
    return fallback
  }
}

export const rgbCss = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`
