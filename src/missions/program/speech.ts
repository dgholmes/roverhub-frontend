import type { CommandOutcome } from '@/store/useLiveOpsStore'
import type { CommandType } from '@/types'
import type { CommandStep } from './types'

export interface SpeechIO {
  createSpokenClip(robotId: string, text: string): Promise<{ clip_id: string }>
  dispatchCommandAsync(robotId: string, type: CommandType, label: string, params?: Record<string, unknown>): Promise<CommandOutcome>
}

/**
 * A run's SPEAK steps. `prepare` makes the clip before the step is sent (the
 * runner re-checks Stop and its guards after it), once per text per run.
 * `send` plays it: "until done" waits for playback; "once" carries on as soon
 * as the clip is sent and reports a playback that then fails through
 * `onOnceFailed`.
 */
export function speechSteps(io: SpeechIO, robotId: string, onOnceFailed: (step: CommandStep, result: Exclude<CommandOutcome['result'], 'completed'>) => void) {
  const clips = new Map<string, string>()
  return {
    async prepare(step: CommandStep): Promise<void> {
      if (!step.speech || clips.has(step.speech.text)) return
      const clip = await io.createSpokenClip(robotId, step.speech.text)
      clips.set(step.speech.text, clip.clip_id)
    },
    async send(step: CommandStep): Promise<CommandOutcome['result']> {
      const clipId = step.speech && clips.get(step.speech.text)
      if (!step.speech || !clipId) return 'failed'
      const params = { clip_id: clipId, volume: step.params.volume ?? 100 }
      const playing = io.dispatchCommandAsync(robotId, 'SPEAK', step.label, params)
      if (step.speech.untilDone) return (await playing).result
      void playing.then((out) => {
        if (out.result !== 'completed') onOnceFailed(step, out.result)
      })
      return 'completed'
    },
  }
}
