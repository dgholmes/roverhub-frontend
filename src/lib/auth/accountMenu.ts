import { create } from 'zustand'

/** Whether the account menu is open. Shared so the top bar's "Engineer tools
 * on" chip can open it: at the site level the menu sits in the workspace rail
 * and the chip in the site bar, so they are not one component. Only one
 * OperatorProfile is mounted at a time (org top bar or site rail). */
export const useAccountMenu = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))
