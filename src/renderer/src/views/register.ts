import { registerView } from '../shell/viewRegistry'
import { GenericView, OverviewView, WeightsView } from './PlaceholderViews'
import { ChartingView } from './charting/ChartingView'
import { CorporateActionsView } from './corporate-actions/CorporateActionsView'
import { CoverageView } from './coverage/CoverageView'
import { IndexDefinitionView } from './index-definition/IndexDefinitionView'
import { PricesView } from './prices/PricesView'
import { ReferenceView } from './reference/ReferenceView'
import { UniverseView } from './universe/UniverseView'
import { WatchlistView } from './watchlist/WatchlistView'

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
  registerView('watchlist', WatchlistView)
  registerView('data-coverage', CoverageView)
  registerView('charting', ChartingView)
  registerView('index-definition', IndexDefinitionView)
  registerView('universe-set', UniverseView)

  for (const kind of [
    'constituent-preview',
    'constraint-set',
    'frontier',
    'futures-pricer',
    'factsheet'
  ]) {
    registerView(kind, GenericView)
  }
}
