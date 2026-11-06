import { useSessionStore } from '@/store/useSessionStore'
import { hashForSiteWorkspace } from '@/app/routes'
import { font } from '@/design-system/tokens'

/**
 * A name that goes somewhere: a mission, a robot or a run named in a table or
 * a card. Looks like the text around it until hovered, so a table of links
 * doesn't turn blue, and stops the click reaching a clickable row underneath.
 */
export function NameLink({ children, onClick, title, style }: {
  children: React.ReactNode
  onClick: () => void
  title?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button" title={title} className="rh-namelink"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
        font: 'inherit', fontFamily: font.family, color: 'inherit', textAlign: 'left',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/** A robot's name, linking to that robot in Fleet. */
export function RobotLink({ siteId, robotId, children, style }: {
  siteId: string
  robotId: string
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  return (
    <NameLink
      style={style}
      onClick={() => {
        // Fleet seeds its selection from the session's, so this opens the robot.
        setSelectedRobot(robotId)
        window.location.hash = hashForSiteWorkspace(siteId, 'Fleet')
      }}
    >
      {children}
    </NameLink>
  )
}

