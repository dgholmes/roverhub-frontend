import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, crc32, decodeGreyPng, encodeGreyPng } from './surveyPng'

/** A PNG built by hand: zlib-compressed IDAT (as Python's zlib / PIL write it)
 * with a chosen filter on each row, so the decoder's unfiltering is tested
 * against real compressed data rather than only our own stored blocks. */
function pngWith(width: number, height: number, rows: number[][], filters: number[], colourType = 0, depth = 8): Uint8Array {
  const raw: number[] = []
  const prev = new Array(width).fill(0)
  rows.forEach((row, y) => {
    const f = filters[y]
    raw.push(f)
    row.forEach((v, x) => {
      const a = x > 0 ? row[x - 1] : 0
      const b = y > 0 ? prev[x] : 0
      const c = x > 0 && y > 0 ? prev[x - 1] : 0
      const p = a + b - c
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const pred = [0, a, b, (a + b) >> 1, paeth][f]
      raw.push((v - pred) & 0xff)
    })
    row.forEach((v, x) => { prev[x] = v })
  })
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    const dv = new DataView(out.buffer)
    dv.setUint32(0, data.length)
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
    out.set(data, 8)
    dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
    return out
  }
  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  ihdr[8] = depth
  ihdr[9] = colourType
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))), chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

describe('decodeGreyPng', () => {
  it('reads every row filter of a zlib-compressed greyscale PNG', async () => {
    const rows = [
      [0, 128, 255, 128, 0],
      [128, 128, 0, 255, 255],
      [255, 0, 128, 0, 128],
      [0, 0, 255, 255, 128],
      [128, 255, 0, 128, 0],
    ]
    const image = await decodeGreyPng(pngWith(5, 5, rows, [0, 1, 2, 3, 4]))
    expect(image.width).toBe(5)
    expect(image.height).toBe(5)
    expect([...image.pixels]).toEqual(rows.flat())
  })

  it('round-trips what the mock encodes, past one stored block', async () => {
    const w = 400, h = 300 // 120 300 bytes of rows: two stored blocks
    const pixels = new Uint8Array(w * h).map((_, i) => [0, 128, 255][i % 3])
    const image = await decodeGreyPng(base64ToBytes(bytesToBase64(encodeGreyPng(w, h, pixels))))
    expect(image.width).toBe(w)
    expect(image.height).toBe(h)
    expect(image.pixels).toEqual(pixels)
  })

  it('refuses another colour type or depth, with a plain reason', async () => {
    await expect(decodeGreyPng(pngWith(1, 1, [[0]], [0], 2))).rejects.toThrow(/8-bit greyscale/)
    await expect(decodeGreyPng(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a PNG/)
  })

  it('refuses a corrupt chunk and an image over the size limit', async () => {
    const png = encodeGreyPng(2, 2, new Uint8Array([0, 128, 255, 0]))
    const broken = png.slice()
    broken[20] ^= 0xff // inside IHDR's data
    await expect(decodeGreyPng(broken)).rejects.toThrow(/corrupt/)
    await expect(decodeGreyPng(png, 1)).rejects.toThrow(/outside 1\.\.1/)
  })
})
