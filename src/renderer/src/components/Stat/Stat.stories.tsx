import type { Meta, StoryObj } from '@storybook/react'
import { TECH10, signedPct } from '../../mocks/tech10'
import { Stat, StatStrip } from './Stat'

const meta: Meta<typeof Stat> = {
  title: 'Primitives/Stat',
  component: Stat,
  args: { label: 'LEVEL', value: '341.34', tone: 'default' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['default', 'positive', 'negative'] }
  }
}

export default meta
type Story = StoryObj<typeof Stat>

export const Default: Story = {}

export const Positive: Story = { args: { label: 'YTD', value: '+14.20%', tone: 'positive' } }

export const Negative: Story = { args: { label: 'MAX DD', value: '-18.62%', tone: 'negative' } }

/**
 * BU-8 acceptance: the Backtest strip from mock data. Every figure here is
 * from the sanctioned dataset (taxonomy 10), so it reconciles with the
 * Weights line below and with whatever BU-27 renders.
 */
export const BacktestStrip: Story = {
  render: () => (
    <StatStrip>
      <Stat label="LEVEL" value={TECH10.level.toFixed(2)} />
      <Stat label="YTD" value={signedPct(TECH10.attribution.ytd)} tone="positive" />
      <Stat label="TRACKING ERROR" value={`${TECH10.risk.trackingError.toFixed(1)}%`} />
      <Stat label="BASE" value={TECH10.baseDate} />
    </StatStrip>
  )
}

/** Taxonomy 7 puts the strip gap between 40 and 48, chosen per view. */
export const StripGaps: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {[40, 44, 48].map((gap) => (
        <StatStrip key={gap} gap={gap}>
          <Stat label="GAP" value={`${String(gap)}px`} />
          <Stat label="LEVEL" value="341.34" />
          <Stat label="YTD" value="+14.20%" tone="positive" />
        </StatStrip>
      ))}
    </div>
  )
}
