import { useSessionStore } from '@/store/useSessionStore'
import { useAuthStore } from './authStore'
import { displayNameOf } from './types'

/** The name the console calls its user: the signed-in user's, or the sample
 * operator's with sign-in off. */
export function useOperatorName(): string {
  const user = useAuthStore((s) => (s.status === 'signedIn' ? s.user : null))
  const sample = useSessionStore((s) => s.operatorName)
  return user ? displayNameOf(user) : sample
}
