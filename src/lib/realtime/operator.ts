/** Stand-in operator identity. There is no auth this round (CLAUDE.md), so
 * every command is attributed to the same synthetic operator -- used both as
 * the command's `initiated_by` and as the local control_owner.
 *
 * Its own module so mockDataProvider can use it too (a simulated run records
 * who started it, and a pause hands control to this operator) without
 * importing realDataProvider, which imports the mock. */
export const OPERATOR_ID = 'operator-dev'
