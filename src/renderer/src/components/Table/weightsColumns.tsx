import type { Column } from './Table'
import { DeltaCell, WeightBar } from './cells'
import { CONSTITUENTS, type Constituent } from '../../mocks/tech10'

const MAX_WEIGHT = Math.max(...CONSTITUENTS.map((row) => row.weight))

/**
 * Column defs for the Weights & Constituents table (Figma 355:2331), shared
 * by the story and its tests so both exercise the same shape. Widths are the
 * measured ones, not approximations.
 */
export const WEIGHTS_COLUMNS: readonly Column<Constituent>[] = [
  { key: 'ticker', header: 'Ticker', width: 75, emphasis: true, render: (r) => r.ticker },
  { key: 'name', header: 'Name', width: 160, render: (r) => r.name },
  { key: 'industry', header: 'GICS Sub-Industry', width: 210, render: (r) => r.industry },
  {
    key: 'weight',
    header: 'Weight',
    width: 85,
    align: 'right',
    emphasis: true,
    render: (r) => `${r.weight.toFixed(2)}%`
  },
  {
    key: 'bar',
    header: '',
    width: 200,
    render: (r) => <WeightBar value={r.weight} max={MAX_WEIGHT} />
  },
  {
    key: 'shares',
    header: 'Shares (000)',
    width: 110,
    align: 'right',
    render: (r) => r.shares.toLocaleString('en-US')
  },
  {
    key: 'delta',
    header: 'Δ since rebal',
    width: 105,
    align: 'right',
    render: (r) => <DeltaCell value={r.delta} />
  },
  {
    key: 'capped',
    header: 'Capped',
    width: 75,
    align: 'right',
    render: (r) => (r.capped ? '20% ✕' : '—')
  }
]
