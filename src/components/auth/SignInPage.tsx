import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useAuthStore, type AuthNotice } from '@/lib/auth/authStore'
import { FormMessage } from './fields'

/** The whole-screen frame the sign-in, "checking" and "can't reach the
 * server" states share: a site photo that fades into the panel holding the
 * mark and the content. Styles live in kit.css (`.rh-signin*`). */
export function AuthScreen({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="rh-signin" style={{ fontFamily: font.family }}>
      <img className="rh-signin__photo" src="./live_view.png" alt="" aria-hidden />
      <div className="rh-signin__fade" aria-hidden />
      <section className="rh-signin__story" aria-hidden>
        <h2>{t('auth.heroTitle')}</h2>
        <p>{t('auth.heroBody')}</p>
        <div className="rh-signin__chips">
          <span>{t('auth.heroLive')}</span>
          <span>{t('auth.heroMissions')}</span>
          <span>{t('auth.heroFleet')}</span>
        </div>
      </section>
      <main className="rh-signin__panel">
        <div className="rh-signin__brand">
          <img className="rh-logo" src="./rover-mark.png" alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <span style={{ fontWeight: font.weight.bold, fontSize: 20, color: color.t1, letterSpacing: '-0.01em' }}>RoverHub</span>
        </div>
        <div className="rh-signin__body">{children}</div>
        <div className="rh-signin__foot">{t('auth.noAccount')}</div>
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

const labelStyle: React.CSSProperties = { fontSize: font.size.sm, color: color.t2, marginBottom: 6, display: 'block' }

/** The form itself, without the store, so it can be rendered in a test. */
export function SignInForm({ error, busy, needsFirstOwner, notice, onSubmit }: SignInFormProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const canSubmit = !busy && username.trim() !== '' && password !== ''
  const readCapsLock = (e: React.KeyboardEvent) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  const eyeLabel = showPassword ? t('auth.hidePassword') : t('auth.showPassword')

  return (
    <AuthScreen>
      <div style={{ display: 'grid', gap: space[1] }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: font.weight.bold, color: color.t1, letterSpacing: '-0.02em' }}>{t('auth.welcome')}</h1>
        <p style={{ margin: 0, fontSize: font.size.lg, color: color.t2 }}>{t('auth.title')}</p>
      </div>
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
        style={{ display: 'grid', gap: space[4] }}
      >
        <div>
          <label htmlFor="signin-username" style={labelStyle}>{t('auth.username')}</label>
          <input
            id="signin-username" className="rh-signin__input" autoComplete="username" autoFocus autoCapitalize="none" spellCheck={false}
            value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy}
          />
        </div>
        <div>
          <label htmlFor="signin-password" style={labelStyle}>{t('auth.password')}</label>
          <div className="rh-signin__secret">
            <input
              id="signin-password" className="rh-signin__input" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
              onKeyDown={readCapsLock} onKeyUp={readCapsLock} onBlur={() => setCapsLock(false)}
            />
            <button
              type="button" className="rh-signin__eye" onClick={() => setShowPassword((v) => !v)}
              // Keep focus in the password field on a mouse click, so Enter
              // still signs in rather than toggling the button again.
              onMouseDown={(e) => e.preventDefault()}
              aria-label={eyeLabel} aria-pressed={showPassword} title={eyeLabel}
            >
              {showPassword ? <EyeOff size={18} strokeWidth={1.7} /> : <Eye size={18} strokeWidth={1.7} />}
            </button>
          </div>
          {capsLock && <div role="status" style={{ fontSize: font.size.sm, color: color.amber, marginTop: 6 }}>{t('auth.capsLock')}</div>}
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button
          type="submit" variant="primary" size="lg" className="rh-signin__submit" disabled={!canSubmit} aria-busy={busy || undefined}
          style={{ justifyContent: 'center', marginTop: space[1] }}
        >
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
