import { Columns2, Gauge, Grid2x2, LayoutPanelLeft, Map as MapIcon, Videotape } from 'lucide-react'
import { Segmented, type SegmentOption } from '@/components/kit'
import { useSessionStore, type ViewMode } from '@/store/useSessionStore'
import { useTranslation } from 'react-i18next'

/** LiveOps view-mode switcher (docs/05-ui-ux.md §4). */
export function ViewModeSelector() {
  const viewMode = useSessionStore((s) => s.viewMode)
  const setViewMode = useSessionStore((s) => s.setViewMode)
  const { t } = useTranslation()
  const modes: SegmentOption<ViewMode>[] = [
    { value: 'stacked', label: t('viewModes.stacked'), icon: LayoutPanelLeft, title: t('viewModes.stackedTitle') },
    { value: 'map', label: t('viewModes.map'), icon: MapIcon, title: t('viewModes.mapTitle') },
    { value: 'cockpit', label: t('viewModes.cockpit'), icon: Gauge, title: t('viewModes.cockpitTitle') },
    { value: 'split', label: t('viewModes.split'), icon: Columns2, title: t('viewModes.splitTitle') },
    { value: 'dualcam', label: t('viewModes.dualcam'), icon: Videotape, title: t('viewModes.dualcamTitle') },
    // Several robots' cameras at once, for patrols (PatrolGridView).
    { value: 'grid', label: t('viewModes.grid'), icon: Grid2x2, title: t('viewModes.gridTitle') },
  ]

  return <Segmented label={t('viewModes.aria')} options={modes} value={viewMode} onChange={setViewMode} />
}
