import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, KeyValue } from '@/components/kit'
import { useSessionStore } from '@/store/useSessionStore'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { siteLocalTime } from '@/org/sites'
import { useOrgSites, type SiteSummary } from '@/org/useOrgSites'
import { enterSite, openRobot } from '@/org/navigation'
import { MissingBadge, OrgPage, Placeholder } from '../parts'

const inputStyle: React.CSSProperties = {
  background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  color: color.t1, fontSize: font.size.md, padding: '6px 10px', fontFamily: font.family, width: '100%',
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ fontSize: font.size.sm, color: color.t2, marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  )
}

/** Slugifies a display name into a site id (e.g. "West Depot" -> "site-west-depot"). */
function slugifyToSiteId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `site-${slug || Date.now()}`
}

function worstPill(t: TFunction, s: SiteSummary) {
  const worst = s.attention[0]
  if (worst) {
    return (
      <Badge tone={worst.attention.severity === 'critical' ? 'red' : 'amber'} title={s.attention.map((a) => `${a.robot.name}: ${a.attention.text}`).join('; ')}>
        {t('sites.needAttention', { count: s.attention.length })}
      </Badge>
    )
  }
  if (s.robots.length === 0) return <Badge>{t('common.noRobots')}</Badge>
  return <Badge tone="green">{t('sites.allReady')}</Badge>
}

