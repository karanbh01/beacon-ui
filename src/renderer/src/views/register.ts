import { registerView } from '../shell/viewRegistry'
import { GenericView } from './PlaceholderViews'
import { AttributionView } from './attribution/AttributionView'
import { BacktestView } from './backtest/BacktestView'
import { ChartingView } from './charting/ChartingView'
import { CorporateActionsView } from './corporate-actions/CorporateActionsView'
import { ConstituentPreviewView } from './constituent-preview/ConstituentPreviewView'
import { ComparisonView } from './comparison/ComparisonView'
import { ConstraintSetView } from './constraint-set/ConstraintSetView'
import { CoverageView } from './coverage/CoverageView'
import { DrilldownView } from './drilldown/DrilldownView'
import { ExposuresPaneView } from './exposures/ExposuresPaneView'
import { FrontierPaneView } from './frontier/FrontierPaneView'
import { IndexOverviewView } from './index-overview/IndexOverviewView'
import { IndexWeightsView } from './weights/IndexWeightsView'
import { OptimisationRunView } from './optimisation-run/OptimisationRunView'
import { RiskModelPaneView } from './risk-model/RiskModelPaneView'
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
  // Live against py-beacon; no longer placeholders.
  registerView('prices', PricesView)
  registerView('reference-data', ReferenceView)
  registerView('corporate-actions', CorporateActionsView)
  registerView('watchlist', WatchlistView)
  registerView('data-coverage', CoverageView)
  registerView('charting', ChartingView)
  registerView('index-definition', IndexDefinitionView)
  registerView('universe-set', UniverseView)
  registerView('constituent-preview', ConstituentPreviewView)
  registerView('backtest', BacktestView)
  registerView('overview', IndexOverviewView)
  registerView('weights', IndexWeightsView)
  registerView('attribution', AttributionView)
  registerView('asset-drilldown', DrilldownView)
  registerView('comparison', ComparisonView)
  registerView('constraint-set', ConstraintSetView)
  registerView('optimisation-run', OptimisationRunView)
  registerView('frontier', FrontierPaneView)
  registerView('factor-exposures', ExposuresPaneView)
  registerView('risk-model', RiskModelPaneView)

  for (const kind of ['constraint-set', 'frontier', 'futures-pricer', 'factsheet']) {
    registerView(kind, GenericView)
  }
}
