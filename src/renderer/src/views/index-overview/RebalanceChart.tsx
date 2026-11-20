import { useCallback, type ReactElement } from 'react'
import { StackedBarChart } from '../../charts/StackedBarChart'
import { seriesColor } from '../../charts/theme'
import type { ThemeMode } from '../../tokens/tokens'
import { fromFraction, percent, shortMonth } from '../shared/indexMetrics'
import type { StepRow } from './implementationRows'

/** The bars, bottom up, each a count of names at the rebalance. */
const PARTS = [
  { key: 'removed', label: 'Removed' },
  { key: 'capped', label: 'Capped' },
  { key: 'unfilled', label: 'Unfilled' }
] as const

/**
 * Beside the rebalances table (Karan, 2026-11-20): at each rebalance, how
 * many names the screens removed, the caps cut and the orders left unfilled,
 * stacked. The cash is in the table and the hover, not drawn. A bar opens
 * its rebalance in the table, and the one open there stands out.
 */
export function RebalanceChart({
  steps,
  mode,
  height,
  opened,
  onSelect
}: {
  steps: readonly StepRow[]
  mode: ThemeMode
  height: number
  /** The rebalance open in the table, if any. */
  opened: string | undefined
  onSelect: (date: string) => void
}): ReactElement {
  const value = useCallback(
    (date: string, part: string): number => {
      const row = steps.find((each) => each.date === date)
      if (row === undefined) return 0
      return part === 'removed' ? row.removed : part === 'capped' ? row.capped : row.unfilled
    },
    [steps]
  )
  const cashOn = (date: string): string =>
    percent(fromFraction(steps.find((each) => each.date === date)?.cashWeight), 2)

  return (
    <StackedBarChart
      categories={steps.map((row) => row.date)}
      series={PARTS.map((part, at) => ({ ...part, colour: seriesColor(mode, at) }))}
      value={value}
      mode={mode}
      height={height}
      format={(count) => String(count)}
      tickLabel={shortMonth}
      tipExtra={(date) => [['Cash', cashOn(date)]]}
      focus={opened}
      onSelect={onSelect}
      label="Names removed, capped and unfilled per rebalance"
    />
  )
}
