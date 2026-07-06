import type { Dock } from '@/types'

export const mockDocks: Dock[] = [
  {
    dock_id: 'dock-01',
    name: 'North Yard Dock A',
    site_id: 'site-north-yard',
    x_m: 0, y_m: 0, heading_deg: 0,
    charging_cable: true,
    last_robot_id: 'zaezae-x1-001',
    last_used_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    dock_id: 'dock-02',
    name: 'North Yard Dock B',
    site_id: 'site-north-yard',
    x_m: 2, y_m: 1, heading_deg: 90,
    charging_cable: true,
    last_robot_id: 'zaezae-x1-002',
    last_used_at: new Date(Date.now() - 20 * 3600_000).toISOString(),
  },
  {
    dock_id: 'dock-03',
    name: 'North Yard Dock C',
    site_id: 'site-north-yard',
    x_m: -3, y_m: 4, heading_deg: 180,
    charging_cable: false,
    last_robot_id: null,
    last_used_at: null,
    notes: 'No charging cable installed yet — location reserved for future expansion.',
  },
]
