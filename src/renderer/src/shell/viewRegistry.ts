import type { ComponentType } from 'react'
import type { Archetype, Tab } from '../state/tabs.types'

export interface ViewProps {
  tab: Tab
  /** Resolved live — a linked tab reads its source (BU-16). */
  subject: string | undefined
}

export type ViewComponent = ComponentType<ViewProps>

/**
 * What a view is, beyond how to render it.
 *
 * The new-tab menu needs to know which page a view belongs to and which
 * archetype it opens as. Both live here rather than in a second list beside
 * the registry, because a page→view map only the menu knew about would drift
 * the first time a view was added.
 */
export interface ViewMeta {
  /** Sidebar page that hosts it. */
  page: string
  /** Tab title, as the frames name it. */
  title: string
  archetype: Archetype
}

interface Entry {
  component: ViewComponent
  meta?: ViewMeta
}

/**
 * viewKind → component. Views register here rather than the pane host
 * importing each one, so adding a view in BU-22 onward touches one line and
 * never the host.
 *
 * A placeholder registers without meta: it can be rendered if a tab of that
 * kind exists, and cannot be offered as something to open.
 */
const registry = new Map<string, Entry>()

export function registerView(viewKind: string, component: ViewComponent, meta?: ViewMeta): void {
  registry.set(viewKind, meta === undefined ? { component } : { component, meta })
}

export function getView(viewKind: string): ViewComponent | undefined {
  return registry.get(viewKind)?.component
}

export function registeredViewKinds(): string[] {
  return [...registry.keys()]
}

export interface ViewOption extends ViewMeta {
  viewKind: string
}

/** Everything a page can open, in registration order. */
export function viewsForPage(page: string): ViewOption[] {
  const options: ViewOption[] = []
  for (const [viewKind, entry] of registry) {
    if (entry.meta?.page === page) options.push({ viewKind, ...entry.meta })
  }
  return options
}

/** Test seam; production code never needs this. */
export function clearViews(): void {
  registry.clear()
}
