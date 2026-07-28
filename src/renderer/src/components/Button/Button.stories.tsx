import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Export', variant: 'default', chevron: false },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'accent'] },
    chevron: { control: 'boolean' }
  }
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {}

export const DefaultWithChevron: Story = { args: { chevron: true } }

/** Affirmative actions only: Save, Apply, Run, Price, Export (taxonomy 5). */
export const Accent: Story = { args: { variant: 'accent', children: 'Apply' } }

export const AccentWithChevron: Story = {
  args: { variant: 'accent', children: 'Run', chevron: true }
}

export const Disabled: Story = { args: { disabled: true } }

/** Every state at once — the quickest way to eyeball a theme flip. */
export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button>Export</Button>
      <Button chevron>Range</Button>
      <Button variant="accent">Apply</Button>
      <Button variant="accent" chevron>
        Run
      </Button>
      <Button disabled>Disabled</Button>
      <Button variant="accent" disabled>
        Disabled
      </Button>
    </div>
  )
}
