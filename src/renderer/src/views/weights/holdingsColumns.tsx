import type { ReactElement } from 'react'
import type { components } from '@shared/api.generated'
import type { Column } from '../../components/Table/Table'
import { PercentCell } from '../../components/Table/cells'
import {
  holdingColumns,
  type ReferenceColumn,
  type ReferenceValues
} from '../shared/holdingColumns'
import { StageTip } from '../shared/StageTip'

export type HoldingStage = components['schemas']['HoldingStage']
export type HoldingRow = components['schemas']['HoldingRow']

/** Stages that can drop a name, drawn as ✓ / ✕ / · as the constituent preview draws its rules. */
const SCREENING = new Set(['index_rule', 'implementation_screen', 'implementation_cap'])

type StageState = 'pass' | 'cut' | 'gone'

const GLYPH: Record<StageState, string> = { pass: '✓', cut: '✕', gone: '·' }

/** What a stage column filters on: the state in words. */
const STATE_WORDS: Record<StageState, string> = {
  pass: 'Passed',
  cut: 'Dropped here',
  gone: 'Dropped earlier'
}

/**
 * What a name did at a stage: passed it, was dropped by it, or had already
 * gone at an earlier one and was never seen by it.
 */
export function stageState(
  row: HoldingRow,
  stage: number,
  order: ReadonlyMap<string, number>
): StageState {
  if (row.excluded_at == null) return 'pass'
  const at = order.get(row.excluded_at)
  if (at === undefined) return 'pass'
  if (at === stage) return 'cut'
  return at < stage ? 'gone' : 'pass'
}

/**
 * Held names heaviest first, then the names that dropped out, in the order
 * they dropped, so the table reads down as the workflow reads across.
 */
export function holdingsOrder(
  rows: readonly HoldingRow[],
  stages: readonly HoldingStage[]
): HoldingRow[] {
  const order = new Map(stages.map((stage, at) => [stage.key, at]))
  const weightOf = (row: HoldingRow): number =>
    row.current_weight ?? row.portfolio_weight ?? row.strategy_weight ?? row.index_weight ?? 0
  // Held first (the stage count, past every stage), then the latest to drop.
  const leftAt = (row: HoldingRow): number =>
    row.excluded_at == null ? stages.length : (order.get(row.excluded_at) ?? stages.length)
  return [...rows].sort(
    (one, other) => leftAt(other) - leftAt(one) || weightOf(other) - weightOf(one)
  )
}

export interface HoldingsColumnsInput {
  stages: readonly HoldingStage[]
  rows: readonly HoldingRow[]
  reference: readonly ReferenceColumn[]
  /** On a rebalance day nothing has drifted, so the drift columns are left out. */
  between: boolean
}

/**
 * The strategy's workflow, left to right (Karan, 2026-10-19): the holding,
 * the index's rules, the index weights, the benchmark's, the strategy's,
 * the implementation's screens and caps, what the rebalance traded to,
 * how it has drifted since, and the shares held. Every figure is the
 * engine's (BN-326).
 */
export function holdingsColumns(input: HoldingsColumnsInput): Column<HoldingRow>[] {
  const { stages, rows, reference, between } = input
  const order = new Map(stages.map((stage, at) => [stage.key, at]))
  const has = (kind: string): boolean => stages.some((stage) => stage.kind === kind)
  const screens = (kinds: readonly string[]): Column<HoldingRow>[] =>
    stages.flatMap((stage, at) =>
      kinds.includes(stage.kind) && SCREENING.has(stage.kind)
        ? [stageColumn(stage, at, order, rules(stages, stage), stages[at - 1]?.remaining)]
        : []
    )

  return [
    ...holdingColumns<HoldingRow>(
      (row) => row.identifier,
      (row): ReferenceValues => row.reference,
      reference
    ),
    // Each name's share of the universe's market cap, where the engine sends it (BN-329).
    ...(rows.some((row) => universeWeightOf(row) != null)
      ? [weight('universe', 'Universe Weight', universeWeightOf)]
      : []),
    ...screens(['index_rule']),
    ...(has('index_cap')
      ? [weight('uncapped', 'Uncapped Index Weight', (row) => row.index_weight_uncapped)]
      : []),
    weight('index', 'Index Weight', (row) => row.index_weight),
    ...(rows.some((row) => row.benchmark_weight != null)
      ? [weight('benchmark', 'Benchmark Weight', (row) => row.benchmark_weight)]
      : []),
    ...(has('strategy')
      ? [weight('strategy', 'Strategy Weight', (row) => row.strategy_weight)]
      : []),
    ...screens(['implementation_screen', 'implementation_cap']),
    weight('portfolio', 'Portfolio Weight', (row) => row.portfolio_weight),
    ...(between
      ? [
          {
            key: 'drift',
            header: 'Weight Drift',
            width: 100,
            minWidth: 64,
            align: 'right' as const,
            render: (row: HoldingRow) => drift(row.weight_drift),
            value: (row: HoldingRow) => percentOf(row.weight_drift)
          },
          weight('current', 'Current Portfolio Weight', (row) => row.current_weight)
        ]
      : []),
    {
      key: 'shares',
      header: 'Shares Held',
      width: 110,
      minWidth: 72,
      align: 'right',
      render: (row) => (row.shares_held == null ? '—' : row.shares_held.toLocaleString('en-US')),
      value: (row) => row.shares_held
    }
  ]
}

/** Index rules numbered as the definition lists them; the rest by their label. */
function rules(stages: readonly HoldingStage[], stage: HoldingStage): string {
  if (stage.kind !== 'index_rule') return stage.label
  const number = stages.filter((each) => each.kind === 'index_rule').indexOf(stage) + 1
  return `${String(number).padStart(2, '0')} · ${stage.label}`
}

function stageColumn(
  stage: HoldingStage,
  at: number,
  order: ReadonlyMap<string, number>,
  header: string,
  /** The stage before's count: the names that came into this one. */
  before: number | undefined
): Column<HoldingRow> {
  return {
    key: `stage-${stage.key}`,
    header,
    // The engine's own account of the stage (py-beacon 0.9.3), on hover.
    tip: <StageTip stage={{ ...stage, before: before ?? null }} />,
    width: 76,
    minWidth: 48,
    wrapHeader: true,
    render: (row) => {
      const state = stageState(row, at, order)
      return <span className={`holdings-${state}`}>{GLYPH[state]}</span>
    },
    value: (row) => STATE_WORDS[stageState(row, at, order)]
  }
}

function weight(
  key: string,
  header: string,
  of: (row: HoldingRow) => number | null | undefined
): Column<HoldingRow> {
  return {
    key,
    header,
    width: 100,
    minWidth: 64,
    wrapHeader: true,
    align: 'right',
    render: (row) => {
      const value = of(row)
      return value == null ? '—' : `${(value * 100).toFixed(2)}%`
    },
    value: (row) => percentOf(of(row))
  }
}

/** A fraction in the percent a reader types into a range. */
function percentOf(value: number | null | undefined): number | undefined {
  return value == null ? undefined : value * 100
}

/** A name's share of its universe's market cap (py-beacon 0.9.3, BN-329). */
function universeWeightOf(row: HoldingRow): number | null | undefined {
  return row.universe_weight
}

/** Signed and toned: the direction is the point of a drift. */
function drift(value: number | null | undefined): ReactElement | string {
  return value == null ? '—' : <PercentCell value={value * 100} />
}
