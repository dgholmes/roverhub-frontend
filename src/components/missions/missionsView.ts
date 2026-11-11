import { isMissionsMapsHash } from '@/app/routes'

export type MissionsView = 'missions' | 'schedule' | 'maps'

/** The view a location hash puts the Missions workspace on, given the one it is
 * on. The Maps view is the only one with a hash of its own, so a hash that is
 * not Maps' moves the workspace off Maps, to the library, and leaves Schedule
 * and the library where they are. The shell re-parses the route when the hash
 * changes but does not remount this workspace, so without this Back, or the
 * sidebar's Missions item, changes the address and nothing else. */
export function viewForHash(hash: string, current: MissionsView): MissionsView {
  if (isMissionsMapsHash(hash)) return 'maps'
  return current === 'maps' ? 'missions' : current
}
