import type { ComponentType } from 'react'
import type { Tab } from '../state/tabs.types'

export interface ViewProps {
  tab: Tab
  /** Resolved live — a linked tab reads its source (BU-16). */
  subject: string | undefined
}

export type ViewComponent = ComponentType<ViewProps>

/**
 * viewKind → component. Views register here rather than the pane host
 * importing each one, so adding a view in BU-22 onward touches one line and
 * never the host.
 */
const registry = new Map<string, ViewComponent>()

export function registerView(viewKind: string, component: ViewComponent): void {
  registry.set(viewKind, component)
}

export function getView(viewKind: string): ViewComponent | undefined {
  return registry.get(viewKind)
}

export function registeredViewKinds(): string[] {
  return [...registry.keys()]
}

/** Test seam; production code never needs this. */
export function clearViews(): void {
  registry.clear()
}
