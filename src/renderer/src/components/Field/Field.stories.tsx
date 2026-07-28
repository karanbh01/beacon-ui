import type { Meta, StoryObj } from '@storybook/react'
import { Field } from './Field'

const meta: Meta<typeof Field> = {
  title: 'Primitives/Field',
  component: Field,
  args: { label: 'Label', value: 'Value', chevron: false, width: 160 }
}

export default meta
type Story = StoryObj<typeof Field>

export const Default: Story = {}

export const WithChevron: Story = { args: { chevron: true } }

/** Header usage: a real input handed in as children inherits the box. */
export const WithInput: Story = {
  args: {
    label: 'Ticker',
    children: <input defaultValue="AAPL" aria-label="Ticker" />
  }
}

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Field label="Label" value="Value" />
      <Field label="Range" value="1Y" chevron />
      <Field label="Interval" value="Daily" chevron width={120} />
      <Field label="As of" value="27 Jul 2026" width={140} />
    </div>
  )
}
