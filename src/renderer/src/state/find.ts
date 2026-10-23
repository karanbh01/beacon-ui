import { create } from 'zustand'

interface FindState {
  open: boolean
  /** Kept between openings, as a browser's find bar keeps it. */
  query: string
  /** Bumped by each Ctrl+F, so pressing it again refocuses the open bar. */
  asked: number
  show: () => void
  hide: () => void
  setQuery: (query: string) => void
}

/** Ctrl+F's find bar (BU-283): whether it is up, and what it looks for. */
export const useFind = create<FindState>()((set) => ({
  open: false,
  query: '',
  asked: 0,
  show: () => {
    set((state) => ({ open: true, asked: state.asked + 1 }))
  },
  hide: () => {
    set({ open: false })
  },
  setQuery: (query) => {
    set({ query })
  }
}))
