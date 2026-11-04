import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useAuthStore } from '@/lib/auth/authStore'
import { AuthScreen, SignInPage } from './SignInPage'

/** Shows the console only once it is known who is using it: the sign-in page
 * while sign-in is on and nobody is signed in, the console otherwise. With
 * sign-in off (and in mock mode) it passes straight through. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const status = useAuthStore((s) => s.status)
  const boot = useAuthStore((s) => s.boot)

  useEffect(() => {
    if (useAuthStore.getState().status === 'booting') void boot()
  }, [boot])

  if (status === 'off' || status === 'signedIn') return <>{children}</>
  if (status === 'signedOut') return <SignInPage />
  if (status === 'unreachable') {
    return (
      <AuthScreen>
        <h1 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{t('auth.unreachable')}</h1>
        <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>{t('auth.unreachableBody')}</p>
        <Button variant="primary" onClick={() => void boot()} style={{ justifySelf: 'start' }}>{t('auth.retry')}</Button>
      </AuthScreen>
    )
  }
  return (
    <div role="status" style={{ minHeight: '100vh', background: color.bg, color: color.t3, fontFamily: font.family, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: font.size.md }}>
      {t('auth.checking')}
    </div>
  )
}
