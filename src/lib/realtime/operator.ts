import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_OPERATOR_ID } from '@/lib/auth/types'

/** Who this console is: the signed-in user's id, or `'operator-dev'` when
 * sign-in is off (and in mock mode) -- the same id the backend attributes
 * commands to then.
 *
 * It is what the console compares a robot's `control_owner` with ("do I hold
 * control?"). With sign-in on the server ignores any `initiated_by` /
 * `started_by` a request carries and records the signed-in user instead, so
 * the bridge's control_owner is this same user_id.
 *
 * Its own module so mockDataProvider can use it too without importing
 * realDataProvider, which imports the mock. */
export { DEV_OPERATOR_ID }

/** The current operator id, read at call time. */
export function currentOperatorId(): string {
  return useAuthStore.getState().user?.user_id ?? DEV_OPERATOR_ID
}

/** The current operator id, for components: re-renders on sign-in/out. */
export function useOperatorId(): string {
  return useAuthStore((s) => s.user?.user_id ?? DEV_OPERATOR_ID)
}
