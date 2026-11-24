/** English strings for the touch console (M4). Part of en.ts. */
export const touch = {
  nav: { workspacesAria: 'Workspaces', orgAria: 'Organization pages' },
  siteBar: { backAria: 'Back to the organization' },
  /** Why the two precision editors open read-only on a touch screen (M4 §7.6.3). */
  readOnly: {
    missionTitle: 'This mission opens to read — editing needs a larger screen',
    missionBody: 'Steps, the route and its checks are all here to read. Dragging waypoints and rearranging blocks needs a pointer, so editing is off on this screen.',
    zonesTitle: 'This map opens to read — editing needs a larger screen',
    zonesBody: 'The map and the zones drawn on it are all here to read. Drawing a no-go or geofence outline, or cleaning the floor, needs a pointer, so editing is off on this screen.',
    /** What a screen reader is told it has entered, in place of "Edit map",
     *  which would promise editing that is off. */
    zonesSection: 'Map, open to read',
  },
}
