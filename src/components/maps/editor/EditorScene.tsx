import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { MapSceneLazy } from '@/components/scene/MapSceneLazy'
import type { FloorRect, SceneEditBox } from '@/scene3d/boxSelect'
import type { SceneData, SceneView } from '@/scene3d/types'

const VIEWS: SceneView[] = ['plan', 'fly']

/**
 * The 3D tab's canvas: the map scene (Plan with tilt, and Fly) over the
 * floor's cloud, with box select on while `selecting`, the editor's boxes, and
 * the moved points in amber. Everything else about the scene is as LiveOps and
 * the route editor have it.
 */
export function EditorScene({ data, selecting, boxes, highlight, onBoxDraft, onBoxSelect }: {
  data: SceneData
  selecting: boolean
  boxes: SceneEditBox[]
  highlight: Float32Array | null
  onBoxDraft: (rect: FloorRect | null) => void
  onBoxSelect: (rect: FloorRect) => void
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<SceneView>('plan')
  const [tilted, setTilted] = useState(true)
  const hint = useMemo(() => [
    selecting ? t('missions.maps.editor.scene.selectHint') : null,
    highlight ? t('missions.maps.editor.scene.movedShown') : null,
  ].filter(Boolean).join(' '), [selecting, highlight, t])
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapSceneLazy
        data={data} views={VIEWS} view={view} onViewChange={setView} followTarget="standin"
        pointerMode="tap" tilted={tilted} onTiltChange={setTilted} keyHelpOpen={false} allowFullscreen={false}
        boxSelect={selecting} onBoxDraft={onBoxDraft} onBoxSelect={onBoxSelect}
        editBoxes={boxes} highlightPoints={highlight}
        style={{ width: '100%', height: '100%', borderRadius: radius.md }}
      />
      {hint && (
        <p role="status" style={{
          position: 'absolute', left: '50%', bottom: space[3] + 40, transform: 'translateX(-50%)', margin: 0, zIndex: 3,
          padding: `${space[1]}px ${space[3]}px`, borderRadius: radius.md, background: 'var(--rh-overlay)',
          backdropFilter: 'blur(24px)', boxShadow: 'var(--rh-shadow-md)', pointerEvents: 'none',
          fontFamily: font.family, fontSize: font.size.sm, color: color.t1, maxWidth: '80%', textAlign: 'center',
        }}>
          {hint}
        </p>
      )}
    </div>
  )
}
