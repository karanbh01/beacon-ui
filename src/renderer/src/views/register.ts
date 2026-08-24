import { getView, registerView, type ViewComponent, type ViewMeta } from '../shell/viewRegistry'
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
import { DatabaseView } from './database/DatabaseView'
import { FeaturesView } from './features/FeaturesView'
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

/**
 * Every view the app can render, with what a tab of it looks like.
 *
 * One table, two consumers: this registers the components, and the new-tab
 * menu (BU-56) reads the same rows through `viewsForPage`. A separate
 * page→view list for the menu would drift the first time a view was added
 * here and not there.
 */
const VIEWS: readonly (ViewMeta & { kind: string; component: ViewComponent })[] = [
  {
    kind: 'prices',
    page: 'data-explorer',
    title: 'Prices',
    archetype: 'query',
    component: PricesView
  },
  {
    kind: 'charting',
    page: 'data-explorer',
    title: 'Charting',
    archetype: 'linked',
    component: ChartingView
  },
  {
    kind: 'reference-data',
    page: 'data-explorer',
    title: 'Reference Data',
    archetype: 'query',
    component: ReferenceView
  },
  {
    kind: 'database',
    page: 'data-explorer',
    title: 'Database',
    archetype: 'query',
    component: DatabaseView
  },
  {
    kind: 'features',
    page: 'data-explorer',
    title: 'Features',
    archetype: 'query',
    component: FeaturesView
  },
  {
    kind: 'corporate-actions',
    page: 'data-explorer',
    title: 'Corporate Actions',
    archetype: 'query',
    component: CorporateActionsView
  },
  {
    kind: 'watchlist',
    page: 'data-explorer',
    title: 'Watchlist',
    archetype: 'global',
    component: WatchlistView
  },
  {
    kind: 'data-coverage',
    page: 'data-explorer',
    title: 'Data Coverage',
    archetype: 'global',
    component: CoverageView
  },
  {
    kind: 'overview',
    page: 'beacon-view',
    title: 'Overview',
    archetype: 'pinned',
    component: IndexOverviewView
  },
  {
    kind: 'weights',
    page: 'beacon-view',
    title: 'Weights',
    archetype: 'pinned',
    component: IndexWeightsView
  },
  {
    kind: 'attribution',
    page: 'beacon-view',
    title: 'Attribution',
    archetype: 'pinned',
    component: AttributionView
  },
  {
    kind: 'asset-drilldown',
    page: 'beacon-view',
    title: 'Drilldown',
    archetype: 'linked',
    component: DrilldownView
  },
  {
    kind: 'comparison',
    page: 'beacon-view',
    title: 'Comparison',
    archetype: 'pinned',
    component: ComparisonView
  },
  {
    kind: 'backtest',
    page: 'beacon-view',
    title: 'Backtest',
    archetype: 'pinned',
    component: BacktestView
  },
  {
    kind: 'index-definition',
    page: 'strategy-builder',
    title: 'Index Definition',
    archetype: 'document',
    component: IndexDefinitionView
  },
  {
    kind: 'universe-set',
    page: 'strategy-builder',
    title: 'Universe Set',
    archetype: 'query',
    component: UniverseView
  },
  {
    kind: 'constituent-preview',
    page: 'strategy-builder',
    title: 'Constituent Preview',
    archetype: 'query',
    component: ConstituentPreviewView
  },
  {
    kind: 'constraint-set',
    page: 'optimiser',
    title: 'Constraint Set',
    archetype: 'query',
    component: ConstraintSetView
  },
  {
    kind: 'optimisation-run',
    page: 'optimiser',
    title: 'Run',
    archetype: 'query',
    component: OptimisationRunView
  },
  {
    kind: 'frontier',
    page: 'optimiser',
    title: 'Frontier',
    archetype: 'query',
    component: FrontierPaneView
  },
  {
    kind: 'factor-exposures',
    page: 'optimiser',
    title: 'Exposures',
    archetype: 'query',
    component: ExposuresPaneView
  },
  {
    kind: 'risk-model',
    page: 'optimiser',
    title: 'Risk Model',
    archetype: 'query',
    component: RiskModelPaneView
  },
  {
    kind: 'futures-pricer',
    page: 'derivatives',
    title: 'Futures',
    archetype: 'global',
    component: FuturesPricerView
  },
  {
    kind: 'trs-pricer',
    page: 'derivatives',
    title: 'TRS',
    archetype: 'global',
    component: TrsPricerView
  },
  {
    kind: 'term-structure',
    page: 'derivatives',
    title: 'Term Structure',
    archetype: 'pinned',
    component: TermStructureView
  },
  {
    kind: 'factsheet',
    page: 'reports',
    title: 'Factsheet',
    archetype: 'pinned',
    component: FactsheetView
  },
  {
    kind: 'template-editor',
    page: 'reports',
    title: 'Template Editor',
    archetype: 'query',
    component: TemplateEditorView
  }
]

export function registerPlaceholderViews(): void {
  for (const { kind, component, ...meta } of VIEWS) {
    registerView(kind, component, meta)
  }

  for (const kind of ['performance-report', 'attribution-report']) {
    registerPending(kind)
  }
}
