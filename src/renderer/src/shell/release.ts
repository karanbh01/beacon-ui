import { viewPage } from './viewRegistry'

/**
 * What a release build leaves out (BU-209).
 *
 * Karan's list for 0.1.0: the AI assistant and the Optimiser, Derivatives
 * and Reports pages are not finished, so they are not shipped. What ships
 * is the loop he actually runs: load data, define an index, back-test it,
 * read the result. They stay in `pnpm dev`, where they are worked on.
 *
 * Hidden rather than disabled. A greyed-out half of the sidebar makes a
 * first release look like a demo of itself, and a disabled control invites
 * "why" and implies a date.
 *
 * One list, read by everything that offers a way in: the sidebar, the home
 * page's quickstart, search, the Analysis menu and the menu bar's assistant
 * toggle. A way in that forgot to ask would be a hole in the release.
 */
export const WITHHELD_PAGES: ReadonlySet<string> = new Set(['optimiser', 'derivatives', 'reports'])

/** Decided by main and fixed for the life of the window. */
export function isReleaseBuild(): boolean {
  return window.beacon?.releaseBuild === true
}

export function pageShips(page: string): boolean {
  return !isReleaseBuild() || !WITHHELD_PAGES.has(page)
}

/** A view ships with its page. An unregistered kind is not this list's call. */
export function viewShips(viewKind: string): boolean {
  const page = viewPage(viewKind)
  return page === undefined || pageShips(page)
}

export function assistantShips(): boolean {
  return !isReleaseBuild()
}
