import type { AuthState } from '@/lib/auth/authStore'
import type { BrokerSession } from './realDataProvider'

/** How the broker should be reached for a session state: no login with
 * sign-in off, as the signed-in user (id + session token) with it on, and not
 * at all while signed out or still booting. */
export function brokerSessionFor(s: Pick<AuthState, 'status' | 'user' | 'token'>): BrokerSession {
  if (s.status === 'off') return { kind: 'open' }
  if (s.status === 'signedIn' && s.user && s.token) {
    return { kind: 'signedIn', credentials: { username: s.user.user_id, password: s.token } }
  }
  return { kind: 'closed' }
}
