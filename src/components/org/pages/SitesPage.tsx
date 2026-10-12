import { useState } from 'react'
import { Building2, ChevronRight, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import { hashForSiteWorkspace } from '@/app/routes'

const inputStyle: React.CSSProperties = {
  background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
  color: color.t1, fontSize: font.size.sm, padding: '6px 10px', fontFamily: font.family, width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: font.size.xs, color: color.t3, marginBottom: 4, display: 'block',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: radius.md, background: color.accentDim,
  border: `1px solid ${color.accentBorder}`, color: color.accent,
  fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
  cursor: 'pointer',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

/** Slugifies a display name into a site id (e.g. "West Depot" -> "site-west-depot"). */
function slugifyToSiteId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `site-${slug || Date.now()}`
}

/**
 * Lists every site in the organization and lets the operator enter one,
 * landing in that site's LiveOps workspace (docs/01-prd.md §6.4), plus
 * create new sites. Mock-only by design, same reasoning as
 * DevicesPage.tsx's "Add Robot": OD-8's real Site/Org CRUD backend is
 * explicitly unscheduled future scope (docs/06-wbs-timeline.md,
 * docs/07-tracker.md) — there's no Site/Organization model in the backend
 * at all to persist against. This extends the same `sites[]` the Phase A
 * groundwork already introduced in useSessionStore, via its new addSite
 * action, rather than inventing a parallel data source.
 *
 * "Assign devices to this site" deliberately lives on DevicesPage's Add
 * Robot form (a site picker there), not as a separate assignment screen
 * here — a robot's site_id is already just a plain field on RobotState, so
 * there's nothing to gain from a second UI for the same relationship.
 * There is no "map"/floorplan entity anywhere in this codebase to assign
 * (checked: no type, no mock data, no existing UI reference) — inventing
 * one from scratch was out of scope for this pass; noted as a real gap if
 * a site-floorplan/geofence-layout feature is wanted later.
 */
export function SitesPage() {
  const sites = useSessionStore((s) => s.sites)
  const addSite = useSessionStore((s) => s.addSite)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState('')
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setTimezone('')
    setError(null)
  }

  function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Site name is required.')
      return
    }
    const id = slugifyToSiteId(trimmedName)
    const added = addSite({ id, name: trimmedName, timezone: timezone.trim() || undefined })
    if (!added) {
      setError(`A site named "${trimmedName}" already exists.`)
      return
    }
    setOpen(false)
    resetForm()
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: space[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] }}>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>Sites</div>
        <button
          onClick={() => { resetForm(); setOpen(true) }}
          style={{ ...primaryButtonStyle, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} strokeWidth={2.2} /> Create Site
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: space[3] }}>
        {sites.map((site) => (
          <div key={site.id} style={{
            background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4],
            display: 'flex', flexDirection: 'column', gap: space[3],
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <Building2 size={18} color={color.t2} strokeWidth={1.8} />
              <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{site.name}</span>
            </div>
            {site.timezone && <div style={{ fontSize: font.size.sm, color: color.t3 }}>{site.timezone}</div>}
            <a
              href={hashForSiteWorkspace(site.id, 'LiveOps')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginTop: space[2], padding: '8px 0', borderRadius: radius.sm,
                background: color.accentSolid, color: color.accentText, fontWeight: font.weight.bold,
                fontSize: font.size.sm, textDecoration: 'none',
              }}
            >
              Enter Site <ChevronRight size={14} />
            </a>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.t1 }}>Create Site</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              Add a new site to the organization. Assign devices to it from Org &gt; Devices.
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <Field label="Site Name">
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. West Depot" />
            </Field>
            <Field label="Timezone (optional)">
              <input style={inputStyle} value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. America/Los_Angeles" />
            </Field>
            {error && <div style={{ color: color.red, fontSize: font.size.sm }}>{error}</div>}
          </div>

          <DialogFooter>
            <button onClick={handleSubmit} style={primaryButtonStyle}>Create Site</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
