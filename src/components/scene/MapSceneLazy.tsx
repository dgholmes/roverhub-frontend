import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import type { MapSceneProps } from './mapSceneProps'
import { HostSwitchCorner } from './HostSwitchCorner'

export type { MapSceneProps } from './mapSceneProps'

// three.js is ~600 kB. Nothing outside this boundary imports MapScene (or
// anything under scene3d/engine), so it loads only when a scene is shown.
const MapScene = lazy(() => import('./MapScene').then((m) => ({ default: m.MapScene })))

/** What shows while the scene's chunk loads: the scene's own background, so
 * the pane does not flash. A host's view switch stays in its corner, so the
 * way out of the scene is there before the scene is. */
function SceneFallback({ className, style, viewSwitch, insets }: Pick<MapSceneProps, 'className' | 'style' | 'viewSwitch' | 'insets'>) {
  const { t } = useTranslation()
  return (
    <div
      className={className}
      role="status"
      style={{
        position: 'relative', background: color.sceneBg, color: color.t2, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: space[6], fontFamily: font.family, fontSize: font.size.md, ...style,
      }}
    >
      {t('scene.loading')}
      {viewSwitch && <HostSwitchCorner insets={insets}>{viewSwitch}</HostSwitchCorner>}
    </div>
  )
}

/** The map scene, lazily loaded. Use this, never MapScene directly. */
export function MapSceneLazy(props: MapSceneProps) {
  return (
    <Suspense fallback={<SceneFallback className={props.className} style={props.style} viewSwitch={props.viewSwitch} insets={props.insets} />}>
      <MapScene {...props} />
    </Suspense>
  )
}
