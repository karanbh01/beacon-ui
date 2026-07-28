import type { Meta, StoryObj } from '@storybook/react'
import { TECH10, signedPct } from '../../mocks/tech10'
import { SummaryLine } from './SummaryLine'

const meta: Meta<typeof SummaryLine> = {
  title: 'Primitives/SummaryLine',
  component: SummaryLine,
  args: {
    items: [
      { label: 'Constituents', value: '10' },
      { label: 'As of', value: '27 Jul 2026' }
    ]
  }
}

export default meta
type Story = StoryObj<typeof SummaryLine>

export const Default: Story = {}

/**
 * BU-8 acceptance: the Weights summary line from mock data. Sigma is spelled
 * out because the reconciliation identity is the point of the line — the
 * table below it carries the per-name detail, so a stat strip here would
 * over-claim (taxonomy 7).
 */
export const Weights: Story = {
  args: {
    items: [
      { label: 'Constituents', value: String(TECH10.weights.constituents) },
      { label: 'Σ weight', value: TECH10.weights.sum.toFixed(2) },
      { label: 'Capped', value: String(TECH10.weights.capped) },
      { label: 'As of', value: TECH10.asOf }
    ]
  }
}

/** Signed values pick up success/danger, same rule as table numerics. */
export const WithSignedValues: Story = {
  args: {
    items: [
      { label: 'Gross', value: signedPct(TECH10.attribution.gross), tone: 'positive' },
      { label: 'Cap drag', value: signedPct(TECH10.attribution.capDrag), tone: 'negative' },
      { label: 'Costs', value: signedPct(TECH10.attribution.costs), tone: 'negative' },
      { label: 'YTD', value: signedPct(TECH10.attribution.ytd), tone: 'positive' }
    ]
  }
}

export const SinglePair: Story = {
  args: { items: [{ label: 'Rows', value: '1,284' }] }
}
