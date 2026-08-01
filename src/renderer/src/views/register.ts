import { getView, registerView } from '../shell/viewRegistry'
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
import { FactsheetView } from './factsheet/FactsheetView'
import { FrontierPaneView } from './frontier/FrontierPaneView'
import { FuturesPricerView } from './futures/FuturesPricerView'
import { IndexOverviewView } from './index-overview/IndexOverviewView'
import { IndexWeightsView } from './weights/IndexWeightsView'
import { OptimisationRunView } from './optimisation-run/OptimisationRunView'
import { RiskModelPaneView } from './risk-model/RiskModelPaneView'
import { TermStructureView } from './term-structure/TermStructureView'
import { TemplateEditorView } from './template-editor/TemplateEditorView'
import { TrsPricerView } from './trs/TrsPricerView'
import { IndexDefinitionView } from './index-definition/IndexDefinitionView'
import { PricesView } from './prices/PricesView'
import { ReferenceView } from './reference/ReferenceView'
import { UniverseView } from './universe/UniverseView'
import { WatchlistView } from './watchlist/WatchlistView'

/**
 * Every viewKind the app can render.
 *
 * Kinds still ahead of us fall through to `GenericView`, and that list is
 * applied with `registerPending` — which REFUSES to overwrite a live view.
 * A stale name left in it once silently replaced three finished panes with
 * "not built yet", and nothing failed: the app compiled, the tests passed,
 * and only a screenshot showed it.
 */
function registerPending(kind: string): void {
  if (getView(kind) !== undefined) return
  registerView(kind, GenericView)
}

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
  registerView('futures-pricer', FuturesPricerView)
  registerView('trs-pricer', TrsPricerView)
  registerView('term-structure', TermStructureView)
  registerView('factsheet', FactsheetView)
  registerView('template-editor', TemplateEditorView)

  for (const kind of ['performance-report', 'attribution-report']) {
    registerPending(kind)
  }
}
