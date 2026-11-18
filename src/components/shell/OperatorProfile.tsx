import { useState } from 'react'
import { ChevronDown, KeyRound, LogOut, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useSessionStore } from '@/store/useSessionStore'
import { useAuthStore } from '@/lib/auth/authStore'
import { useOperatorName } from '@/lib/auth/useAccount'
import { useAccountMenu } from '@/lib/auth/accountMenu'
import { engineerToolsOn } from '@/lib/auth/types'
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

/** The switch's look: a track and a thumb. The menu item around it carries
 * the role and state, so this is only drawn. */
function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{
      marginLeft: 'auto', width: 32, height: 18, borderRadius: 9, flexShrink: 0, position: 'relative',
      background: on ? color.accentSolid : color.t4, transition: 'background 0.15s',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%',
        background: on ? color.accentText : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s',
      }} />
    </span>
  )
}

/** Engineer tools: an owner's or admin's switch that adds the engineer role's
 * capabilities to their own until they sign out. The backend issues a new
 * token for it, kept the way a login's is, and enforces it per request. */
function EngineerToolsRow({ on }: { on: boolean }) {
  const { t } = useTranslation()
  const setEngineerTools = useAuthStore((s) => s.setEngineerTools)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await setEngineerTools(!on)
    setBusy(false)
    // A 401 ends the session, which says so itself.
    if (!r.ok && r.status !== 401) setError(r.detail ?? t('auth.engineerTools.failed'))
  }

  return (
    <>
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={on}
        disabled={busy}
        data-testid="engineer-tools-switch"
        // Keep the menu open: the note under the switch is part of the answer.
        onSelect={(e) => { e.preventDefault(); void toggle() }}
        style={{ fontSize: font.size.sm, gap: space[2], fontWeight: font.weight.medium }}
      >
        <Wrench size={14} aria-hidden /> {t('auth.engineerTools.label')}
        <SwitchTrack on={on} />
      </DropdownMenuItem>
      <div style={{ padding: `0 ${space[2]}px ${space[1]}px`, maxWidth: 240, fontSize: font.size.xs, lineHeight: 1.4, color: color.t3 }}>
        {on ? t('auth.engineerTools.onNote') : t('auth.engineerTools.offNote')}
      </div>
      {error && (
        <div role="alert" style={{ padding: `0 ${space[2]}px ${space[1]}px`, maxWidth: 240, fontSize: font.size.xs, lineHeight: 1.4, color: color.red }}>
          {error}
        </div>
      )}
    </>
  )
}

/** Who is using the console. Shared by OrgTopBar (full) and the site
 * workspace rail (`compact`: just the avatar, and only when signed in, since
 * the site level has no top bar to put it in).
 *
 * Signed in, it opens a menu with Change password and Sign out -- and, for an
 * org owner or admin, the Engineer tools switch. Its open state is shared
 * (`useAccountMenu`) so the "Engineer tools on" chip can open it. With sign-in
 * off it shows the sample operator and the Role preview, as before. */
export function OperatorProfile({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const name = useOperatorName()
  const previewRole = useSessionStore((s) => s.role)
  const signedIn = useAuthStore((s) => s.status === 'signedIn')
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const menuOpen = useAccountMenu((s) => s.open)
  const setMenuOpen = useAccountMenu((s) => s.setOpen)

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
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
        {user.can_use_engineer_tools === true && (
          <>
            <EngineerToolsRow on={engineerToolsOn(user)} />
            <DropdownMenuSeparator />
          </>
        )}
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