function SiteCard({ site, selected, onSelect }: { site: SiteSummary; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const time = siteLocalTime(site.timezone)
  return (
    <article
      onClick={onSelect}
      style={{
        background: color.surface, borderRadius: radius.lg, padding: space[4], cursor: 'pointer',
        border: `1px solid ${selected ? color.accentBorder : color.border}`,
        boxShadow: selected ? `0 0 0 3px ${color.accentDim}` : undefined,
        display: 'flex', flexDirection: 'column', gap: space[3], minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2] }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{site.name}</div>
          <div style={{ fontSize: font.size.sm, color: color.t3, marginTop: 2 }}>
            {site.timezone ? `${site.timezone}${time ? ` · ${time}` : ''}` : t('sites.noTimezone')}
          </div>
        </div>
        {worstPill(t, site)}
      </div>
      <div style={{ display: 'flex', gap: 5, minHeight: 10 }} aria-label={t('common.robotCount', { count: site.robots.length })}>
        {site.robots.map((r) => {
          const v = stateVisualFor(r.abstract_state, r.sdk_state)
          return <span key={r.robot_id} title={`${r.name} · ${v.label}`} style={{ width: 10, height: 10, borderRadius: '50%', background: v.color }} />
        })}
      </div>
      <div style={{ fontSize: font.size.md, color: color.t2 }}>
        {site.robots.length === 0
          ? t('sites.emptyCard')
          : `${t('sites.summary', { robots: t('common.robotCount', { count: site.robots.length }), online: site.online })}${site.missionsRunning ? ` · ${t('sites.patrolsRunning', { count: site.missionsRunning })}` : ''}`}
      </div>
      <Button
        variant={selected ? 'primary' : 'secondary'}
        style={{ alignSelf: 'flex-start' }}
        onClick={(e) => { e.stopPropagation(); enterSite(site.id) }}
      >
        {t('common.enterSite')} <ChevronRight size={14} aria-hidden />
      </Button>
    </article>
  )
}

function SitePanel({ site }: { site: SiteSummary }) {
  const { t } = useTranslation()
  const time = siteLocalTime(site.timezone)
  return (
    <aside className="rh-panel" style={{ padding: space[4], display: 'flex', flexDirection: 'column', gap: space[5], position: 'sticky', top: 0 }}>
      <div>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{site.name}</div>
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>{t('sites.settings')}{site.discovered ? ` · ${t('sites.foundFromRobots')}` : ''}</div>
      </div>

      <section>
        <h3 style={sectionTitle}>{t('sites.general')}</h3>
        <KeyValue rows={[
          { label: t('sites.siteId'), value: site.id },
          { label: t('sites.timezone'), value: site.timezone ?? <span style={{ color: color.t3 }}>{t('common.notSet')}</span> },
          { label: t('sites.localTime'), value: time ?? '—' },
          {
            label: t('sites.location'),
            value: site.location
              ? `${site.location.lat.toFixed(3)}, ${site.location.lng.toFixed(3)}`
              : <span style={{ color: color.t3 }}>{t('common.notSet')}</span>,
          },
        ]} />
      </section>

      <section>
        <h3 style={sectionTitle}>{t('sites.robots')}</h3>
        {site.robots.length === 0 ? (
          <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('sites.noneYet')}</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {site.robots.map((r) => {
              const v = stateVisualFor(r.abstract_state, r.sdk_state)
              return (
                <li key={r.robot_id}>
                  <button onClick={() => openRobot(site.id, r.robot_id)} style={{
                    all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
                    display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: space[2], alignItems: 'center',
                    padding: `${space[1]}px 0`, fontSize: font.size.md,
                  }}>
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
                    <span style={{ color: color.t1 }}>{r.name}</span>
                    <span style={{ color: color.t3, fontSize: font.size.sm }}>{v.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 style={sectionTitle}>{t('sites.map')} <MissingBadge what="site map" /></h3>
        <div style={{ fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>
          {t('sites.mapBody')}
        </div>
      </section>

      <section>
        <h3 style={sectionTitle}>{t('sites.zones')} <MissingBadge what="database" /></h3>
        <div style={{ fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>
          {t('sites.zonesBody')}
        </div>
      </section>

      <section>
        <h3 style={sectionTitle}>{t('sites.docks')}</h3>
        <div style={{ fontSize: font.size.sm, color: color.t2 }}>{t('sites.docksBody')}</div>
      </section>
    </aside>
  )
}

const sectionTitle: React.CSSProperties = {
  margin: `0 0 ${space[2]}px`, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1,
  display: 'flex', alignItems: 'center', gap: space[2],
}

/**
 * Every site with its live robots, and the selected site's settings beside
 * them. Sites a robot reports but nobody created here are listed too, so a
 * real deployment's sites show up.
 *
 * Creating a site keeps it for this browser session only: there is no Site
 * store in the backend yet (OD-8), so the dialog says so.
 */
export function SitesPage() {
  const { t } = useTranslation()
  const sites = useOrgSites()
  const addSite = useSessionStore((s) => s.addSite)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const [selectedId, setSelectedId] = useState<string>(activeSiteId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [error, setError] = useState<string | null>(null)
  const selected = sites.find((s) => s.id === selectedId) ?? sites[0]

  function resetForm() {
    setName(''); setTimezone(''); setLat(''); setLng(''); setError(null)
  }

  function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName) { setError(t('sites.errName')); return }
    const tz = timezone.trim()
    if (tz && siteLocalTime(tz) === null) { setError(t('sites.errTimezone', { tz })); return }
    let location: { lat: number; lng: number } | undefined
    if (lat.trim() || lng.trim()) {
      const la = Number(lat), lo = Number(lng)
      if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
        setError(t('sites.errLocation'))
        return
      }
      location = { lat: la, lng: lo }
    }
    const id = slugifyToSiteId(trimmedName)
    if (!addSite({ id, name: trimmedName, timezone: tz || undefined, location })) {
      setError(t('sites.errExists', { name: trimmedName }))
      return
    }
    setSelectedId(id)
    setOpen(false)
    resetForm()
  }

  return (
    <OrgPage
      title={t('sites.title')}
      subtitle={t('common.siteCount', { count: sites.length })}
      actions={<Button variant="primary" icon={Plus} onClick={() => { resetForm(); setOpen(true) }}>{t('sites.newSite')}</Button>}
    >
      {/* Cards take the room; the panel keeps ~360px beside them and drops
          below on narrow screens. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[4], alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 600px', minWidth: 0, display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', alignContent: 'start' }}>
          {sites.map((s) => (
            <SiteCard key={s.id} site={s} selected={s.id === selected?.id} onSelect={() => setSelectedId(s.id)} />
          ))}
        </div>
        <div style={{ flex: '0 1 380px', minWidth: 'min(300px, 100%)' }}>
        {selected ? <SitePanel site={selected} /> : (
          <Placeholder title={t('sites.noSitesTitle')}>{t('sites.noSitesBody')}</Placeholder>
        )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.t1 }}>{t('sites.dialogTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t('sites.dialogBody')}
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <Field id="site-name" label={t('sites.name')}>
              <input id="site-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fleetDetail.org.siteNamePlaceholder')} />
            </Field>
            <Field id="site-tz" label={t('sites.timezoneOptional')}>
              <input id="site-tz" style={inputStyle} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Seoul" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space[3] }}>
              <Field id="site-lat" label={t('sites.latitude')}>
                <input id="site-lat" style={inputStyle} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="37.456" />
              </Field>
              <Field id="site-lng" label={t('sites.longitude')}>
                <input id="site-lng" style={inputStyle} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="126.705" />
              </Field>
            </div>
            {error && <div role="alert" style={{ color: color.red, fontSize: font.size.sm }}>{error}</div>}
          </div>
          <DialogFooter style={{ gap: 8 }}>
            <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSubmit}>{t('sites.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </OrgPage>
  )
}
