import { Columns2, Gauge, Grid2x2, Map as MapIcon, Videotape } from 'lucide-react'
import { Segmented, type SegmentOption } from '@/components/kit'
import { useSessionStore, type ViewMode } from '@/store/useSessionStore'

const MODES: SegmentOption<ViewMode>[] = [
  { value: 'map',     label: 'Map',      icon: MapIcon,   title: 'Map fills the view, camera docked' },
  { value: 'cockpit', label: 'Cockpit',  icon: Gauge,     title: 'Camera fills the view, map inset' },
  { value: 'split',   label: 'Split',    icon: Columns2,  title: 'Map and camera side by side' },
  { value: 'dualcam', label: 'Dual cam', icon: Videotape, title: 'Front and rear cameras together' },
  // R2-only: visible, labelled and permanently disabled per docs/05-ui-ux.md
  // §14 / §18.3 — roadmap controls communicate, they never just disappear.
  { value: 'grid', label: '2×2 grid', icon: Grid2x2, disabled: true, title: 'Multi-robot patrol grid — coming in R2' },
]

/** LiveOps view-mode switcher (docs/05-ui-ux.md §4). */
export function ViewModeSelector() {
  const viewMode = useSessionStore((s) => s.viewMode)
  const setViewMode = useSessionStore((s) => s.setViewMode)

  return <Segmented label="LiveOps view" options={MODES} value={viewMode} onChange={setViewMode} />
}
