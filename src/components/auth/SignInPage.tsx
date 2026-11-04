import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useAuthStore, type AuthNotice } from '@/lib/auth/authStore'
import { Field, FormMessage, inputStyle } from './fields'

/** The whole-screen frame the sign-in and "can't reach the server" states
 * share: the mark, then one tinted block. */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: color.bg, fontFamily: font.family,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4], boxSizing: 'border-box',
    }}>
      <main style={{ width: '100%', maxWidth: 380, display: 'grid', gap: space[5] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
          <img className="rh-logo" src="./rover-mark.png" alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <span style={{ fontWeight: font.weight.bold, fontSize: 22, color: color.t1, letterSpacing: '-0.01em' }}>RoverHub</span>
        </div>
        <div style={{ background: color.surface, borderRadius: radius.lg, padding: space[6], display: 'grid', gap: space[4] }}>
          {children}
        </div>
      </main>
    </div>
  )
}

export interface SignInFormProps {
  /** The server's message (or a fallback) for the last failed attempt. */
  error: string | null
  busy: boolean
  needsFirstOwner: boolean
  notice: AuthNotice
  onSubmit: (username: string, password: string) => void
}

/** The form itself, without the store, so it can be rendered in a test. */
export function SignInForm({ error, busy, needsFirstOwner, notice, onSubmit }: SignInFormProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const canSubmit = !busy && username.trim() !== '' && password !== ''

  return (
    <AuthScreen>
      <h1 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{t('auth.title')}</h1>
      {needsFirstOwner && (
        <div style={{ background: color.amberBg, borderRadius: radius.md, padding: space[3], display: 'grid', gap: space[2], fontSize: font.size.md, color: color.t1, lineHeight: 1.5 }}>
          <b>{t('auth.firstOwnerTitle')}</b>
          <span>{t('auth.firstOwnerBody')}</span>
          <code style={{ fontSize: font.size.sm, background: color.card, borderRadius: radius.sm, padding: `${space[1]}px ${space[2]}px`, overflowX: 'auto', whiteSpace: 'nowrap' }}>
            python -m auth.manage create-owner &lt;username&gt;
          </code>
        </div>
      )}
      {notice && !error && <FormMessage tone="info">{t(`auth.notice.${notice}`)}</FormMessage>}
      <form
        onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(username.trim(), password) }}
        style={{ display: 'grid', gap: space[3] }}
      >
        <Field id="signin-username" label={t('auth.username')}>
          <input
            id="signin-username" style={inputStyle} autoComplete="username" autoFocus autoCapitalize="none" spellCheck={false}
            value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy}
          />
        </Field>
        <Field id="signin-password" label={t('auth.password')}>
          <input
            id="signin-password" type="password" style={inputStyle} autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
          />
        </Field>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" variant="primary" size="lg" disabled={!canSubmit} aria-busy={busy || undefined} style={{ justifyContent: 'center' }}>
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>
    </AuthScreen>
  )
}

/** Shown instead of the console while sign-in is on and nobody is signed in.
 * The hash route is never touched, so signing in lands back where the user
 * was going. */
export function SignInPage() {
  const { t } = useTranslation()
  const signIn = useAuthStore((s) => s.signIn)
  const needsFirstOwner = useAuthStore((s) => s.needsFirstOwner)
  const notice = useAuthStore((s) => s.notice)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(username: string, password: string) {
    setBusy(true)
    setError(null)
    const result = await signIn(username, password)
    if (!result.ok) {
      setError(result.status === null ? t('auth.unreachable') : (result.detail ?? t('auth.failed')))
      setBusy(false)
    }
    // On success the gate swaps this page for the console.
  }

  return <SignInForm error={error} busy={busy} needsFirstOwner={needsFirstOwner} notice={notice} onSubmit={(u, p) => void submit(u, p)} />
}
