/**
 * Microphone capture for Speak's Shout tab and its "Record new" clip button.
 *
 * Shout is push-to-talk, not a live stream: what the operator says is recorded
 * while the button is held and sent as an ordinary clip on release, through the
 * same decode -> upload -> SPEAK path as an uploaded file. A live stream would
 * need audio to flow browser -> cloud -> edge continuously, and nothing in that
 * chain carries a stream today (commands are REST posts, the broker path is
 * read-only for the browser). Push-to-talk reuses everything that already works
 * on hardware, at the cost of the robot speaking once the operator lets go.
 *
 * Browsers only grant the microphone to a secure context: `localhost` or HTTPS.
 * A console opened over plain http from another machine on the LAN cannot
 * record at all, and `navigator.mediaDevices` is simply undefined there --
 * which is why the reason is checked up front rather than left to surface as a
 * TypeError.
 */

export type MicProblem = 'insecure' | 'unsupported' | 'denied' | 'noDevice' | 'failed'

export class MicError extends Error {
  constructor(public readonly problem: MicProblem, public readonly detail?: unknown) {
    super(`microphone unavailable: ${problem}`)
  }
}

/** Shorter than this is a tap, not speech: nothing is sent. */
export const MIN_RECORDING_MS = 400
/** A shout is a sentence or two; a stuck button must not record forever. */
export const MAX_RECORDING_MS = 30_000

interface MicEnvironment {
  isSecureContext?: boolean
  navigator?: { mediaDevices?: { getUserMedia?: unknown } }
  MediaRecorder?: unknown
}

/** Why this browser cannot record, before asking for permission; null if it can. */
export function micUnavailableReason(env: MicEnvironment = globalThis as MicEnvironment): MicProblem | null {
  if (env.isSecureContext === false) return 'insecure'
  if (typeof env.navigator?.mediaDevices?.getUserMedia !== 'function') return 'unsupported'
  if (typeof env.MediaRecorder !== 'function') return 'unsupported'
  return null
}

/** Maps a getUserMedia rejection to something an operator can act on. */
export function problemFromError(error: unknown): MicProblem {
  const name = error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noDevice'
  return 'failed'
}

export interface MicRecording {
  /** Ends the recording and returns what was captured. */
  stop(): Promise<{ blob: Blob; durationMs: number }>
  /** Ends the recording and throws it away. */
  cancel(): void
}

/** Starts recording from the default microphone. Rejects with MicError. */
export async function startMicRecording(now: () => number = Date.now): Promise<MicRecording> {
  const unavailable = micUnavailableReason()
  if (unavailable) throw new MicError(unavailable)

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Speech into a robot's speaker: the browser's own clean-up helps, and
      // mono is all the robot plays.
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
  } catch (error) {
    throw new MicError(problemFromError(error), error)
  }

  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
  const startedAt = now()
  recorder.start()

  const release = () => stream.getTracks().forEach((track) => track.stop())

  return {
    stop: () => new Promise((resolve, reject) => {
      recorder.onstop = () => {
        release()
        resolve({ blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), durationMs: now() - startedAt })
      }
      recorder.onerror = (e) => { release(); reject(new MicError('failed', e)) }
      if (recorder.state === 'inactive') recorder.onstop(new Event('stop'))
      else recorder.stop()
    }),
    cancel: () => {
      recorder.onstop = release
      if (recorder.state !== 'inactive') recorder.stop()
      else release()
    },
  }
}
