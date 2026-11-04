import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSessionStore } from '@/store/useSessionStore'
import { useAuthStore } from '@/lib/auth/authStore'
import { useOperatorName } from '@/lib/auth/useAccount'
import { hashForOrgPage } from '@/app/routes'
import { requestSettingsSection } from '@/components/org/settingsSection'

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?'
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <div aria-hidden style={{
      width: size, height: size, borderRadius: '50%',
      background: color.card, border: `1.5px solid ${color.borderLt}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      fontSize: font.size.sm, fontWeight: font.weight.bold, color: color.t2,
      fontFamily: font.family, letterSpacing: '-0.02em',
    }}>
      {initials(name)}
    </div>
  )
}

/** Who is using the console. Shared by OrgTopBar (full) and the site
 * workspace rail (`compact`: just the avatar, and only when signed in, since
 * the site level has no top bar to put it in).
 *
 * Signed in, it opens a menu with Change password and Sign out. With sign-in
 * off it shows the sample operator and the Role preview, as before. */
export function OperatorProfile({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const name = useOperatorName()
  const previewRole = useSessionStore((s) => s.role)
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  const roleLabel = signedIn && user
    ? t(`fleetDetail.roles.org.${user.org_role}.label`)
    : t(`fleetDetail.roles.site.${previewRole}.label`)

  const identity = compact ? <Avatar name={name} size={34} /> : (
    <>
      <Avatar name={name} />
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, lineHeight: 1.3 }}>{name}</div>
        <div style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.2 }}>{roleLabel}</div>
      </div>
      <ChevronDown size={12} color={color.t3} strokeWidth={2} />
    </>
  )

  if (!signedIn || !user) {
    if (compact) return null
    return <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>{identity}</div>
  }

  function changePassword() {
    requestSettingsSection('account')
    window.location.hash = hashForOrgPage('Settings')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('auth.accountMenu')}
          title={compact ? name : undefined}
          style={{
            all: 'unset', boxSizing: 'border-box', cursor: 'pointer', borderRadius: radius.md,
            display: 'flex', alignItems: 'center', gap: space[2], padding: compact ? 4 : `2px ${space[1]}px`,
          }}
        >
          {identity}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side={compact ? 'right' : 'bottom'}
        style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1, minWidth: 220 }}
      >
        <DropdownMenuLabel style={{ display: 'grid', gap: 2 }}>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{name}</span>
          <span style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.regular }}>{user.username} · {roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={changePassword} style={{ fontSize: font.size.sm, gap: space[2] }}>
          <KeyRound size={14} aria-hidden /> {t('auth.changePassword')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()} style={{ fontSize: font.size.sm, gap: space[2] }}>
          <LogOut size={14} aria-hidden /> {t('auth.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
