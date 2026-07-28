import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { SummaryLine } from '../SummaryLine/SummaryLine'
import { Table } from './Table'
import { WEIGHTS_COLUMNS } from './weightsColumns'
import { CONSTITUENTS, TECH10, syntheticConstituents } from '../../mocks/tech10'

const meta: Meta<typeof Table> = {
  title: 'Primitives/Table',
  component: Table as never
}

export default meta
type Story = StoryObj<typeof meta>

/** BU-12 acceptance: the Weights table reproduced from mock data. */
export const Weights: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SummaryLine
        items={[
          { label: '10 constituents', value: `Σ ${TECH10.weights.sum.toFixed(2)}%` },
          { label: 'top-5 weight', value: `${TECH10.weights.top5.toFixed(1)}%` },
          { label: 'HHI', value: TECH10.weights.hhi.toFixed(3) },
          { label: 'effective N', value: TECH10.weights.effectiveN.toFixed(1) },
          { label: 'capped at 20%', value: String(TECH10.weights.capped) },
          {
            label: 'drift since rebalance',
            value: `${TECH10.weights.driftSinceRebalance.toFixed(1)}%`
          }
        ]}
      />
      <Table
        columns={WEIGHTS_COLUMNS}
        rows={CONSTITUENTS}
        getRowId={(row) => row.ticker}
        totalRow={{ ticker: 'Total', weight: '100.00%', delta: '0.00' }}
      />
      <p className="type-11" style={{ color: 'var(--text-muted)', margin: 0 }}>
        Σ weights = 100.00% · capped names pinned at 20% until next rebalance · drift measured from
        19 Jun close · effective N = 1 / HHI
      </p>
    </div>
  )
}

/** Selection is a full-row wash, never a chip or border (taxonomy 5). */
export const Selectable: Story = {
  render: function SelectableDemo() {
    const [selected, setSelected] = useState('AVGO')
    return (
      <Table
        columns={WEIGHTS_COLUMNS}
        rows={CONSTITUENTS}
        getRowId={(row) => row.ticker}
        selectedId={selected}
        onSelectRow={(row) => {
          setSelected(row.ticker)
        }}
      />
    )
  }
}

export const Scrolled: Story = {
  render: () => (
    <Table
      columns={WEIGHTS_COLUMNS}
      rows={CONSTITUENTS}
      getRowId={(row) => row.ticker}
      maxBodyHeight={140}
    />
  )
}

/**
 * BU-12 acceptance: 10k rows. Only the visible window plus overscan is in the
 * DOM, so scrolling stays smooth — check the element count in devtools.
 */
export const TenThousandRows: Story = {
  render: () => (
    <Table
      columns={WEIGHTS_COLUMNS}
      rows={syntheticConstituents(10_000)}
      getRowId={(row) => row.ticker}
      maxBodyHeight={420}
      caption="10,000 ROWS · VIRTUALISED"
    />
  )
}
