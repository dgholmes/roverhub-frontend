import { SCENE_EDGE } from './sceneChrome'

/** A host's view switch on its own, where the scene's top-right row puts it:
 * the corner, `SCENE_EDGE` in (plus any host inset). For whatever stands in
 * for the scene (loading, no WebGL) and for a host's other views. */
export function HostSwitchCorner({ children, insets, zIndex = 2 }: {
  children: React.ReactNode
  insets?: { top?: number; right?: number }
  zIndex?: number
}) {
  return (
    <div data-scene-host-switch="" style={{
      position: 'absolute', zIndex, top: SCENE_EDGE + (insets?.top ?? 0), right: SCENE_EDGE + (insets?.right ?? 0),
      maxWidth: `calc(100% - ${2 * SCENE_EDGE}px)`,
    }}>
      {children}
    </div>
  )
}
