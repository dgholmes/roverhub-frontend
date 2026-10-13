import { Wrench } from 'lucide-react'
import { EmptyState } from './parts'

/** Maintenance history needs somewhere to live, and RoverHub has no database
 * yet. Notes taken here would vanish on reload, so the tab says so plainly
 * rather than offering a form that silently loses work. */
export function MaintenanceTab() {
  return (
    <EmptyState title="Maintenance history isn't stored yet" icon={Wrench}>
      Service notes, inspections and parts swaps need a database, and RoverHub doesn't have one yet. Anything
      typed here would be lost on reload, so adding notes is turned off until storage exists.
    </EmptyState>
  )
}
