import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/kit'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useCan } from '@/org/useCan'
import type { SiteMap } from '@/types/maps'
import { errorText } from './mapPipeline'

/**
 * The map page header's "⋯" (operator, 2026-11-26: "I don't see a delete map
 * button"): Delete map, behind a menu so it is never one click from an
 * accident. For a person with `configure` only (DELETE /maps/{id}); without
 * it there is nothing in the menu, so no "⋯" either.
 *
 * Deleting asks for the map's name to be typed, as deleting a survey's
 * recording does (RecordingControls.tsx), and says it cannot be undone. The
 * backend refuses a map still in use -- a mission drawn on it, a task running
 * one, a robot running it -- with one sentence naming each, shown here as it
 * is, with the question left open.
 */
export function MapMoreMenu({ map, onDeleted }: { map: SiteMap; onDeleted: (mapId: string) => void }) {
  const { t } = useTranslation()
  const canConfigure = useCan('configure')
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const askTextId = useId()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  if (!canConfigure) return null
  // What must be typed: the map's name, or its id when it has none. An empty
  // field never matches.
  const confirmText = map.name.trim() || map.map_id
  const nameMatches = typed.trim() !== '' && typed.trim() === confirmText

  const begin = () => { setTyped(''); setError(null); setOpen(true) }
  const remove = async () => {
    if (!nameMatches || busy) return
    setBusy(true)
    setError(null)
    try {
      await dataProvider.deleteMap(map.map_id)
      if (!mounted.current) return
      setOpen(false)
      onDeleted(map.map_id)
    } catch (e) {
      // The backend's own sentence (409: what is in the way), as it is.
      if (mounted.current) setError(errorText(e))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton icon={MoreHorizontal} label={t('missions.maps.robots.more')} data-map-more="" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" style={{ background: color.elevated, border: 'none', color: color.t1, minWidth: 180 }}>
          <DropdownMenuItem data-delete-map="" onSelect={begin} style={{ fontSize: font.size.sm, gap: space[2], color: color.red }}>
            <Trash2 size={14} aria-hidden /> {t('missions.maps.robots.delete.open')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
        <DialogContent data-delete-map-dialog={map.map_id} style={{ background: color.elevated, border: 'none', color: color.t1 }}>
          <form style={{ display: 'grid', gap: space[4] }} onSubmit={(e) => { e.preventDefault(); void remove() }}>
            <DialogHeader>
              <DialogTitle style={{ color: color.t1 }}>{t('missions.maps.robots.delete.title', { name: map.name })}</DialogTitle>
              <DialogDescription id={askTextId} style={{ color: color.t2 }}>{t('missions.maps.robots.delete.body')}</DialogDescription>
            </DialogHeader>
            <label style={{ display: 'grid', gap: space[1] }}>
              <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.maps.robots.delete.typeName', { name: confirmText })}</span>
              <input
                name="confirm-name" value={typed} autoComplete="off" autoFocus disabled={busy}
                onChange={(e) => { setTyped(e.target.value); setError(null) }}
                style={{ border: 'none', borderRadius: radius.sm, padding: '6px 10px', background: color.card, color: color.t1, fontFamily: font.family, fontSize: font.size.md }}
              />
            </label>
            {error && (
              <p role="alert" data-delete-error="" style={{
                margin: 0, fontSize: font.size.sm, lineHeight: 1.5, color: color.red, padding: `${space[1]}px ${space[2]}px`,
                borderRadius: radius.sm, background: color.redBg,
              }}>{error}</p>
            )}
            <DialogFooter style={{ gap: space[2] }}>
              <Button disabled={busy} onClick={() => setOpen(false)}>{t('missions.maps.robots.delete.cancel')}</Button>
              <Button type="submit" variant="danger" icon={Trash2} disabled={!nameMatches || busy}>
                {busy ? t('missions.maps.robots.delete.deleting') : t('missions.maps.robots.delete.go')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
