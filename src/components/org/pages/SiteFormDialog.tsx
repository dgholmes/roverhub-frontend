import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/kit'
import { color, font, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import {
  browserTimezone, parseSiteForm, siteFormOf, siteWriteError, slugifyToSiteId, type SiteFormError, type SiteFormValues,
} from '@/org/siteRecords'
import type { OrgSite } from '@/org/sites'
import { Field, inputStyle } from '../parts'

/** `create`: New site. `edit`: a stored site (PATCH). `adopt`: a site known
 * only from its robots, saved under the id they report (POST with site_id). */
export type SiteFormMode =
  | { kind: 'create' }
  | { kind: 'edit'; site: OrgSite }
  | { kind: 'adopt'; site: OrgSite }

const ERROR_KEY = {
  name: 'sites.errName',
  nameLong: 'orgSites.form.errNameLong',
  siteId: 'orgSites.form.errSiteId',
  timezone: 'sites.errTimezone',
  location: 'sites.errLocation',
  addressLong: 'orgSites.form.errAddressLong',
} as const satisfies Record<SiteFormError, string>

/**
 * New site, Edit site, and Save as a site, in one form. Everything is checked
 * here first (parseSiteForm) and again by the backend, whose refusal -- a
 * taken id (409), a bad field (422) -- is shown in its own words.
 */
export function SiteFormDialog({ mode, onClose, onSaved }: {
  mode: SiteFormMode
  onClose: () => void
  /** With the saved site's id. */
  onSaved: (siteId: string) => void
}) {
  const { t } = useTranslation()
  const addSite = useSessionStore((s) => s.addSite)
  const updateSite = useSessionStore((s) => s.updateSite)
  const [values, setValues] = useState<SiteFormValues>(() => mode.kind === 'create'
    ? { siteId: '', name: '', timezone: browserTimezone(), address: '', lat: '', lng: '' }
    : { ...siteFormOf(mode.site), timezone: mode.site.timezone ?? browserTimezone() })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (k: keyof SiteFormValues) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }))

  const title = mode.kind === 'create' ? t('orgSites.form.newTitle')
    : mode.kind === 'edit' ? t('orgSites.form.editTitle', { name: mode.site.name }) : t('orgSites.form.adoptTitle', { id: mode.site.id })
  const body = mode.kind === 'create' ? t('orgSites.form.newBody')
    : mode.kind === 'edit' ? t('orgSites.form.editBody') : t('orgSites.form.adoptBody')

  async function submit() {
    const parsed = parseSiteForm(mode.kind === 'create' ? values : { ...values, siteId: mode.site.id })
    if (!parsed.ok) {
      setError(parsed.error === 'timezone' ? t('sites.errTimezone', { tz: values.timezone.trim() }) : t(ERROR_KEY[parsed.error]))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { site_id, ...fields } = parsed.body
      const saved = mode.kind === 'edit'
        ? await updateSite(mode.site.id, fields)
        : await addSite(site_id ? { site_id, ...fields } : fields)
      onSaved(saved.id)
    } catch (e) {
      const w = siteWriteError(e)
      setError(w.status === 409
        ? t('orgSites.form.errTaken', { reason: w.text ?? '' }).trim()
        : t('orgSites.form.errSave', { reason: w.text ?? t('common.unknown') }))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent style={{ background: color.elevated, border: 'none', color: color.t1 }}>
        <DialogHeader>
          <DialogTitle style={{ color: color.t1 }}>{title}</DialogTitle>
          <DialogDescription style={{ color: color.t2 }}>{body}</DialogDescription>
        </DialogHeader>
        <form
          id="site-form"
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}
        >
          <Field label={t('sites.name')} htmlFor="site-name">
            <input id="site-name" style={inputStyle} value={values.name} onChange={set('name')} placeholder={t('fleetDetail.org.siteNamePlaceholder')} />
          </Field>
          {mode.kind === 'create' && (
            <Field label={t('orgSites.form.siteId')} htmlFor="site-id">
              <input id="site-id" style={inputStyle} value={values.siteId} onChange={set('siteId')}
                placeholder={values.name.trim() ? slugifyToSiteId(values.name) : 'site-west-depot'} spellCheck={false} />
            </Field>
          )}
          <Field label={t('sites.timezone')} htmlFor="site-tz">
            <input id="site-tz" style={inputStyle} value={values.timezone} onChange={set('timezone')} placeholder="Asia/Seoul" spellCheck={false} />
          </Field>
          <Field label={t('orgSites.form.address')} htmlFor="site-address">
            <input id="site-address" style={inputStyle} value={values.address} onChange={set('address')} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
            <Field label={t('sites.latitude')} htmlFor="site-lat">
              <input id="site-lat" style={inputStyle} inputMode="decimal" value={values.lat} onChange={set('lat')} placeholder="37.456" />
            </Field>
            <Field label={t('sites.longitude')} htmlFor="site-lng">
              <input id="site-lng" style={inputStyle} inputMode="decimal" value={values.lng} onChange={set('lng')} placeholder="126.705" />
            </Field>
          </div>
          {mode.kind === 'create' && (
            <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{t('orgSites.form.siteIdHint')}</p>
          )}
          {error && <div role="alert" style={{ color: color.red, fontSize: font.size.sm }}>{error}</div>}
        </form>
        <DialogFooter style={{ gap: 8 }}>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form="site-form" disabled={saving}>
            {saving ? t('orgSites.form.saving') : mode.kind === 'edit' ? t('orgSites.form.save') : t('sites.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
