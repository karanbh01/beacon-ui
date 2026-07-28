import type { Meta, StoryObj } from '@storybook/react'
import { FieldGrid, FieldRow, FieldRowGroup, FieldSection } from './FieldRow'

const meta: Meta<typeof FieldRow> = {
  title: 'Primitives/FieldRow',
  component: FieldRow,
  args: { label: 'Underlying', value: 'SPX', readOnly: false, chevron: false }
}

export default meta
type Story = StoryObj<typeof FieldRow>

/** A row on its own still needs the grid, which owns the two fixed widths. */
const inGrid: NonNullable<Story['render']> = (args) => (
  <FieldGrid>
    <FieldRowGroup>
      <FieldRow {...args} />
    </FieldRowGroup>
  </FieldGrid>
)

export const Default: Story = { render: inGrid }

/** Derived cells read as output: canvas fill, divider border, secondary text. */
export const ReadOnly: Story = {
  args: { label: 'Net carry rate', value: '1.84%', readOnly: true },
  render: inGrid
}

/**
 * The futures pricer as specified in taxonomy 8: 118px rail, 175px box, 40px
 * column gap. The anchor field stands alone; parallel params pair up;
 * unpartnered settings stand alone again.
 */
export const FuturesPricer: Story = {
  render: () => (
    <FieldGrid railWidth={118} boxWidth={175}>
      <FieldSection title="Contract" />
      <FieldRowGroup>
        <FieldRow label="Underlying" value="SPX" chevron />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Spot" value="5,412.30" />
        <FieldRow label="Expiry" value="19 Sep 2026" chevron />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Currency" value="USD" chevron />
      </FieldRowGroup>

      <FieldSection title="Rates" />
      <FieldRowGroup>
        <FieldRow label="Risk-free" value="4.25%" />
        <FieldRow label="Dividend yield" value="1.32%" />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Time to expiry" value="0.1425 y" readOnly />
        <FieldRow label="Net carry rate" value="2.93%" readOnly />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Business days" value="36" readOnly />
      </FieldRowGroup>
    </FieldGrid>
  )
}

/** TRS runs a wider rail and a narrower box — both are per-form, not global. */
export const TrsPricer: Story = {
  render: () => (
    <FieldGrid railWidth={122} boxWidth={170}>
      <FieldSection title="Swap terms" />
      <FieldRowGroup>
        <FieldRow label="Return type" value="Receive TR" chevron />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Notional" value="250,000,000" />
        <FieldRow label="Payment freq." value="Quarterly" chevron />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Borrow spread" value="35 bp" />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Term" value="1.00 y" readOnly />
      </FieldRowGroup>
    </FieldGrid>
  )
}

/**
 * Regression guard for taxonomy 8's sharpest rule: a lone field must sit at
 * column width, flush left — not stretched across the row, not centred.
 * Compare row 1 against row 2 and the left edges and box widths must agree.
 */
export const SingleFieldNeverStretches: Story = {
  render: () => (
    <FieldGrid>
      <FieldRowGroup>
        <FieldRow label="Alone" value="flush left" />
      </FieldRowGroup>
      <FieldRowGroup>
        <FieldRow label="Paired" value="same width" />
        <FieldRow label="Partner" value="second column" />
      </FieldRowGroup>
    </FieldGrid>
  )
}
