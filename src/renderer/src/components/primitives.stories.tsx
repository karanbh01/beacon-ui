import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AddSlot } from './AddSlot/AddSlot'
import { Badge, StatusPill } from './Badge/Badge'
import { Card } from './Card/Card'
import { Checkbox } from './Checkbox/Checkbox'
import { KV, KVList } from './KV/KV'
import { SegmentedControl } from './SegmentedControl/SegmentedControl'
import { Table } from './Table/Table'
import { WEIGHTS_COLUMNS } from './Table/weightsColumns'
import { CONSTITUENTS, TECH10 } from '../mocks/tech10'

const meta: Meta = { title: 'Primitives/Batch (BU-13)' }
export default meta
type Story = StoryObj

const RANGES = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1Y', label: '1Y' },
  { value: '5Y', label: '5Y' },
  { value: 'MAX', label: 'MAX' }
] as const

export const Badges: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <Badge>FilterRule</Badge>
      <Badge>CapRule</Badge>
      <Badge>WeightRule</Badge>
      <StatusPill status="done" />
      <StatusPill status="running" />
      <StatusPill status="failed" />
      <StatusPill status="info" />
    </div>
  )
}

export const Ranges: Story = {
  render: function RangeDemo() {
    const [range, setRange] = useState<string>('1Y')
    return <SegmentedControl segments={RANGES} value={range} onChange={setRange} label="Range" />
  }
}

export const AddSlots: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 420 }}>
      <AddSlot label="Add rule…" />
      <AddSlot label="Add constraint…" />
      <AddSlot label="Add index…" indent={44} />
    </div>
  )
}

export const Checkboxes: Story = {
  render: function CheckboxDemo() {
    const [sections, setSections] = useState({ overview: true, weights: true, risk: false })
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Checkbox
          label="Index overview"
          checked={sections.overview}
          onChange={(v) => {
            setSections((s) => ({ ...s, overview: v }))
          }}
        />
        <Checkbox
          label="Weights & constituents"
          checked={sections.weights}
          onChange={(v) => {
            setSections((s) => ({ ...s, weights: v }))
          }}
        />
        <Checkbox
          label="Risk decomposition"
          checked={sections.risk}
          onChange={(v) => {
            setSections((s) => ({ ...s, risk: v }))
          }}
        />
        <Checkbox label="Unavailable section" checked={false} onChange={() => undefined} disabled />
      </div>
    )
  }
}

/**
 * BU-13 acceptance: a Key Facts pane composed from Card + KV alone.
 * Every figure comes from the sanctioned dataset (taxonomy 10).
 */
export const KeyFactsPane: Story = {
  render: () => (
    <Card title="Key facts" aside={<StatusPill status="done" />}>
      <KVList>
        <KV label="Base date" value={TECH10.baseDate} />
        <KV label="Base level" value={TECH10.baseLevel.toFixed(2)} />
        <KV label="Current level" value={TECH10.level.toFixed(2)} />
        <KV label="YTD" value="+14.20%" tone="positive" />
        <KV label="Cap drag" value="−0.84%" tone="negative" />
        <KV label="Tracking error" value={`${TECH10.risk.trackingError.toFixed(1)}%`} />
        <KV label="Constituents" value={String(TECH10.weights.constituents)} />
        <KV label="Pipeline resolves" value="10 constituents · 22 Jul 2026" tone="positive" />
      </KVList>
    </Card>
  )
}

/**
 * BU-13 acceptance: a Constraint Set pane composed from Card + Badge +
 * AddSlot + KV + Table. The Optimiser frames are not in the shared Figma
 * pages, so this follows the Index Definition methodology-card grammar
 * (numbered badge rows, per-section add slot, validation card) rather than a
 * measured Constraint Set frame.
 */
export const ConstraintSetPane: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 720 }}>
      <Card title="Constraint set">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { n: '01', type: 'BoundRule', text: 'Position weight ≤ 20%', note: '3 binding' },
            { n: '02', type: 'BoundRule', text: 'Sector weight ≤ 40%', note: '1 binding' },
            { n: '03', type: 'TurnoverRule', text: 'Two-way turnover ≤ 15%', note: 'slack 4.2%' }
          ].map((rule) => (
            <div key={rule.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="type-11" style={{ color: 'var(--text-muted)' }}>
                ⠿
              </span>
              <span className="type-10" style={{ color: 'var(--text-muted)' }}>
                {rule.n}
              </span>
              <Badge>{rule.type}</Badge>
              <span className="type-11" style={{ flex: 1, color: 'var(--text-primary)' }}>
                {rule.text}
              </span>
              <span className="type-11" style={{ color: 'var(--text-muted)' }}>
                {rule.note}
              </span>
            </div>
          ))}
          <AddSlot label="Add constraint…" indent={44} />
        </div>
      </Card>

      <Card title="Validation">
        <KVList>
          <KV label="Pipeline resolves" value="10 constituents · 22 Jul 2026" tone="positive" />
          <KV label="Σ weights" value="100.00%" tone="positive" />
          <KV label="Cap rule engages" value="3 names at 20%" />
          <KV label="Unbounded names" value="0" />
        </KVList>
      </Card>

      <Card title="Resulting weights" flush>
        <Table
          columns={WEIGHTS_COLUMNS.slice(0, 4)}
          rows={CONSTITUENTS}
          getRowId={(row) => row.ticker}
          maxBodyHeight={168}
        />
      </Card>
    </div>
  )
}
