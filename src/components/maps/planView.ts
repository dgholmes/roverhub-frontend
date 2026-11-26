/** Flat is the floor plan; 3D is the map scene (Plan / Fly, as in LiveOps);
 *  Point cloud is the plain white cloud (CloudViewer3D). The Map page's header
 *  chooses one, and the centre map (MapPlanView) shows it. */
export type PlanView = '2d' | 'scene' | 'cloud'

export const PLAN_VIEWS: readonly PlanView[] = ['2d', 'scene', 'cloud']

/** Why the view is held on Flat, or null: a zone being drawn or a home being
 *  picked is placed on the floor plan, so either brings it back. */
export type PlanViewHold = 'drawing' | 'picking' | null

export function planViewHold(drawing: unknown, picking: boolean | undefined): PlanViewHold {
  return drawing ? 'drawing' : picking ? 'picking' : null
}

/** The view shown: the one chosen, unless something is being placed on the plan. */
export function shownPlanView(chosen: PlanView, hold: PlanViewHold): PlanView {
  return hold ? '2d' : chosen
}
