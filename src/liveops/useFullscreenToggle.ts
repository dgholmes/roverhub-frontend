import { useEffect, useRef, useState } from 'react'

/** What a view mode needs to render a fullscreen toggle it does not own.
 * The element that actually goes fullscreen is the LiveOps workspace column,
 * so that the command bar and E-Stop stay on screen — see
 * `LiveOpsWorkspace` and docs/audit/2026-08-12-ui-ux-audit.md A-02. */
export interface FullscreenControl {
  isFullscreen: boolean
  onToggle: () => void
}

/** Owned by LiveOpsWorkspace, which holds the ref for every view mode
 * (Default/Cockpit/Split). Views receive a `FullscreenControl` instead. */
export function useFullscreenToggle<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      ref.current?.requestFullscreen()
    }
  }

  return { ref, isFullscreen, toggle }
}
