/**
 * The live survey map's PNG, both ways, with no library and no canvas.
 *
 * Decoding: the bridge sends `cells_png_b64`, an 8-bit greyscale PNG
 * (0 = not seen, 128 = open, 255 = something there). The console needs the
 * cell VALUES, not a picture: an <img> or a canvas would hand back colour that
 * the browser may have colour-managed, and jsdom has no canvas at all, so the
 * decode is done here on the bytes. Inflate is the platform's
 * DecompressionStream('deflate') (zlib-wrapped, which is what PNG's IDAT is),
 * in every current browser and in Node 18+.
 *
 * Encoding is for the mock survey only: stored (uncompressed) deflate blocks,
 * which every PNG reader accepts, so it stays synchronous and tiny.
 */

export interface GreyImage {
  width: number
  height: number
  /** One byte per cell, row 0 first (the top of the image). */
  pixels: Uint8Array
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

let CRC_TABLE: Uint32Array | null = null
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return (CRC_TABLE = table)
}

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  const table = crcTable()
  let c = 0xffffffff
  for (let i = start; i < end; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot inflate PNG data')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(data); controller.close() },
  }).pipeThrough(new DecompressionStream('deflate') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/**
 * An 8-bit greyscale PNG's cells. Throws, with a plain message, on anything
 * else: another colour type or bit depth, interlacing, a broken chunk, or
 * pixel data of the wrong length. `maxSide` bounds width and height before any
 * memory is allocated for them.
 */
export async function decodeGreyPng(bytes: Uint8Array, maxSide = 4000): Promise<GreyImage> {
  if (bytes.length < 8 || SIGNATURE.some((v, i) => bytes[i] !== v)) throw new Error('not a PNG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 8
  let width = 0, height = 0, sawHeader = false
  const idat: Uint8Array[] = []
  let idatLength = 0
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const dataStart = at + 8
    const dataEnd = dataStart + length
    if (dataEnd + 4 > bytes.length) throw new Error(`PNG chunk ${type} runs past the end`)
    if (crc32(bytes, at + 4, dataEnd) !== view.getUint32(dataEnd)) throw new Error(`PNG chunk ${type} is corrupt`)
    if (type === 'IHDR') {
      width = view.getUint32(dataStart)
      height = view.getUint32(dataStart + 4)
      const depth = bytes[dataStart + 8], colourType = bytes[dataStart + 9], interlace = bytes[dataStart + 12]
      if (depth !== 8 || colourType !== 0) throw new Error(`expected an 8-bit greyscale PNG, got depth ${depth} colour type ${colourType}`)
      if (interlace !== 0) throw new Error('interlaced PNGs are not supported')
      if (width < 1 || height < 1 || width > maxSide || height > maxSide) throw new Error(`PNG is ${width} x ${height}, outside 1..${maxSide}`)
      sawHeader = true
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataEnd))
      idatLength += length
    } else if (type === 'IEND') {
      break
    }
    at = dataEnd + 4
  }
  if (!sawHeader) throw new Error('PNG has no header')
  const compressed = new Uint8Array(idatLength)
  let offset = 0
  for (const part of idat) { compressed.set(part, offset); offset += part.length }
  const raw = await inflateZlib(compressed)
  const stride = width + 1
  if (raw.length < stride * height) throw new Error('PNG pixel data is short')

  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride]
    const src = y * stride + 1
    const row = y * width
    const prev = row - width
    for (let x = 0; x < width; x++) {
      const v = raw[src + x]
      const a = x > 0 ? pixels[row + x - 1] : 0
      const b = y > 0 ? pixels[prev + x] : 0
      const c = x > 0 && y > 0 ? pixels[prev + x - 1] : 0
      let out: number
      switch (filter) {
        case 0: out = v; break
        case 1: out = v + a; break
        case 2: out = v + b; break
        case 3: out = v + ((a + b) >> 1); break
        case 4: out = v + paeth(a, b, c); break
        default: throw new Error(`PNG row ${y} has unknown filter ${filter}`)
      }
      pixels[row + x] = out & 0xff
    }
  }
  return { width, height, pixels }
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/** An 8-bit greyscale PNG of `pixels` (row 0 at the top), uncompressed. */
export function encodeGreyPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  if (pixels.length !== width * height) throw new Error('pixels do not match width x height')
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  }
  // zlib: header, stored blocks of at most 65535 bytes, Adler-32.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535))
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  z[0] = 0x78; z[1] = 0x01
  let at = 2
  for (let i = 0; i < blocks; i++) {
    const part = raw.subarray(i * 65535, Math.min(raw.length, (i + 1) * 65535))
    z[at] = i === blocks - 1 ? 1 : 0
    z[at + 1] = part.length & 0xff; z[at + 2] = part.length >> 8
    z[at + 3] = ~part.length & 0xff; z[at + 4] = (~part.length >> 8) & 0xff
    z.set(part, at + 5)
    at += 5 + part.length
  }
  new DataView(z.buffer).setUint32(at, adler32(raw))

  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  header[8] = 8 // bit depth
  header[9] = 0 // greyscale
  const parts = [new Uint8Array(SIGNATURE), chunk('IHDR', header), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) { out.set(p, offset); offset += p.length }
  return out
}
