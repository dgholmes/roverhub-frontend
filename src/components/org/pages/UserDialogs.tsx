import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FormMessage, inputStyle } from '@/components/auth/fields'
import { MIN_PASSWORD_LENGTH } from '@/components/auth/AccountSettings'
import { ApiError } from '@/lib/realtime/apiError'
import { ALL_SITES, displayNameOf, type AuthUser } from '@/lib/auth/types'
import { usersApi } from '@/lib/auth/usersApi'
import { ORG_ROLES, SITE_ROLES, type OrgRole, type SiteRole } from '@/org/roles'

/** Add-user and edit-user dialogs for the Team page, against /users. */

export interface SiteOption { id: string; name: string }

const dialogStyle: React.CSSProperties = { background: color.elevated, border: `1px solid ${color.border}`, color: color.t1, maxHeight: '90vh', overflowY: 'auto' }
const sectionTitle: React.CSSProperties = { margin: 0, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t3 }

function useErrorText() {
  const { t } = useTranslation()
  return (e: unknown): string => {
    if (e instanceof ApiError) return e.detail ?? t('auth.users.actionFailed')
    if (e instanceof TypeError) return t('auth.unreachable')
    return e instanceof Error && e.message ? e.message : t('auth.users.actionFailed')
  }
}

/** Org role picker. Only an owner may hand out (or take away) Owner. */
function OrgRoleSelect({ id, value, onChange, allowOwner }: { id: string; value: OrgRole; onChange: (r: OrgRole) => void; allowOwner: boolean }) {
  return (
    <select id={id} style={inputStyle} value={value} onChange={(e) => onChange(e.target.value as OrgRole)}>
      {ORG_ROLES.filter((r) => allowOwner || r.id !== 'owner' || value === 'owner').map((r) => (
        <option key={r.id} value={r.id}>{r.label}</option>
      ))}
    </select>
  )
}

/** One role picker per site, plus "Every site" (`'*'`). An empty choice means
 * no role there. */
function SiteRolesEditor({ sites, value, onChange }: {
  sites: SiteOption[]
  value: Record<string, SiteRole>
  onChange: (v: Record<string, SiteRole>) => void
}) {
  const { t } = useTranslation()
  const rows: SiteOption[] = [{ id: ALL_SITES, name: t('auth.everySite') }, ...sites]
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <h3 style={sectionTitle}>{t('auth.users.siteRoles')}</h3>
      {rows.map((s) => (
        <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: space[2], alignItems: 'center' }}>
          <label htmlFor={`site-role-${s.id}`} style={{ fontSize: font.size.md, color: color.t2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</label>
          <select
            id={`site-role-${s.id}`} style={inputStyle} value={value[s.id] ?? ''}
            onChange={(e) => {
              const next = { ...value }
              if (e.target.value) next[s.id] = e.target.value as SiteRole
              else delete next[s.id]
              onChange(next)
            }}
          >
            <option value="">{t('auth.users.noRole')}</option>
            {SITE_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      ))}
    </div>
  )
}

function AuditCheckbox({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  return (
    <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.md, color: color.t1 }}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {t('auth.users.auditAccess')}
    </label>
  )
}

