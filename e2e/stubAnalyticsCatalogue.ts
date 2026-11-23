/**
 * GET /analysis/options as py-beacon 0.10.0 will answer it (BN-400), for the
 * stub and the design artifact.
 *
 * The statistics and the reports' contents are Karan's (py-beacon
 * planning/reports-choices-2026-10-29.json, by label). Ids, kinds and units
 * per statistic are not assigned upstream yet; these follow the agreed rules
 * (snake case of the name, shortened when long) and are the stub's guess.
 * Sections are the statistics' categories, as py-beacon proposes until the
 * headings are set per report.
 */

type Kind = 'figures' | 'series' | 'table'

export interface StubStatistic {
  id: string
  label: string
  category: string
  kind: Kind
  unit: string | null
  part: 'performance' | 'portfolio' | 'risk' | 'attribution'
  decimals: number
  description: string
  rolling: { cost: 'light' | 'moderate' | 'heavy'; step: 'daily' | 'month_end' } | null
  columns?: { name: string; label: string; unit: string | null; labels?: Record<string, string> }[]
  figure_names?: string[]
  /** Measured against the comparator only: one figure, `active`. */
  relative?: boolean
}

/*
 * id | label | category | kind | unit | part | roll (L, M, H or -)
 * Categories are the formulas page's, in its order.
 */
