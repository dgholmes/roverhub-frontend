import { USE_REAL_BACKEND } from '@/lib/realtime/backendConfig'
import { mockHistory, mockMembers, type Member, type OrgHistory } from '@/mocks/mockOrg'

/**
 * Org content that has nowhere to come from against a real backend: history
 * needs the database, members need sign-in. Mock mode shows sample content,
 * marked as such on screen; real mode gets null, and each page shows what is
 * missing instead. Same switch useLiveOpsStore uses for mock missions.
 */
export const orgHistory: OrgHistory | null = USE_REAL_BACKEND ? null : mockHistory
export const orgMembers: Member[] | null = USE_REAL_BACKEND ? null : mockMembers
export type { Member, OrgHistory }
