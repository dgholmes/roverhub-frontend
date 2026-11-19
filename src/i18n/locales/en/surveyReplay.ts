/** English strings for Data › Surveys: the surveys a robot has recorded, each
 * judged against the robot's own leg odometry, and their replays. Part of en.ts. */
export const surveyReplay = {
  list: {
    loading: 'Loading surveys…',
    open: 'Open survey {{name}}',
    takes_one: '{{count}} take',
    takes_other: '{{count}} takes',
    takesTitle: 'Trajectories built from this survey: the live one, re-runs and imports.',
    recordingDeleted: 'Recording deleted',
    recordingDeletedTitle: 'The robot’s computer has deleted this survey’s recording, so it can’t be re-run. Its takes still play.',
    emptyTitle: 'No surveys yet',
    emptyBody: 'A survey appears here once it is saved from Missions › Maps › Survey. Each keeps the map’s trajectory, checked against the robot’s own leg odometry.',
    errorTitle: 'Can’t reach the survey library',
    errorBody: 'The backend didn’t answer the survey list ({{error}}).',
  },
  verdict: {
    noDrift: 'No drift found',
    noDriftTitle: 'Every stretch of the live trajectory agrees with the legs.',
    driftFrom: 'Drift from {{at}}',
    driftFromTitle: 'The live trajectory first disagrees with the legs {{at}} into the survey.',
    noLegs: 'No leg odometry',
    noLegsTitle: 'This recording has no leg odometry, so drift can’t be judged.',
  },
  page: {
    back: 'Surveys',
    // Task 8 replaces this stub with the replay page.
    stub: 'The replay of {{id}} isn’t built yet.',
  },
} as const