const STATISTICS = `
total_return|Total return|Returns|figures|fraction|performance|L
cagr|CAGR|Returns|figures|fraction|performance|L
money_weighted_return|Money-weighted return|Returns|figures|fraction|performance|H
trailing_returns|Trailing returns|Returns|table|-|performance|-
trailing_statistics|Statistics by period|Returns|table|-|performance|-
period_returns|Period returns|Returns|table|-|performance|-
best_worst_periods|Best and worst periods|Returns|table|-|performance|-
share_positive|Share of positive periods|Returns|figures|fraction|performance|L
average_gain_loss|Average gain and loss|Returns|table|-|performance|L
streaks|Longest streaks|Returns|table|-|performance|-
mean_returns|Arithmetic and geometric mean|Returns|table|-|performance|L
hit_rate|Hit rate (monthly)|Returns|figures|fraction|performance|L
month_of_year|Month of year|Returns|table|-|performance|-
volatility|Volatility|Risk|figures|fraction|performance|L
max_drawdown|Maximum drawdown|Drawdown|figures|fraction|performance|M
drawdown_episodes|Drawdown episodes|Drawdown|table|-|performance|-
downside_deviation|Downside deviation|Distribution|figures|fraction|performance|L
semi_variance|Semi-variance|Distribution|figures|fraction|performance|L
skew|Skew|Distribution|figures|ratio|performance|L
excess_kurtosis|Excess kurtosis|Distribution|figures|ratio|performance|L
tail_ratio|Tail ratio|Distribution|figures|ratio|performance|M
serial_correlation|Serial correlation|Distribution|figures|ratio|performance|L
return_histogram|Return histogram|Distribution|table|-|performance|-
return_distribution|Return distribution|Distribution|table|-|performance|-
bootstrap_ranges|Bootstrap ranges|Distribution|table|-|performance|-
sharpe_ratio|Sharpe ratio|Risk-adjusted|figures|ratio|performance|L
sortino_ratio|Sortino ratio|Risk-adjusted|figures|ratio|performance|L
calmar_ratio|Calmar ratio|Risk-adjusted|figures|ratio|performance|M
omega_ratio|Omega ratio|Risk-adjusted|figures|ratio|performance|L
kappa_3|Kappa 3|Risk-adjusted|figures|ratio|performance|L
upside_potential|Upside potential ratio|Risk-adjusted|figures|ratio|performance|L
martin_ratio|Martin ratio|Risk-adjusted|figures|ratio|performance|M
sterling_ratio|Sterling ratio|Risk-adjusted|figures|ratio|performance|M
burke_ratio|Burke ratio|Risk-adjusted|figures|ratio|performance|M
gain_to_pain|Gain to pain|Risk-adjusted|figures|ratio|performance|L
probabilistic_sharpe|Probabilistic Sharpe ratio|Risk-adjusted|figures|fraction|performance|L
deflated_sharpe|Deflated Sharpe ratio|Risk-adjusted|figures|fraction|performance|L
lo_sharpe|Lo-adjusted Sharpe ratio|Risk-adjusted|figures|ratio|performance|L
tracking_difference|Tracking difference|Relative|figures|fraction|performance|L
tracking_error|Tracking error|Relative|figures|fraction|performance|L
information_ratio|Information ratio|Relative|figures|ratio|performance|L
ir_t_stat|Information ratio t-stat|Relative|figures|ratio|performance|L
relative_return|Annualised relative return|Relative|figures|fraction|performance|L
beta|Beta|Relative|figures|ratio|performance|L
correlation|Correlation|Relative|figures|ratio|performance|L
alpha|Alpha and t-stat|Relative|table|-|performance|L
r_squared|R²|Relative|figures|ratio|performance|L
residual_risk|Residual risk|Relative|figures|fraction|performance|L
treynor_ratio|Treynor ratio|Relative|figures|ratio|performance|L
capture|Up and down capture|Relative|table|-|performance|L
batting_average|Batting average|Relative|figures|fraction|performance|L
downside_te|Downside tracking error|Relative|figures|fraction|performance|L
relative_drawdowns|Relative drawdowns|Relative|table|-|performance|M
td_by_year|Tracking difference by year|Relative|table|-|performance|-
rolling_outcomes|Rolling outcomes|Rolling|table|-|performance|-
crisis_returns|Crisis returns|Crises and regimes|table|-|performance|-
crisis_summary|Crisis summary|Crises and regimes|table|-|performance|-
crisis_paths|Crisis paths|Crises and regimes|table|-|performance|-
regime_figures|Regime figures|Crises and regimes|table|-|performance|-
holdings_count|Holdings count|Portfolio|figures|count|portfolio|-
holdings_range|Holdings over the run|Portfolio|table|-|portfolio|-
risk_rating|Risk rating and tracking band|Risk|table|-|performance|-
risk_distribution|Days at each risk rating and tracking band|Risk|table|-|performance|-
style_box|Style box|Portfolio|table|-|portfolio|-
style_positions|Style box positions|Portfolio|table|-|portfolio|-
style_classification|Style classification|Portfolio|table|-|portfolio|-
holdings_distribution|Days at each holdings count|Portfolio|table|-|portfolio|-
group_weights|Group weights|Portfolio|table|-|portfolio|-
group_exposures|Sector and country weights|Portfolio|table|-|portfolio|-
characteristics|Characteristics|Portfolio|table|-|portfolio|-
one_way_turnover|One-way turnover|Trading and costs|figures|fraction|portfolio|-
two_way_turnover|Two-way turnover|Trading and costs|figures|fraction|portfolio|-
trade_counts|Trades, buys and sells|Trading and costs|table|-|portfolio|-
costs_by_kind|Costs by kind|Trading and costs|table|-|portfolio|-
cost_per_unit|Cost per unit traded|Trading and costs|figures|bps|portfolio|-
cash_band_events|Cash band events|Cash and flows|table|-|portfolio|-
cash_trading|Cash trading by reason|Cash and flows|table|-|portfolio|-
aum_units|AUM and units|Cash and flows|table|-|portfolio|-
net_flows|Net flows|Cash and flows|figures|money|portfolio|-
flow_costs|Flow costs|Cash and flows|figures|money|portfolio|-
dealing_costs|Dealing costs|Cash and flows|figures|money|portfolio|-
costs_by_class|Costs by share class|Cash and flows|table|-|portfolio|-
income_yields|Income yields|Income|figures|fraction|portfolio|-
dividend_growth|Dividend growth|Income|figures|fraction|portfolio|-
etf_premium|ETF premium|ETF|table|-|portfolio|-
futures_trading|Futures trading|Futures|table|-|portfolio|-
futures_basis|Futures basis|Futures|series|bps|portfolio|-
futures_basis_risk|Futures basis risk|Futures|figures|fraction|portfolio|-
factor_exposures|Factor exposures|Factors|table|-|risk|-
factor_returns|Factor returns|Factors|table|-|risk|-
factor_betas|Factor betas|Factors|figures|ratio|risk|M
value_at_risk|Value at risk|Value at risk|figures|fraction|risk|M
expected_shortfall|Expected shortfall|Value at risk|figures|fraction|risk|H
stress_windows|Stress windows|Value at risk|table|-|risk|-
member_risk_return|Risk and return of every member|risk|table|fraction|risk|-
portfolio_risk_return|Risk and return of each portfolio|risk|table|fraction|risk|-
efficient_frontier|Efficient frontier in hindsight|risk|table|fraction|risk|-
market_correlations|Correlation with markets|Correlation|table|ratio|risk|-
rolling_correlations|Rolling correlation with markets|Correlation|table|ratio|risk|-
market_volatility|Volatility range with markets|Correlation|table|fraction|risk|-
trailing_risk|Risk statistics by period|Risk|table|-|risk|-
expected_risk|Expected volatility and tracking error|Risk contributions|table|-|risk|-
risk_contributions|Risk contributions|Risk contributions|table|-|risk|-
measured_contributions|Measured contributions|Risk contributions|table|-|risk|H
diversification_ratio|Diversification ratio|Risk contributions|figures|ratio|risk|-
average_correlation|Average correlation|Risk contributions|figures|ratio|risk|-
herfindahl|Herfindahl and effective number|Concentration|table|-|portfolio|-
top_weights|Top weights and coverage|Concentration|table|-|portfolio|-
concentration_curve|Concentration curve|Concentration|table|-|portfolio|-
gini_entropy|Gini and entropy|Concentration|table|-|portfolio|-
concentration_by_risk|Concentration by risk|Concentration|table|-|risk|-
absorption_ratio|Absorption ratio|Concentration|figures|fraction|risk|-
concentration_by_outcome|Concentration by outcome|Concentration|table|-|portfolio|-
drift|Drift|Concentration|figures|fraction|portfolio|-
days_to_sell|Days to sell and sellable share|Liquidity|table|-|portfolio|-
contribution|Contribution by name and group|Attribution|table|-|attribution|-
active_attribution|Active attribution|Attribution|table|-|attribution|-
brinson_fachler|Brinson-Fachler effects|Attribution|table|-|attribution|-
currency_attribution|Currency attribution|Attribution|table|-|attribution|-
factor_attribution|Factor attribution|Attribution|table|-|attribution|-
implementation_breakdown|Implementation breakdown|Attribution|table|-|attribution|-
`

