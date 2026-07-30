import { registerView } from '../shell/viewRegistry'
import { GenericView, OverviewView, PricesView, WeightsView } from './PlaceholderViews'

/**
 * Registers stand-in views so the shell is navigable before real ones land.
 *
 * Called once at startup. A real view replaces its placeholder by
 * re-registering the same viewKind — BU-22 will do exactly that for `prices`.
 */
export function registerPlaceholderViews(): void {
  registerView('weights', WeightsView)
  registerView('overview', OverviewView)
  registerView('prices', PricesView)

  for (const kind of [
    'charting',
    'reference-data',
    'index-definition',
    'universe',
    'constraint-set',
    'frontier',
    'futures-pricer',
    'factsheet'
  ]) {
    registerView(kind, GenericView)
  }
}