export function AddUserDialog({ open, onOpenChange, sites, actorIsOwner, onAdded }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: SiteOption[]
  actorIsOwner: boolean
  onAdded: (user: AuthUser) => void
}) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [orgRole, setOrgRole] = useState<OrgRole>('member')
  const [siteRoles, setSiteRoles] = useState<Record<string, SiteRole>>({})
  const [audit, setAudit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setUsername(''); setDisplayName(''); setPassword(''); setOrgRole('member'); setSiteRoles({}); setAudit(false); setError(null)
  }

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH) { setError(t('auth.tooShort')); return }
    setBusy(true)
    setError(null)
    try {
      const user = await usersApi.create({
        username: username.trim(), display_name: displayName.trim(), password,
        org_role: orgRole, site_roles: siteRoles, audit_access: audit,
      })
      onAdded(user)
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent style={dialogStyle}>
        <DialogHeader>
          <DialogTitle style={{ color: color.t1 }}>{t('auth.users.addTitle')}</DialogTitle>
          <DialogDescription style={{ color: color.t2 }}>{t('auth.users.addBody')}</DialogDescription>
        </DialogHeader>
        <form id="add-user" onSubmit={(e) => { e.preventDefault(); void submit() }} style={{ display: 'grid', gap: space[3] }}>
          <Field id="new-user-name" label={t('auth.users.name')}>
            <input id="new-user-name" style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field id="new-user-username" label={t('auth.users.username')}>
            <input id="new-user-username" style={inputStyle} autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field id="new-user-password" label={t('auth.users.initialPassword')}>
            <input id="new-user-password" type="password" autoComplete="new-password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field id="new-user-org-role" label={t('auth.users.orgRole')}>
            <OrgRoleSelect id="new-user-org-role" value={orgRole} onChange={setOrgRole} allowOwner={actorIsOwner} />
          </Field>
          <AuditCheckbox id="new-user-audit" checked={audit} onChange={setAudit} />
          <SiteRolesEditor sites={sites} value={siteRoles} onChange={setSiteRoles} />
          {error && <FormMessage tone="error">{error}</FormMessage>}
        </form>
        <DialogFooter style={{ gap: 8 }}>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" form="add-user" variant="primary" disabled={busy || !username.trim() || !password}>{t('auth.users.create')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Edit one user: name, roles, audit access; and the account actions --
 * reset password, sign out everywhere, disable/enable. */
export function EditUserDialog({ user, onClose, sites, actorIsOwner, isSelf, onChanged }: {
  user: AuthUser
  onClose: () => void
  sites: SiteOption[]
  actorIsOwner: boolean
  isSelf: boolean
  onChanged: (user: AuthUser) => void
}) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const name = displayNameOf(user)
  const [displayName, setDisplayName] = useState(user.display_name)
  const [orgRole, setOrgRole] = useState<OrgRole>(user.org_role)
  const [siteRoles, setSiteRoles] = useState<Record<string, SiteRole>>(user.site_roles)
  const [audit, setAudit] = useState(user.audit_access)
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      setDone(await action())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const save = () => run(async () => {
    const changes = {
      display_name: displayName.trim(),
      site_roles: siteRoles,
      audit_access: audit,
      // Sent only when changed: naming an owner role at all needs an owner.
      ...(orgRole !== user.org_role ? { org_role: orgRole } : {}),
    }
    onChanged(await usersApi.update(user.user_id, changes))
    return t('auth.users.done.saved')
  })

  const resetPassword = () => run(async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) throw new Error(t('auth.tooShort'))
    await usersApi.resetPassword(user.user_id, newPassword)
    setNewPassword('')
    return t('auth.users.done.reset', { name })
  })

  const signOutEverywhere = () => run(async () => {
    await usersApi.signOutEverywhere(user.user_id)
    return t('auth.users.done.signedOut', { name })
  })

  const toggleDisabled = () => run(async () => {
    const updated = await usersApi.update(user.user_id, { disabled: !user.disabled })
    onChanged(updated)
    return updated.disabled ? t('auth.users.done.disabled', { name }) : t('auth.users.done.enabled', { name })
  })

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent style={dialogStyle}>
        <DialogHeader>
          <DialogTitle style={{ color: color.t1 }}>{t('auth.users.editTitle', { name })}</DialogTitle>
          <DialogDescription style={{ color: color.t2 }}>{user.username}</DialogDescription>
        </DialogHeader>
        <form id="edit-user" onSubmit={(e) => { e.preventDefault(); void save() }} style={{ display: 'grid', gap: space[3] }}>
          <Field id="edit-user-name" label={t('auth.users.name')}>
            <input id="edit-user-name" style={inputStyle} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field id="edit-user-org-role" label={t('auth.users.orgRole')}>
            <OrgRoleSelect id="edit-user-org-role" value={orgRole} onChange={setOrgRole} allowOwner={actorIsOwner} />
          </Field>
          <AuditCheckbox id="edit-user-audit" checked={audit} onChange={setAudit} />
          <SiteRolesEditor sites={sites} value={siteRoles} onChange={setSiteRoles} />
        </form>

        <div style={{ display: 'grid', gap: space[2], background: color.card, borderRadius: 8, padding: space[3] }}>
          <label htmlFor="edit-user-password" style={sectionTitle}>{t('auth.users.resetPassword')}</label>
          <div style={{ fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('auth.users.resetBody', { name })}</div>
          <div style={{ display: 'flex', gap: space[2] }}>
            <input id="edit-user-password" type="password" autoComplete="new-password" style={inputStyle} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Button onClick={() => void resetPassword()} disabled={busy || !newPassword} style={{ flexShrink: 0 }}>{t('auth.users.reset')}</Button>
          </div>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', marginTop: space[1] }}>
            <Button size="sm" onClick={() => void signOutEverywhere()} disabled={busy}>{t('auth.users.signOutEverywhere')}</Button>
            {!isSelf && (
              <Button size="sm" variant={user.disabled ? 'secondary' : 'danger'} onClick={() => void toggleDisabled()} disabled={busy}>
                {user.disabled ? t('auth.users.enable') : t('auth.users.disable')}
              </Button>
            )}
          </div>
        </div>

        {error && <FormMessage tone="error">{error}</FormMessage>}
        {done && !error && <FormMessage tone="info">{done}</FormMessage>}

        <DialogFooter style={{ gap: 8 }}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form="edit-user" variant="primary" disabled={busy}>{t('auth.users.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
