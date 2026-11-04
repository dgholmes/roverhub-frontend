import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useAuthStore } from '@/lib/auth/authStore'
import { displayNameOf } from '@/lib/auth/types'
import { Field, FormMessage, inputStyle } from './fields'

export const MIN_PASSWORD_LENGTH = 8

/** Settings > Your preferences > Account: who you are, and changing your
 * password. The server ends every session on a change, this one included, so
 * a success lands on the sign-in page with a note saying why. */
export function AccountSettings() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const changePassword = useAuthStore((s) => s.changePassword)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < MIN_PASSWORD_LENGTH) { setError(t('auth.tooShort')); return }
    if (next !== repeat) { setError(t('auth.mismatch')); return }
    setBusy(true)
    setError(null)
    const r = await changePassword(current, next)
    if (!r.ok) {
      setError(r.status === null ? t('auth.unreachable') : (r.detail ?? t('auth.users.actionFailed')))
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4], maxWidth: 420 }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>
        {t('auth.account.intro', { name: displayNameOf(user), username: user.username })}
      </p>
      <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gap: space[3] }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{t('auth.changePassword')}</h3>
        <Field id="acct-current" label={t('auth.account.currentPassword')}>
          <input id="acct-current" type="password" autoComplete="current-password" style={inputStyle} value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} />
        </Field>
        <Field id="acct-new" label={t('auth.account.newPassword')}>
          <input id="acct-new" type="password" autoComplete="new-password" style={inputStyle} value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} />
        </Field>
        <Field id="acct-repeat" label={t('auth.account.repeatPassword')}>
          <input id="acct-repeat" type="password" autoComplete="new-password" style={inputStyle} value={repeat} onChange={(e) => setRepeat(e.target.value)} disabled={busy} />
        </Field>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('auth.account.note')}</div>
        <Button type="submit" variant="primary" disabled={busy || !current || !next || !repeat} style={{ justifySelf: 'start' }}>
          {busy ? t('auth.account.saving') : t('auth.account.save')}
        </Button>
      </form>
    </div>
  )
}
