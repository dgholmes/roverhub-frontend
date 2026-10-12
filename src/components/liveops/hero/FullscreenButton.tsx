import { Maximize2, Minimize2 } from 'lucide-react'
import { IconButton } from '@/components/kit'

export function FullscreenButton({ isFullscreen, onToggle }: { isFullscreen: boolean; onToggle: () => void }) {
  return (
    <IconButton
      icon={isFullscreen ? Minimize2 : Maximize2}
      label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      onClick={onToggle}
    />
  )
}
