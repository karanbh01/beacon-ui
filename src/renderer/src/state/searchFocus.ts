import { create } from 'zustand'

/** Seek mode on arrival: once, held until Escape, or not at all (BU-285, BU-288). */
export type SeekOnArrival = 'once' | 'held' | undefined

interface SearchFocusState {
  asked: number
  seek: SeekOnArrival
  ask: (seek?: SeekOnArrival) => void
}

/**
 * Ctrl+K (BU-284): a request for the search bar to take the focus. A count
 * rather than a flag, so pressing it again while already there still lands.
 * Edit's seek items ask for it with seek mode on (BU-288).
 */
export const useSearchFocus = create<SearchFocusState>()((set) => ({
  asked: 0,
  seek: undefined,
  ask: (seek) => {
    set((state) => ({ asked: state.asked + 1, seek }))
  }
}))
