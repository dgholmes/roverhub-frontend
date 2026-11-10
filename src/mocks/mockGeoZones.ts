import type { MapZone } from '@/types/maps'
import type { SampleSite } from '@/liveops/sampleSite'

export interface Point2D { x_m: number; y_m: number }

/** Synthetic North Yard site perimeter — placeholder until a real site plan
 * or survey boundary is available (see map-substrate assumption). */
export const geofence: Point2D[] = [
  { x_m: -5, y_m: -20 },
  { x_m: 60, y_m: -20 },
  { x_m: 60, y_m: 20 },
  { x_m: -5, y_m: 20 },
]

export const noGoZones: { id: string; label: string; points: Point2D[] }[] = [
  {
    id: 'ngz-1',
    label: 'No-Go — Loading Crane Radius',
    points: [
      { x_m: 20, y_m: -5 }, { x_m: 28, y_m: -5 }, { x_m: 28, y_m: 2 }, { x_m: 20, y_m: 2 },
    ],
  },
  {
    id: 'ngz-2',
    label: 'No-Go — Generator Exclusion',
    points: [
      { x_m: 46, y_m: -4 }, { x_m: 54, y_m: -4 }, { x_m: 54, y_m: 4 }, { x_m: 46, y_m: 4 },
    ],
  },
]

export const annotations: (Point2D & { id: string; note: string })[] = [
  { id: 'ann-1', x_m: 38, y_m: -16, note: 'Wet surface reported by site crew' },
]

/** The mock provider's sample site (see `SampleSite`): the perimeter and no-go
 * zones above as `MapZone`s, plus the pins. Only `mockDataProvider.sampleSite()`
 * hands it to the map, so it never reaches a canvas on the real backend. */
export const sampleSite: SampleSite = {
  zones: [
    {
      zone_id: 'mock-geofence', map_id: '', kind: 'geofence', label: 'North Yard perimeter',
      polygon: geofence.map((p): [number, number] => [p.x_m, p.y_m]),
    },
    ...noGoZones.map((z): MapZone => ({
      zone_id: z.id, map_id: '', kind: 'no_go', label: z.label,
      polygon: z.points.map((p): [number, number] => [p.x_m, p.y_m]),
    })),
  ],
  annotations,
}
