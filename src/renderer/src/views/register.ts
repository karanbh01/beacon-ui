import { registerView } from '../shell/viewRegistry'
import { GenericView, OverviewView, WeightsView } from './PlaceholderViews'
import { CorporateActionsView } from './corporate-actions/CorporateActionsView'
import { PricesView } from './prices/PricesView'
import { ReferenceView } from './reference/ReferenceView'

/**
 * Registers stand-in views so the shell is navigable before real ones land.
 *
 * Called once at startup. A real view replaces its placeholder by
 * re-registering the same viewKind.
 */
export function registerPlaceholderViews(): void {
  registerView('weights', WeightsView)
  registerView('overview', OverviewView)

  // Live against py-beacon; no longer placeholders.
  registerView('prices', PricesView)
  registerView('reference-data', ReferenceView)
  registerView('corporate-actions', CorporateActionsView)

  for (const kind of [
    'charting',
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
