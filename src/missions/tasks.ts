import type { WaypointAction, WaypointActionType } from '@/types'

/** Order in the "add task" menu: the common ones first. */
export const TASK_TYPES: WaypointActionType[] = [
  'snapshot', 'video_clip', 'voice_prompt', 'wait', 'operator_approval', 'led_signal', 'return_to_dock',
]

const DEFAULTS: Partial<Record<WaypointActionType, Record<string, unknown>>> = {
  snapshot: { camera: 'front' },
  video_clip: { camera: 'front', seconds: 15 },
  voice_prompt: { volume: 100 },
  wait: { seconds: 10 },
}

export function newTask(type: WaypointActionType, label: string): WaypointAction {
  return { type, label, params: { ...(DEFAULTS[type] ?? {}) } }
}

export function moveTask(actions: WaypointAction[], from: number, to: number): WaypointAction[] {
  if (from < 0 || from >= actions.length || to < 0 || to >= actions.length || from === to) return actions
  const next = [...actions]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function removeTask(actions: WaypointAction[], index: number): WaypointAction[] {
  return actions.filter((_, i) => i !== index)
}

export function updateTask(actions: WaypointAction[], index: number, params: Record<string, unknown>): WaypointAction[] {
  return actions.map((a, i) => (i === index ? { ...a, params: { ...a.params, ...params } } : a))
}
