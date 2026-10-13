import { Maximize2, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '@/components/kit'

export function FullscreenButton({ isFullscreen, onToggle }: { isFullscreen: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <IconButton
      icon={isFullscreen ? Minimize2 : Maximize2}
      label={isFullscreen ? t('liveops.camera.exitFullscreen') : t('liveops.camera.fullscreen')}
      onClick={onToggle}
    />
  )
}
