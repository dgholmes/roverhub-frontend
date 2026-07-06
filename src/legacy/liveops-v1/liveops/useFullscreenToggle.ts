import { useEffect, useRef, useState } from 'react'

/** Shared by every LiveOps view-mode layout (Default/Cockpit/Split) that
 * offers a fullscreen toggle on its own container. */
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
