import { savedProgramBlocks } from '@/components/missions/visual-program/savedProgram'
import type { MissionLibraryEntry } from '@/types'
import type { ProgramBlock, Step } from './types'

/** A run could not start because a speech clip could not be made. */
export class PrepareFailed extends Error {
  constructor(readonly stepLabel: string, readonly cause: unknown) {
    super(`Could not prepare "${stepLabel}": ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'PrepareFailed'
  }
}

export type MakeClip = (robotId: string, text: string) => Promise<{ clip_id: string }>

/**
 * Makes the speech clips a run needs, once per distinct text, and returns the
 * steps with `params.clip_id` set on every SPEAK. The block's own volume and
 * `speech` stay. Throws PrepareFailed naming the step if a clip cannot be made.
 */
export async function prepareRunSteps(steps: Step[], robotId: string, makeClip: MakeClip): Promise<Step[]> {
  const clips = new Map<string, string>()
  const walk = async (list: Step[]): Promise<Step[]> => {
    const out: Step[] = []
    for (const step of list) {
      switch (step.kind) {
        case 'command': {
          if (!step.speech) { out.push(step); break }
          const text = step.speech.text
          let id = clips.get(text)
          if (id === undefined) {
            try {
              id = (await makeClip(robotId, text)).clip_id
            } catch (e) {
              throw new PrepareFailed(step.label, e)
            }
            clips.set(text, id)
          }
          out.push({ ...step, params: { ...step.params, clip_id: id } })
          break
        }
        case 'repeat':
        case 'repeatUntil':
          out.push({ ...step, body: await walk(step.body) })
          break
        case 'if':
          out.push({ ...step, then: await walk(step.then), else: await walk(step.else) })
          break
        default:
          out.push(step)
      }
    }
    return out
  }
  return walk(steps)
}

/** The blocks a run compiles: the editor's live ones when it has them, else the saved program. */
export function programBlocksForRun(mission: MissionLibraryEntry, editorBlocks?: ProgramBlock[]): ProgramBlock[] | null {
  return editorBlocks ?? savedProgramBlocks(mission.program_state)
}
