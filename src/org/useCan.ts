import { useSessionStore } from '@/store/useSessionStore'
import { can, type CapabilityId } from './roles'

/** Whether the current role may see or use something. Shows and hides only:
 * nothing is enforced until sign-in exists. */
export function useCan(id: CapabilityId): boolean {
  return useSessionStore((s) => can(s.role, id))
}
