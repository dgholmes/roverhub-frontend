import { useEffect, useState } from 'react'
import { color, font } from '@/design-system/tokens'
import { TopBar } from '@/components/shell/TopBar'
import { LiveOpsWorkspace } from '@/components/liveops/LiveOpsWorkspace'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { ComingSoon } from './ComingSoon'
import { hashForWorkspace, workspaceFromHash, type Workspace } from './routes'

export function AppShell() {
  const [workspace, setWorkspace] = useState<Workspace>(() => workspaceFromHash(window.location.hash))

  useEffect(() => {
    const onHash = () => setWorkspace(workspaceFromHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function navigate(w: Workspace) {
    window.location.hash = hashForWorkspace(w)
    setWorkspace(w)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      background: color.bg,
      fontFamily: font.family,
    }}>
      <TopBar active={workspace} onSelect={navigate} />
      {workspace === 'LiveOps' ? <LiveOpsWorkspace />
        : workspace === 'Fleet' ? <FleetWorkspace />
        : <ComingSoon workspace={workspace} />}
    </div>
  )
}
