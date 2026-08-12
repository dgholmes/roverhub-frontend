import { describe, expect, it } from 'vitest'
import { ROBOT_SAMPLE_RATE_HZ, floatTo16BitPcm, pcmByteLength } from './audioPcm'

/** The Web Audio parts (decodeAudioData / OfflineAudioContext) need a browser,
 * and Vitest runs in a node environment with no DOM -- so the conversion maths
 * is split out and tested here, the same reason manualControlMath exists. */
describe('floatTo16BitPcm', () => {
  const samples = (buffer: ArrayBuffer) => {
    const view = new DataView(buffer)
    return Array.from({ length: buffer.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true))
  }

  it('emits two bytes per sample', () => {
    expect(floatTo16BitPcm(new Float32Array(10)).byteLength).toBe(20)
  })

  it('maps silence to zero', () => {
    expect(samples(floatTo16BitPcm(new Float32Array([0, 0, 0])))).toEqual([0, 0, 0])
  })

  it('maps full scale to the int16 extremes without overflowing', () => {
    // Positive full scale must not wrap to -32768. Scaling both signs by 32768
    // would do exactly that, turning the loudest sample into a full-amplitude
    // click in the opposite direction.
    expect(samples(floatTo16BitPcm(new Float32Array([1, -1])))).toEqual([32767, -32768])
  })

  it('clamps values beyond [-1, 1] instead of wrapping', () => {
    // Decoded audio really can exceed unity (inter-sample peaks, hot masters).
    // Wrapping turns a loud passage into harsh noise.
    expect(samples(floatTo16BitPcm(new Float32Array([2.5, -3.0])))).toEqual([32767, -32768])
  })

  it('writes little-endian, as the robot expects (S16_LE)', () => {
    const bytes = new Uint8Array(floatTo16BitPcm(new Float32Array([1])))
    // 32767 = 0x7FFF -> low byte first
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0x7f])
  })

  it('is monotonic across the range', () => {
    const out = samples(floatTo16BitPcm(new Float32Array([-1, -0.5, 0, 0.5, 1])))
    for (let i = 1; i < out.length; i++) expect(out[i]).toBeGreaterThan(out[i - 1])
  })

  it('handles an empty input', () => {
    expect(floatTo16BitPcm(new Float32Array([])).byteLength).toBe(0)
  })
})

describe('pcmByteLength', () => {
  it('is 48KB per second at 24kHz mono 16-bit', () => {
    expect(pcmByteLength(1)).toBe(48_000)
    expect(ROBOT_SAMPLE_RATE_HZ).toBe(24_000)
  })

  it('rounds partial frames up so a clip is never truncated', () => {
    expect(pcmByteLength(0.5)).toBe(24_000)
    expect(pcmByteLength(1.00001)).toBeGreaterThan(48_000)
  })

  it('is zero for a zero-length clip', () => {
    expect(pcmByteLength(0)).toBe(0)
  })
})
