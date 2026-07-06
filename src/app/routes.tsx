export const WORKSPACES = ['LiveOps', 'Fleet', 'Missions', 'Data', 'Systems'] as const
export type Workspace = typeof WORKSPACES[number]

const HASH_TO_WORKSPACE: Record<string, Workspace> = {
  '#/liveops':  'LiveOps',
  '#/fleet':    'Fleet',
  '#/missions': 'Missions',
  '#/data':     'Data',
  '#/systems':  'Systems',
}

const WORKSPACE_TO_HASH: Record<Workspace, string> = {
  LiveOps:  '#/liveops',
  Fleet:    '#/fleet',
  Missions: '#/missions',
  Data:     '#/data',
  Systems:  '#/systems',
}

export function workspaceFromHash(hash: string): Workspace {
  return HASH_TO_WORKSPACE[hash] ?? 'LiveOps'
}

export function hashForWorkspace(workspace: Workspace): string {
  return WORKSPACE_TO_HASH[workspace]
}
