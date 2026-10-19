import type { components } from '@shared/api.generated'
import { fromFraction, percent, signedPercent } from '../shared/indexMetrics'
import type { ComparatorFigures, Comparators, RelativeFigures } from './comparators'

type Metrics = components['schemas']['BacktestMetrics']

/** One statistic across the strategy and whatever it is compared with. */
export interface SummaryRow {
  key: string
  label: string
  strategy: string
  index: string
  vsIndex: string
  benchmark: string
  vsBenchmark: string
}

type Value = number | null | undefined

interface Spec {
  key: string
  label: string
  /** The strategy's own figure. */
  own?: (metrics: Metrics | undefined) => Value
  /** A comparator's own figure. */
  theirs?: (figures: ComparatorFigures) => Value
  /** The strategy against a comparator. */
  between?: (figures: RelativeFigures) => Value
  format: (value: number) => string
}

const signed = (value: number): string => signedPercent(fromFraction(value), 2)
const plain = (value: number): string => percent(fromFraction(value), 2)
const share = (value: number): string => percent(fromFraction(value), 1)
const ratio = (value: number): string => value.toFixed(2)

/*
 * Every figure is py-beacon's (Karan, 2026-10-18; BN-323): the strategy's
 * from its metrics, each comparator's from its own figures, and the "vs."
 * columns from the relative figures. Where the engine reports no relative
 * figure (volatility, Sharpe, drawdown) the column is blank rather than a
 * subtraction done here.
 */
const SPECS: readonly Spec[] = [
  {
    key: 'return',
    label: 'Total return',
    own: (m) => m?.total_return,
    theirs: (f) => f.total_return,
    between: (r) => r.relative_return,
    format: signed
  },
  {
    key: 'annualised',
    label: 'Annualised return',
    own: (m) => m?.annualised_return,
    theirs: (f) => f.annualised_return,
    between: (r) => r.annualised_relative_return,
    format: signed
  },
  {
    key: 'volatility',
    label: 'Volatility',
    own: (m) => m?.volatility,
    theirs: (f) => f.volatility,
    format: plain
  },
  {
    key: 'sharpe',
    label: 'Sharpe ratio',
    own: (m) => m?.sharpe_ratio,
    theirs: (f) => f.sharpe_ratio,
    format: ratio
  },
  {
    key: 'drawdown',
    label: 'Max drawdown',
    own: (m) => m?.max_drawdown,
    theirs: (f) => f.max_drawdown,
    format: signed
  },
  {
    key: 'hit',
    label: 'Hit rate · monthly',
    own: (m) => m?.hit_rate_monthly,
    theirs: (f) => f.hit_rate_monthly,
    // Against a comparator: the share of months the strategy beat it.
    between: (r) => r.hit_rate_monthly,
    format: share
  },
  { key: 'tracking', label: 'Tracking error', between: (r) => r.tracking_error, format: plain },
  {
    key: 'information',
    label: 'Information ratio',
    between: (r) => r.information_ratio,
    format: ratio
  },
  {
    key: 'correlation',
    label: 'Correlation',
    between: (r) => r.correlation,
    format: (value) => value.toFixed(3)
  },
  { key: 'beta', label: 'Beta', between: (r) => r.beta, format: ratio }
]

/**
 * The Summary table: Strategy, Index, vs. Index, Benchmark, vs. Benchmark
 * (Karan, 2026-10-18), a comparator's columns only when the strategy has it.
 */
export function summaryRows(metrics: Metrics | undefined, comparators: Comparators): SummaryRow[] {
  return SPECS.map((spec) => {
    const against = (comparator: Comparators['index']): { level: string; vs: string } => {
      if (comparator === undefined) return { level: '', vs: '' }
      return {
        level: shown(spec.theirs?.(comparator.own), spec.format),
        vs: shown(spec.between?.(comparator.relative), spec.format)
      }
    }
    const index = against(comparators.index)
    const benchmark = against(comparators.benchmark)
    return {
      key: spec.key,
      label: spec.label,
      strategy: shown(spec.own?.(metrics), spec.format),
      index: index.level,
      vsIndex: index.vs,
      benchmark: benchmark.level,
      vsBenchmark: benchmark.vs
    }
  })
}

function shown(value: Value, format: (value: number) => string): string {
  return value === null || value === undefined ? '—' : format(value)
}
