/** Which robot LiveOps shows for the session's selection.
 *
 * The selected robot when it is known. While an explicit choice is still
 * waiting to be discovered (useSessionStore `selectionPending`), nothing --
 * `waitingFor` names it instead. Showing robots[0] meanwhile put the cockpit,
 * and its E-Stop, on a different robot than the one selected, and swapped it
 * underneath the operator when the selected one arrived. Otherwise the first
 * robot, as before. */
export function resolveShownRobot<R extends { robot_id: string }>(
  robots: R[],
  selectedRobotId: string | null,
  selectionPending: boolean,
): { robot: R | null; waitingFor: string | null } {
  const selected = selectedRobotId === null ? undefined : robots.find((r) => r.robot_id === selectedRobotId)
  if (selected) return { robot: selected, waitingFor: null }
  if (selectedRobotId !== null && selectionPending) return { robot: null, waitingFor: selectedRobotId }
  return { robot: robots[0] ?? null, waitingFor: null }
}
