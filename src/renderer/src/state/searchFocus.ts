import { create } from 'zustand'

/**
 * Ctrl+K (BU-284): a request for the search bar to take the focus. A count
 * rather than a flag, so pressing it again while already there still lands.
 */
export const useSearchFocus = create<{ asked: number; ask: () => void }>()((set) => ({
  asked: 0,
  ask: () => {
    set((state) => ({ asked: state.asked + 1 }))
  }
}))
