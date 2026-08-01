import type { Meta, StoryObj } from '@storybook/react'
import type { ThemeMode } from '../tokens/tokens'
import { mockLevels, mockVolume } from '../mocks/backtest'
import { LevelChart } from './LevelChart'
import { drawdown, maxDrawdown, rebase100, totalReturn } from './transform'

const meta: Meta = { title: 'Charts/Level (BU-28)' }
export default meta
type Story = StoryObj

const TECH10 = mockLevels({ seed: 42 })
const BENCH = mockLevels({ seed: 91, drift: 0.0003, volatility: 0.008 })
const VOLUME = mockVolume(TECH10)

function mode(context: { globals: Record<string, unknown> }): ThemeMode {
  return context.globals.theme === 'light' ? 'light' : 'dark'
}

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`
}

/** BU-28 acceptance: level chart plus drawdown subpanel, in both themes. */
export const LevelAndDrawdown: Story = {
  render: (_args, context) => {
    const worst = maxDrawdown(drawdown(TECH10))
    return (
      <LevelChart
        mode={mode(context)}
        series={[{ label: 'TECH10', points: TECH10 }]}
        subPanel={{
          label: `drawdown · max ${pct(worst?.value)}`,
          points: drawdown(TECH10),
          kind: 'area'
        }}
        note={`total ${pct(totalReturn(TECH10))}`}
        height={480}
      />
    )
  }
}

/** What BU-25 draws: two instruments rebased to a shared 100, plus volume. */
export const RebasedCompare: Story = {
  render: (_args, context) => (
    <LevelChart
      mode={mode(context)}
      series={[
        { label: 'AAPL', points: rebase100(TECH10) },
        { label: 'MSFT', points: rebase100(BENCH) }
      ]}
      subPanel={{ label: 'volume · AAPL', points: VOLUME, kind: 'histogram' }}
      note={`rebased · 100 = ${TECH10[0]?.date ?? ''}`}
      height={480}
    />
  )
}

/** One series, no subpanel — the shape Beacon View's overview uses. */
export const Bare: Story = {
  render: (_args, context) => (
    <LevelChart mode={mode(context)} series={[{ label: 'TECH10', points: TECH10 }]} height={320} />
  )
}
