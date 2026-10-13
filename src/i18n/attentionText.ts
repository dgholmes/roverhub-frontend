import type { TFunction } from 'i18next'
import type { Attention } from '@/fleet/attention'

/** A robot problem in the current language. The key is always a real
 * `attention.*` key (AttentionKind mirrors them); the loose call signature is
 * only because each kind takes different placeholders. */
export function attentionText(t: TFunction, a: Attention): string {
  return (t as unknown as (key: string, options?: object) => string)(`attention.${a.kind}`, a.params)
}