const col = (name: string, label: string, unit: string | null = null) => ({ name, label, unit })
const BOOK_NAMES = { fund: 'Fund', index: 'Index', benchmark: 'Benchmark' }
/** The correlation tables' series: the books, then the provisional market stand-ins. */
const SERIES_LABELS: Record<string, string> = {
  fund: 'Fund',
  index: 'Index',
  benchmark: 'Benchmark',
  ACWI: 'Global equity',
  SPY: 'US equity',
  EEM: 'Emerging markets',
  AGG: 'US bonds',
  TLT: 'Long Treasuries',
  GLD: 'Gold',
  UUP: 'US dollar'
}
const SERIES_CODES = [
  'fund',
  'index',
  'benchmark',
  'ACWI',
  'SPY',
  'EEM',
  'AGG',
  'TLT',
  'GLD',
  'UUP'
]
/** Each characteristic's code, its label after the book's name, and its unit. */
const CHARACTERISTICS: [string, string, string][] = [
  ['MARKET_CAP', 'market cap', 'money'],
  ['PE_RATIO', 'P/E', 'ratio'],
  ['PB_RATIO', 'P/B', 'ratio'],
  ['DIVIDEND_YIELD', 'dividend yield', 'fraction'],
  // py-beacon 6fc7292 (BN-426): a year's growth, the weighted mean.
  ['EPS_GROWTH', 'earnings growth', 'fraction'],
  ['SALES_GROWTH', 'sales growth', 'fraction']
]
const BOOK_COLUMNS = [
  col('fund', 'Fund', 'fraction'),
  col('index', 'Index', 'fraction'),
  col('benchmark', 'Benchmark', 'fraction'),
  col('active', 'Active', 'fraction')
]

