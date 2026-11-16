/**
 * ADAPTER: read the x, y, z of a .pcd, for a floor's `moved_cloud` (the points
 * the moving-object check took out). The contract serves it as a PCD as the
 * tool writes it, unlike `cloud`, which the backend stores as bare float32
 * triples. ASCII and binary DATA are read; binary_compressed is not (null), and
 * neither is anything without float x, y and z fields. A malformed file gives
 * null rather than points in the wrong place.
 */
export function parsePcd(buf: ArrayBuffer): Float32Array | null {
  const bytes = new Uint8Array(buf)
  // The header is ASCII lines up to and including the DATA line.
  let pos = 0
  const header: Record<string, string[]> = {}
  let data: string | null = null
  while (pos < bytes.length && data === null) {
    let end = pos
    while (end < bytes.length && bytes[end] !== 0x0a) end++
    const line = new TextDecoder('ascii').decode(bytes.subarray(pos, end)).trim()
    pos = end + 1
    if (!line || line.startsWith('#')) continue
    const [key, ...rest] = line.split(/\s+/)
    if (key.toUpperCase() === 'DATA') data = (rest[0] ?? '').toLowerCase()
    else header[key.toUpperCase()] = rest
    if (pos > 4096) return null // no header is this long
  }
  if (data === null) return null
  const fields = header.FIELDS ?? []
  const n = fields.length
  if (!n) return null
  const size = (header.SIZE ?? []).map(Number)
  const type = (header.TYPE ?? []).map((t) => t.toUpperCase())
  const count = (header.COUNT ?? fields.map(() => '1')).map(Number)
  if (size.length !== n || type.length !== n || count.length !== n) return null
  const points = Number(header.POINTS?.[0] ?? Number(header.WIDTH?.[0]) * Number(header.HEIGHT?.[0] ?? 1))
  if (!Number.isInteger(points) || points < 0) return null
  const ix = fields.indexOf('x'), iy = fields.indexOf('y'), iz = fields.indexOf('z')
  if (ix < 0 || iy < 0 || iz < 0) return null
  for (const k of [ix, iy, iz]) if (type[k] !== 'F' || (size[k] !== 4 && size[k] !== 8) || count[k] !== 1) return null

  const out = new Float32Array(points * 3)
  if (data === 'ascii') {
    // Column of each field's first value (COUNT widens a field).
    const col: number[] = []
    let c = 0
    for (let k = 0; k < n; k++) { col.push(c); c += count[k] }
    const lines = new TextDecoder('ascii').decode(bytes.subarray(pos)).split('\n')
    let m = 0
    for (const raw of lines) {
      if (m >= points) break
      const t = raw.trim()
      if (!t) continue
      const v = t.split(/\s+/)
      const x = Number(v[col[ix]]), y = Number(v[col[iy]]), z = Number(v[col[iz]])
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
      out[m * 3] = x; out[m * 3 + 1] = y; out[m * 3 + 2] = z
      m++
    }
    return m === points ? out : null
  }
  if (data !== 'binary') return null
  const offset: number[] = []
  let stride = 0
  for (let k = 0; k < n; k++) { offset.push(stride); stride += size[k] * count[k] }
  if (bytes.length - pos < points * stride) return null
  const view = new DataView(buf, pos)
  const read = (base: number, k: number) => (size[k] === 4 ? view.getFloat32(base + offset[k], true) : view.getFloat64(base + offset[k], true))
  for (let m = 0; m < points; m++) {
    const base = m * stride
    out[m * 3] = read(base, ix)
    out[m * 3 + 1] = read(base, iy)
    out[m * 3 + 2] = read(base, iz)
  }
  return out
}
