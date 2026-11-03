/**
 * Decodes an operator-uploaded audio file to the exact PCM the robot's speaker
 * wants: 24kHz, 16-bit signed little-endian, mono.
 *
 * Why the browser does this. The robot plays audio two ways (vendored
 * `low_level.md`): `type="file"`, which needs the file on the **robot's own**
 * disk, and `type="streaming"`, which carries PCM in the message. File mode is
 * unreachable for us — the SDK has no file-transfer API at all (5 gRPC RPCs, all
 * motion/state; the DDS surface is publish/subscribe only) and we have no SSH
 * credentials for the robot — so streaming mode it is, and someone has to
 * produce PCM.
 *
 * That someone is the browser, because neither edge device has ffmpeg (verified
 * on both, 2026-08-12) and installing it needs sudo on each. The browser already
 * ships a decoder for every format it accepts, so decoding here means MP3, WAV,
 * OGG and FLAC all work with no new dependency anywhere, and an undecodable file
 * fails immediately with a clear message instead of somewhere on an edge device.
 *
 * Upstream of the fix this replaced: the clip was uploaded and its *cloud*
 * filesystem path was handed to the robot, which resolved it against its own
 * disk, found nothing, and played silence while the command reported success.
 */

/** The robot's streaming-mode requirements. Not configurable — these are fixed
 * by the SDK (`low_level.md` "Streaming Mode"; e7/e8 use the same constants). */
export const ROBOT_SAMPLE_RATE_HZ = 24_000
export const ROBOT_CHANNELS = 1

/** Converts float samples in [-1, 1] to 16-bit signed little-endian bytes.
 *
 * Split out from the Web Audio glue because Vitest runs in a node environment
 * with no AudioContext, so this is the part that can actually be tested — the
 * same reason manualControlMath and postureModel are separate modules.
 */
export function floatTo16BitPcm(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: decoded audio can exceed [-1, 1] (inter-sample peaks,
    // or a clip that was mastered hot), and letting it through wraps around at
    // the int16 boundary, turning a loud passage into harsh noise.
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    // Asymmetric on purpose: int16 spans -32768..32767, so the negative side
    // scales by 32768 and the positive by 32767. Using 32768 for both would
    // overflow to -32768 at full-scale positive — a full-amplitude click.
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }
  return buffer
}

/** Peak the normaliser aims for, as a fraction of full scale.

 * Not 1.0: resampling in OfflineAudioContext can produce inter-sample peaks
 * slightly above the original maximum, and landing exactly on full scale would
 * leave floatTo16BitPcm clamping them. A little headroom costs ~0.4dB and
 * avoids that entirely.
 */
export const NORMALIZE_TARGET_PEAK = 0.95

/** Ceiling on the boost a single clip may receive (+18dB).

 * A clip that peaks very low is usually a bad recording rather than a quiet
 * one, and normalising it to target would mean amplifying its noise floor by
 * the same amount -- turning hiss into a full-scale screech through a speaker
 * an operator may be standing next to. Capping the gain means such a clip stays
 * quiet, which is the recoverable failure.
 */
export const MAX_NORMALIZE_GAIN = 8

/** Scales samples so the loudest one sits at NORMALIZE_TARGET_PEAK.

 * Why this exists: amplitude scaling is the ONLY volume control available --
 * VoiceCmd has no volume field, the robot exposes no speaker API, and gRPC has
 * no audio RPC (see dobot_adapter.scale_pcm_volume). So the loudest the robot
 * can ever be is the clip's own recorded peak, and the edge bridge deliberately
 * passes the PCM through untouched at volume 100. Clips measured on a real
 * device peaked at 49-61% of full scale, leaving ~5dB of headroom unused and
 * making even full volume sound quiet.
 *
 * Normalising here, at decode time in the browser, reclaims that headroom once
 * per clip rather than on every play, and leaves the edge cache and the wire
 * format untouched.
 *
 * This is a pure gain, NOT compression: the waveform's shape and dynamics are
 * preserved exactly. It raises the peak, not the average, so a clip with a high
 * crest factor (unprocessed speech typically ~16dB) still sounds quieter than
 * its peak suggests. Making it properly loud would need limiting, which is a
 * deliberate decision to take separately -- it changes how the audio sounds,
 * not just how loud it is.
 *
 * Applied in both directions, so every clip arrives at a known ceiling. That is
 * what makes the volume slider meaningful: 50% means the same loudness whatever
 * clip is playing, instead of depending on how hot each one happened to be
 * recorded.
 */
export function normalizePeak(
  samples: Float32Array,
  targetPeak: number = NORMALIZE_TARGET_PEAK,
): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i])
    if (magnitude > peak) peak = magnitude
  }
  // Digital silence: there is no peak to scale to, and dividing by it would
  // produce NaN for every sample.
  if (peak === 0) return samples

  const gain = Math.min(targetPeak / peak, MAX_NORMALIZE_GAIN)
  if (gain === 1) return samples

  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain
  return out
}

/** Bytes a clip of this many seconds will occupy as robot-format PCM. Useful for
 * warning about size before uploading: PCM is uncompressed, so ~48KB per second. */
export function pcmByteLength(durationSeconds: number): number {
  return Math.ceil(durationSeconds * ROBOT_SAMPLE_RATE_HZ) * 2 * ROBOT_CHANNELS
}

export interface DecodedClip {
  pcm: ArrayBuffer
  durationSeconds: number
  sourceSampleRateHz: number
  sourceChannels: number
}

/** Decodes `file` and resamples/downmixes it to robot-format PCM.
 *
 * Resampling and downmixing are delegated to OfflineAudioContext rather than
 * hand-rolled: constructing it at 24kHz mono makes the browser's own (properly
 * band-limited) resampler do the work. Naive sample-dropping would alias badly,
 * and speech is exactly where that is most audible.
 */
export async function decodeToRobotPcm(file: File | Blob): Promise<DecodedClip> {
  const arrayBuffer = await file.arrayBuffer()

  // Older Safari exposes Web Audio only under webkit-prefixed names.
  const win = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext
    webkitOfflineAudioContext?: typeof OfflineAudioContext
  }
  const Ctx: typeof AudioContext = win.AudioContext ?? win.webkitAudioContext
  if (!Ctx) throw new Error('This browser has no Web Audio support, so audio cannot be prepared.')

  const decodeCtx = new Ctx()
  let decoded: AudioBuffer
  try {
    // decodeAudioData detaches the ArrayBuffer it is given, so hand it a copy —
    // otherwise a retry (or any later read) sees an empty buffer.
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0))
  } catch {
    throw new Error(
      'Could not decode that audio file. Supported formats depend on the browser — '
      + 'MP3, WAV and OGG are safe choices.',
    )
  } finally {
    void decodeCtx.close()
  }

  const frames = Math.ceil(decoded.duration * ROBOT_SAMPLE_RATE_HZ)
  if (frames <= 0) throw new Error('That audio file contains no audio.')

  const OfflineCtx: typeof OfflineAudioContext =
    win.OfflineAudioContext ?? win.webkitOfflineAudioContext
  const offline = new OfflineCtx(ROBOT_CHANNELS, frames, ROBOT_SAMPLE_RATE_HZ)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  const rendered = await offline.startRendering()

  return {
    pcm: floatTo16BitPcm(normalizePeak(rendered.getChannelData(0))),
    durationSeconds: decoded.duration,
    sourceSampleRateHz: decoded.sampleRate,
    sourceChannels: decoded.numberOfChannels,
  }
}