/** The columns of each table-kind statistic, in order. */
const COLUMNS: Record<string, StubStatistic['columns']> = {
  trailing_returns: [col('period', 'Period'), ...BOOK_COLUMNS],
  // Provisional (asked of py-beacon for BU-294): one row per period and
  // statistic, each statistic in its own unit from the catalogue. For a
  // relative statistic the Index and Benchmark columns are the fund against each.
  // Provisional (asked of py-beacon for BU-294): the fewest and most names
  // held at any rebalance, and the latest, with the index's.
  holdings_range: [
    { ...col('measure', 'Measure'), labels: { least: 'Fewest', most: 'Most', latest: 'Latest' } },
    col('fund', 'Fund', 'count'),
    col('index', 'Index', 'count'),
    col('benchmark', 'Benchmark', 'count')
  ],
  // Provisional: how many days the fund held each number of names.
  holdings_distribution: [
    col('names', 'Names', 'count'),
    col('days', 'Days', 'count'),
    col('share', 'Share of days', 'fraction')
  ],
  // Provisional: the cell each book's weighted centre falls in, Morningstar's "Large blend".
  style_classification: [
    {
      ...col('book', 'Portfolio'),
      labels: { fund: 'Fund', index: 'Index', benchmark: 'Benchmark' }
    },
    { ...col('size', 'Size'), labels: { large: 'Large', mid: 'Mid', small: 'Small' } },
    { ...col('style', 'Style'), labels: { value: 'Value', blend: 'Blend', growth: 'Growth' } },
    col('size_centre', 'Size centre'),
    col('style_centre', 'Style centre')
  ],
  // Provisional: each name's place in the style box, 0 to 3 down (size) and
  // across (style), and its weight in each book.
  style_positions: [
    col('name', 'Name'),
    col('size', 'Size position'),
    col('style', 'Style position'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction'),
    col('benchmark', 'Benchmark', 'fraction')
  ],
  // py-beacon a83a9b3 (BN-428): the 1 to 7 risk rating from annualised
  // volatility, and the tracking band from tracking error against the tracked
  // comparator; the index and benchmark rows have no band.
  risk_rating: [
    {
      ...col('book', 'Portfolio'),
      labels: { fund: 'Fund', index: 'Index', benchmark: 'Benchmark' }
    },
    col('rating', 'Risk rating'),
    {
      ...col('band', 'Tracking band'),
      labels: {
        passive: 'Passive',
        enhanced: 'Enhanced',
        active: 'Active',
        unconstrained: 'Unconstrained'
      }
    },
    col('volatility', 'Volatility', 'fraction'),
    col('tracking_error', 'Tracking error', 'fraction')
  ],
  // py-beacon a83a9b3 (BN-428): the fund's days at each rating and band, on
  // rolling one-year daily figures, by rating then band.
  risk_distribution: [
    col('rating', 'Risk rating'),
    {
      ...col('band', 'Tracking band'),
      labels: {
        passive: 'Passive',
        enhanced: 'Enhanced',
        active: 'Active',
        unconstrained: 'Unconstrained'
      }
    },
    col('days', 'Days', 'count'),
    col('share', 'Share of days', 'fraction')
  ],
  // Provisional: each book's latest weight in each sector and each country.
  group_exposures: [
    { ...col('grouping', 'Grouped by'), labels: { sector: 'Sector', country: 'Country' } },
    col('group', 'Group'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction'),
    col('benchmark', 'Benchmark', 'fraction')
  ],
  // Provisional: the weight in each size and style cell, Morningstar's grid.
  style_box: [
    { ...col('size', 'Size'), labels: { large: 'Large', mid: 'Mid', small: 'Small' } },
    { ...col('style', 'Style'), labels: { value: 'Value', blend: 'Blend', growth: 'Growth' } },
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction'),
    col('benchmark', 'Benchmark', 'fraction')
  ],
  // py-beacon 25efb21 (BN-422): a unit per row, as the books mix returns and a ratio.
  trailing_statistics: [
    {
      ...col('period', 'Period'),
      labels: {
        '1M': '1 month',
        '3M': '3 months',
        '6M': '6 months',
        '1Y': '1 year',
        '3Y': '3 years',
        '5Y': '5 years',
        '10Y': '10 years',
        MTD: 'Month to date',
        QTD: 'Quarter to date',
        YTD: 'Year to date',
        inception: 'Since inception'
      }
    },
    {
      ...col('statistic', 'Statistic'),
      labels: {
        total_return: 'Total return',
        annualised_return: 'Annualised return (CAGR)',
        volatility: 'Volatility',
        max_drawdown: 'Maximum drawdown',
        sharpe_ratio: 'Sharpe ratio',
        tracking_difference: 'Tracking difference',
        tracking_error: 'Tracking error'
      }
    },
    { ...col('unit', 'Unit'), labels: { fraction: 'Fraction', ratio: 'Ratio' } },
    col('fund', 'Fund'),
    col('index', 'Index'),
    col('benchmark', 'Benchmark')
  ],
  period_returns: [col('period', 'Year'), ...BOOK_COLUMNS],
  best_worst_periods: [
    col('measure', 'Period'),
    col('when', 'When'),
    col('fund', 'Fund', 'fraction')
  ],
  average_gain_loss: [
    col('measure', 'Measure'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction')
  ],
  streaks: [
    col('measure', 'Streak'),
    col('months', 'Months', 'count'),
    col('ended', 'Ended', 'date')
  ],
  mean_returns: [
    col('measure', 'Mean'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction')
  ],
  month_of_year: [
    col('month', 'Month'),
    col('mean', 'Mean return', 'fraction'),
    col('positive', 'Positive', 'fraction')
  ],
  drawdown_episodes: [
    col('peak', 'Peak', 'date'),
    col('trough', 'Trough', 'date'),
    col('recovery', 'Recovery', 'date'),
    col('depth', 'Depth', 'fraction'),
    col('length', 'Length', 'days')
  ],
  return_histogram: [
    col('bin', 'Monthly return'),
    col('fund', 'Fund', 'count'),
    col('index', 'Index', 'count')
  ],
  bootstrap_ranges: [
    col('measure', 'Measure'),
    col('low', '5th percentile', 'fraction'),
    col('high', '95th percentile', 'fraction')
  ],
  alpha: [col('measure', 'Measure'), col('active', 'Against the index', 'ratio')],
  capture: [col('measure', 'Capture'), col('active', 'Against the index', 'ratio')],
  relative_drawdowns: [
    col('peak', 'Peak', 'date'),
    col('trough', 'Trough', 'date'),
    col('depth', 'Depth', 'fraction')
  ],
  td_by_year: [
    col('year', 'Year'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction'),
    col('active', 'Difference', 'fraction')
  ],
  rolling_outcomes: [
    col('window', 'Window'),
    col('worst', 'Worst', 'fraction'),
    col('median', 'Median', 'fraction'),
    col('best', 'Best', 'fraction')
  ],
  // py-beacon d817ec8 (BN-431): the named crises, each with a status.
  crisis_returns: [
    col('name', 'Crisis'),
    col('start', 'Start', 'date'),
    col('end', 'End', 'date'),
    col('days', 'Days', 'days'),
    col('fund', 'Fund', 'fraction'),
    col('comparator', 'Comparator', 'fraction'),
    col('outperformance', 'Outperformance', 'fraction'),
    col('fund_drawdown', "Fund's drawdown", 'fraction'),
    col('comparator_drawdown', "Comparator's drawdown", 'fraction'),
    col('beta', 'Beta', 'ratio'),
    col('alpha', 'Alpha', 'fraction'),
    col('recovery_days', 'Days to recover', 'days'),
    col('recovery_date', 'Recovered', 'date'),
    {
      ...col('status', 'Status'),
      labels: {
        covered: 'Covered',
        partial: 'Partly covered',
        before_run: 'Before the run',
        after_run: 'After the run'
      }
    }
  ],
  crisis_paths: [
    col('crisis', 'Crisis'),
    col('date', 'Date', 'date'),
    {
      ...col('book', 'Portfolio'),
      labels: { fund: 'Fund', index: 'Index', benchmark: 'Benchmark' }
    },
    col('level', 'Level'),
    { ...col('phase', 'Phase'), labels: { crisis: 'Crisis', after: 'After' } }
  ],
  // py-beacon d817ec8 (BN-429, BN-430).
  member_risk_return: [
    col('name', 'Name'),
    col('return', 'Return', 'fraction'),
    col('volatility', 'Volatility', 'fraction'),
    col('observations', 'Periods', 'count'),
    col('first', 'First', 'date'),
    col('last', 'Last', 'date'),
    col('in_index_at_end', 'In the index at the end'),
    col('fund_weight', 'Fund weight', 'fraction'),
    col('index_weight', 'Index weight', 'fraction')
  ],
  portfolio_risk_return: [
    {
      ...col('book', 'Portfolio'),
      labels: { fund: 'Fund', index: 'Index', benchmark: 'Benchmark' }
    },
    col('return', 'Return', 'fraction'),
    col('volatility', 'Volatility', 'fraction'),
    col('observations', 'Periods', 'count'),
    col('first', 'First', 'date'),
    col('last', 'Last', 'date')
  ],
  efficient_frontier: [
    col('volatility', 'Volatility', 'fraction'),
    col('return', 'Return', 'fraction'),
    col('minimum_variance', 'Minimum variance')
  ],
  return_distribution: [
    col('low', 'From', 'fraction'),
    col('high', 'To', 'fraction'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction'),
    col('benchmark', 'Benchmark', 'fraction'),
    col('normal', 'Normal', 'fraction')
  ],
  // Provisional: the fund, its comparators and the market series against each
  // other, until the store holds market series (Karan's call which).
  market_correlations: [
    { ...col('series', 'Series'), labels: SERIES_LABELS },
    ...SERIES_CODES.map((code) => col(code, SERIES_LABELS[code] ?? code, 'ratio'))
  ],
  // Provisional: the fund against each over a trailing year, a point a week.
  rolling_correlations: [
    col('date', 'Date', 'date'),
    ...SERIES_CODES.slice(1).map((code) => col(code, SERIES_LABELS[code] ?? code, 'ratio'))
  ],
  // Provisional: each series' lowest, highest and latest volatility over a
  // trailing year, through the run (Karan, 2026-11-22).
  // Provisional, shaped as trailing_statistics is: the risk face's figures
  // over the last 1, 3 and 5 years and since inception (Karan, 2026-11-22).
  trailing_risk: [
    {
      ...col('period', 'Period'),
      labels: { '1Y': '1 year', '3Y': '3 years', '5Y': '5 years', inception: 'Since inception' }
    },
    {
      ...col('statistic', 'Statistic'),
      labels: {
        volatility: 'Volatility',
        max_drawdown: 'Max drawdown',
        beta: 'Beta',
        downside_deviation: 'Downside deviation',
        downside_tracking_error: 'Downside tracking error',
        tail_ratio: 'Tail ratio',
        skew: 'Skew',
        excess_kurtosis: 'Excess kurtosis',
        up_capture: 'Up capture',
        down_capture: 'Down capture'
      }
    },
    { ...col('unit', 'Unit'), labels: { fraction: 'Fraction', ratio: 'Ratio' } },
    col('fund', 'Fund'),
    col('index', 'Index'),
    col('benchmark', 'Benchmark')
  ],
  market_volatility: [
    { ...col('series', 'Series'), labels: SERIES_LABELS },
    col('low', 'Lowest', 'fraction'),
    col('high', 'Highest', 'fraction'),
    col('latest', 'Latest', 'fraction')
  ],
  crisis_summary: [col('measure', 'Measure'), col('fund', 'Fund', 'fraction')],
  regime_figures: [
    col('regime', 'Regime'),
    col('months', 'Months', 'count'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction')
  ],
  group_weights: [
    col('group', 'Sector'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction'),
    col('active', 'Active', 'fraction')
  ],
  // py-beacon 1f7cc52 (BN-425): a row per rebalance, a column per book and figure.
  characteristics: (['fund', 'index', 'benchmark'] as const).flatMap((book) =>
    CHARACTERISTICS.map(([code, label, unit]) =>
      col(`${book}/${code}`, `${BOOK_NAMES[book]} ${label}`, unit)
    )
  ),
  trade_counts: [col('measure', 'Measure'), col('value', 'Count', 'count')],
  costs_by_kind: [
    col('kind', 'Cost'),
    col('value', 'Amount', 'money'),
    col('bps', 'Of NAV', 'bps')
  ],
  cash_band_events: [
    col('date', 'Date', 'date'),
    col('event', 'Event'),
    col('value', 'Amount', 'money')
  ],
  cash_trading: [col('reason', 'Reason'), col('value', 'Traded', 'money')],
  aum_units: [col('measure', 'Measure'), col('value', 'Value', 'money')],
  costs_by_class: [
    col('class', 'Share class'),
    col('value', 'Costs', 'money'),
    col('bps', 'Of class NAV', 'bps')
  ],
  etf_premium: [col('measure', 'Measure'), col('value', 'Value', 'fraction')],
  futures_trading: [col('measure', 'Measure'), col('value', 'Value', 'money')],
  factor_exposures: [
    col('factor', 'Factor'),
    col('fund', 'Fund', 'ratio'),
    col('index', 'Index', 'ratio'),
    col('active', 'Active', 'ratio')
  ],
  factor_returns: [
    col('factor', 'Factor'),
    col('return', 'Return', 'fraction'),
    col('volatility', 'Volatility', 'fraction')
  ],
  stress_windows: [
    col('window', 'Window'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction')
  ],
  expected_risk: [
    col('measure', 'Measure'),
    col('value', 'Expected', 'fraction'),
    col('realised', 'Realised', 'fraction')
  ],
  risk_contributions: [
    col('name', 'Name'),
    col('weight', 'Weight', 'fraction'),
    col('contribution', 'Contribution', 'fraction')
  ],
  measured_contributions: [col('name', 'Name'), col('contribution', 'Contribution', 'fraction')],
  herfindahl: [
    col('measure', 'Measure'),
    col('fund', 'Fund', 'ratio'),
    col('index', 'Index', 'ratio')
  ],
  top_weights: [
    col('top', 'Top'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction')
  ],
  concentration_curve: [
    col('names', 'Names', 'count'),
    col('fund', 'Fund', 'fraction'),
    col('index', 'Index', 'fraction')
  ],
  gini_entropy: [
    col('measure', 'Measure'),
    col('fund', 'Fund', 'ratio'),
    col('index', 'Index', 'ratio')
  ],
  concentration_by_risk: [col('top', 'Top'), col('share', 'Share of risk', 'fraction')],
  concentration_by_outcome: [col('top', 'Top'), col('share', 'Share of return', 'fraction')],
  days_to_sell: [col('measure', 'Measure'), col('value', 'Value', 'days')],
  contribution: [
    col('name', 'Name'),
    col('weight', 'Average weight', 'fraction'),
    col('contribution', 'Contribution', 'fraction')
  ],
  active_attribution: [
    col('name', 'Name'),
    col('active_weight', 'Active weight', 'fraction'),
    col('contribution', 'Contribution', 'fraction')
  ],
  brinson_fachler: [
    col('group', 'Sector'),
    col('allocation', 'Allocation', 'fraction'),
    col('selection', 'Selection', 'fraction'),
    col('interaction', 'Interaction', 'fraction')
  ],
  currency_attribution: [
    col('currency', 'Currency'),
    col('contribution', 'Contribution', 'fraction')
  ],
  factor_attribution: [col('factor', 'Factor'), col('contribution', 'Contribution', 'fraction')],
  implementation_breakdown: [col('source', 'Source'), col('value', 'Effect', 'fraction')]
}

const DECIMALS: Record<string, number> = {
  fraction: 4,
  ratio: 2,
  bps: 1,
  money: 2,
  count: 0,
  days: 0
}
const ROLL = { L: 'light', M: 'moderate', H: 'heavy' } as const

export const CATALOGUE_STATISTICS: StubStatistic[] = STATISTICS.trim()
  .split('\n')
  .map((line) => {
    const [
      id = '',
      label = '',
      category = '',
      kind = 'figures',
      unit = '-',
      part = 'performance',
      roll = '-'
    ] = line.split('|')
    const columns = COLUMNS[id]
    const rolling =
      roll === '-'
        ? null
        : {
            cost: ROLL[roll as keyof typeof ROLL],
            step: roll === 'H' ? ('month_end' as const) : ('daily' as const)
          }
    return {
      id,
      label,
      category,
      kind: kind as Kind,
      unit: unit === '-' ? null : unit,
      part: part as StubStatistic['part'],
      decimals: DECIMALS[unit] ?? 2,
      description: `${label}, as py-beacon's formulas page defines it.`,
      rolling,
      ...(columns === undefined ? {} : { columns }),
      ...(id === 'value_at_risk' || id === 'expected_shortfall'
        ? { figure_names: ['method', 'level', 'horizon'] }
        : {}),
      ...(id === 'factor_betas' ? { figure_names: ['factor'] } : {}),
      ...(category === 'Relative' ? { relative: true } : {})
    }
  })

const byLabel = new Map(CATALOGUE_STATISTICS.map((statistic) => [statistic.label, statistic.id]))
const ALIASES: Record<string, string> = {
  Trailing: 'Trailing returns',
  Period: 'Period returns',
  Vol: 'Volatility',
  MDD: 'Maximum drawdown',
  'Max drawdown': 'Maximum drawdown',
  Sharpe: 'Sharpe ratio',
  Sortino: 'Sortino ratio',
  Calmar: 'Calmar ratio',
  TD: 'Tracking difference',
  TE: 'Tracking error',
  IR: 'Information ratio',
  'IR t': 'Information ratio t-stat',
  'IR t-stat': 'Information ratio t-stat',
  'Ann. relative return': 'Annualised relative return',
  Corr: 'Correlation',
  Alpha: 'Alpha and t-stat',
  'Alpha+t': 'Alpha and t-stat',
  'Up/down capture': 'Up and down capture',
  'Up/down': 'Up and down capture',
  Batting: 'Batting average',
  'Downside TE': 'Downside tracking error',
  'Relative DD': 'Relative drawdowns',
  'TD by year': 'Tracking difference by year',
  'Hit rate': 'Hit rate (monthly)',
  MWR: 'Money-weighted return',
  'Best/worst': 'Best and worst periods',
  'Best/worst periods': 'Best and worst periods',
  'Share positive': 'Share of positive periods',
  'Avg gain/loss': 'Average gain and loss',
  Streaks: 'Longest streaks',
  'Arith/geo mean': 'Arithmetic and geometric mean',
  'Arith/geo': 'Arithmetic and geometric mean',
  'Downside dev': 'Downside deviation',
  'Downside deviation': 'Downside deviation',
  'Semi-var': 'Semi-variance',
  Kurtosis: 'Excess kurtosis',
  'Serial corr': 'Serial correlation',
  Histogram: 'Return histogram',
  Bootstrap: 'Bootstrap ranges',
  UPR: 'Upside potential ratio',
  'Upside potential': 'Upside potential ratio',
  Martin: 'Martin ratio',
  Sterling: 'Sterling ratio',
  Burke: 'Burke ratio',
  Omega: 'Omega ratio',
  GtP: 'Gain to pain',
  'Gain to pain': 'Gain to pain',
  PSR: 'Probabilistic Sharpe ratio',
  DSR: 'Deflated Sharpe ratio',
  'Deflated Sharpe': 'Deflated Sharpe ratio',
  Lo: 'Lo-adjusted Sharpe ratio',
  'Lo Sharpe': 'Lo-adjusted Sharpe ratio',
  Residual: 'Residual risk',
  Treynor: 'Treynor ratio',
  'Two-way turnover': 'Two-way turnover',
  'Trades/buys/sells': 'Trades, buys and sells',
  'Trades/buys/sells/mean trade': 'Trades, buys and sells',
  'Cost per unit': 'Cost per unit traded',
  'Cost per unit traded': 'Cost per unit traded',
  'Expected vol and TE': 'Expected volatility and tracking error',
  'Avg correlation': 'Average correlation',
  'Average correlation': 'Average correlation',
  'Top weights': 'Top weights and coverage',
  'Top weights and coverage': 'Top weights and coverage',
  Herfindahl: 'Herfindahl and effective number',
  Gini: 'Gini and entropy',
  'Gini and entropy': 'Gini and entropy',
  'Conc. by risk': 'Concentration by risk',
  'Conc. by outcome': 'Concentration by outcome',
  Absorption: 'Absorption ratio',
  'Days to sell': 'Days to sell and sellable share',
  'Factor betas': 'Factor betas',
  VaR: 'Value at risk',
  ES: 'Expected shortfall',
  'Brinson-Fachler': 'Brinson-Fachler effects',
  'Futures basis': 'Futures basis',
  'Contribution by name and group': 'Contribution by name and group'
}

function idOf(label: string): string {
  const id = byLabel.get(ALIASES[label] ?? label)
  if (id === undefined) throw new Error(`stub catalogue: no statistic '${label}'`)
  return id
}

const ids = (labels: string): string[] => labels.split(',').map((label) => idOf(label.trim()))

/** Each report as Karan chose it (round 3): core, what extended adds, extended's optional ones, and what rolls. */
const REPORTS: {
  id: string
  label: string
  core: string
  adds: string
  optional: string
  rollCore: string
  rollExtended: string
}[] = [
  {
    id: 'factsheet',
    label: 'Factsheet',
    core: 'Total return, CAGR, Trailing returns, Period returns, Volatility, Max drawdown, Sharpe, Tracking difference, Tracking error, Information ratio, Annualised relative return, Beta, Correlation, Alpha+t, Holdings count, Group weights, Characteristics, Two-way turnover, AUM and units, Net flows, Income yields, ETF premium, Factor betas, Average correlation, Top weights and coverage',
    adds: 'Money-weighted return, Best/worst periods, Share positive, Avg gain/loss, Streaks, Arith/geo mean, Hit rate, Month of year, Drawdown episodes, Sortino, Calmar, Upside potential, Martin, Sterling, Burke, PSR, IR t-stat, R², Residual risk, Treynor, Up/down capture, Batting average, Downside TE, Relative drawdowns, TD by year, One-way turnover, Dividend growth, VaR, ES, Stress windows, Herfindahl',
    optional: 'Omega, Kappa 3, Gain to pain, Deflated Sharpe, Lo Sharpe, Concentration curve',
    rollCore: 'Volatility',
    rollExtended: 'Vol, MDD, Sharpe, PSR, DSR, TE, IR, Beta, Corr, Alpha, Factor betas'
  },
  {
    id: 'performance',
    label: 'Performance',
    core: 'Total return, CAGR, Trailing, Period, Hit rate, Vol, MDD, Drawdown episodes, Sharpe, Sortino, Calmar, TD, TE, IR, Beta, Corr, Alpha, Up/down capture, Crisis returns',
    adds: 'MWR, Best/worst, Share positive, Avg gain/loss, Streaks, Arith/geo, Month of year, Downside deviation, Semi-variance, Skew, Excess kurtosis, Tail ratio, Serial correlation, Return histogram, Bootstrap ranges, UPR, Martin, Sterling, Burke, PSR, IR t, Ann. relative return, R², Residual, Treynor, Batting, Downside TE, Relative DD, TD by year, Rolling outcomes, Crisis summary, Regime figures',
    optional: 'Omega, Kappa 3, GtP, DSR, Lo',
    rollCore: 'Total return, Vol, MDD, Sharpe, Sortino, TE, IR, Beta, Corr',
    rollExtended: 'Total return, Vol, MDD, Sharpe, Sortino, TE, IR, Beta, Corr'
  },
  {
    id: 'risk',
    label: 'Risk',
    core: 'Vol, MDD, Factor exposures, Factor returns, Factor betas, VaR, ES, Stress windows, Expected vol and TE, Risk contributions, Diversification ratio, Avg correlation, Top weights, Gini and entropy, Conc. by risk, Days to sell, Concentration curve',
    adds: 'Drawdown episodes, Downside dev, Semi-var, Skew, Kurtosis, Tail ratio, Serial corr, Histogram, Bootstrap, Rolling outcomes, Crisis returns, Crisis summary, Regime figures, Measured contributions, Herfindahl, Absorption, Conc. by outcome, Drift',
    optional: '',
    rollCore: 'Vol, MDD',
    rollExtended: 'Vol, MDD, Factor betas, VaR'
  },
  {
    id: 'tracking_error',
    label: 'Tracking error',
    core: 'TD, TE, IR, Beta, Corr, TD by year, Expected vol and TE, Risk contributions, Active attribution, Implementation breakdown',
    adds: 'IR t, Ann. relative return, Alpha, R², Residual, Treynor, Up/down, Batting, Downside TE, Relative DD, Rolling outcomes, One-way turnover, Costs by kind, Cash band events, Futures basis risk, Factor exposures, Days to sell, Brinson-Fachler, Factor attribution',
    optional: '',
    rollCore: 'TE, IR, Beta, Corr',
    rollExtended: 'TE, IR, Beta, Corr'
  },
  {
    id: 'factor',
    label: 'Factor',
    core: 'Factor exposures, Factor returns, Factor betas, Expected vol and TE, Risk contributions, Factor attribution',
    adds: 'Conc. by risk',
    optional: '',
    rollCore: '',
    rollExtended: 'Factor betas'
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    core: 'Holdings count, Group weights, Characteristics, One-way turnover, Costs by kind, Income yields, Factor exposures, Herfindahl, Top weights, Days to sell',
    adds: 'Two-way turnover, Trades/buys/sells/mean trade, Cost per unit traded, AUM and units, Net flows, Dividend growth, Factor returns, Factor betas, Gini, Conc. by risk, Absorption, Conc. by outcome, Drift, Concentration curve',
    optional: '',
    rollCore: '',
    rollExtended: 'Factor betas'
  },
  {
    id: 'attribution',
    label: 'Attribution',
    core: 'Contribution by name and group, Active attribution, Brinson-Fachler, Implementation breakdown',
    adds: 'Costs by kind, Factor exposures, Currency attribution, Factor attribution',
    optional: '',
    rollCore: '',
    rollExtended: ''
  },
  {
    id: 'implementation',
    label: 'Implementation',
    core: 'TD, TE, TD by year, One-way turnover, Costs by kind, Net flows, Dealing costs, ETF premium, Futures basis risk, Implementation breakdown',
    adds: 'IR, IR t, Ann. relative return, Beta, Corr, Alpha, R², Residual, Treynor, Up/down, Batting, Downside TE, Relative DD, Two-way turnover, Trades/buys/sells, Cost per unit, Cash band events, Cash trading by reason, AUM and units, Flow costs, Costs by share class, Futures trading, Futures basis',
    optional: '',
    rollCore: '',
    rollExtended: ''
  }
]

const CATEGORY_ORDER = [...new Set(CATALOGUE_STATISTICS.map((statistic) => statistic.category))]
const statisticOf = new Map(CATALOGUE_STATISTICS.map((statistic) => [statistic.id, statistic]))

interface Entry {
  id: string
  state: 'included' | 'optional'
  view: 'point' | 'rolling' | 'both'
}

/** A level's sections: its statistics grouped by category, in the formulas page's order. */
function sections(entries: Entry[]): { label: string; order: number; statistics: Entry[] }[] {
  const by = new Map<string, Entry[]>()
  for (const entry of entries) {
    const category = statisticOf.get(entry.id)?.category ?? 'Other'
    by.set(category, [...(by.get(category) ?? []), entry])
  }
  return CATEGORY_ORDER.filter((category) => by.has(category)).map((category, at) => ({
    label: category,
    order: at + 1,
    statistics: by.get(category) ?? []
  }))
}

function level(
  included: string[],
  optional: string[],
  rolling: string[]
): ReturnType<typeof sections> {
  const view = (id: string): Entry['view'] =>
    statisticOf.get(id)?.rolling == null ? 'point' : rolling.includes(id) ? 'both' : 'point'
  const unique = (list: string[]): string[] => [...new Set(list)]
  return sections([
    ...unique(included).map((id) => ({ id, state: 'included' as const, view: view(id) })),
    ...unique(optional)
      .filter((id) => !included.includes(id))
      .map((id) => ({ id, state: 'optional' as const, view: view(id) }))
  ])
}

const list = (labels: string): string[] => (labels.trim() === '' ? [] : ids(labels))

export const CATALOGUE_REPORTS = REPORTS.map((report, at) => {
  const core = list(report.core)
  const adds = list(report.adds)
  const optional = list(report.optional)
  return {
    id: report.id,
    label: report.label,
    order: at + 1,
    levels: {
      core: { sections: level(core, [...adds, ...optional], list(report.rollCore)) },
      extended: { sections: level([...core, ...adds], optional, list(report.rollExtended)) }
    }
  }
})

export const CATALOGUE_NAMES = {
  book: { fund: 'Fund', index: 'Index', benchmark: 'Benchmark', active: 'Active' },
  method: { historical: 'Historical', normal: 'Normal', cornish_fisher: 'Cornish-Fisher' },
  confidence: { '0.95': '95%', '0.99': '99%' },
  horizon: { '1': '1 day', '10': '10 days' },
  factor: { SIZE: 'Size', VALUE: 'Value', MOMENTUM: 'Momentum' }
}

export const CATALOGUE_UNAVAILABLE = [
  { code: 'no_index', label: 'No index', help: 'Relative figures need the run’s index.' },
  {
    code: 'no_benchmark',
    label: 'No benchmark',
    help: 'Run the backtest with a benchmark to see these.'
  },
  { code: 'no_quotes', label: 'No exchange quotes', help: 'Only an ETF run has exchange quotes.' },
  { code: 'no_futures', label: 'No futures', help: 'The run held no futures.' },
  { code: 'no_share_classes', label: 'No share classes', help: 'The run had one class.' },
  {
    code: 'no_data_store',
    label: 'No data store',
    help: 'Factor and liquidity figures read the data store.'
  },
  {
    code: 'too_short',
    label: 'Too short',
    help: 'The window is shorter than this statistic needs.'
  },
  { code: 'run_predates', label: 'Run predates 0.10.0', help: 'Backtest again to compute it.' }
]
