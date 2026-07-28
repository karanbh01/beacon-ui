import type { Meta, StoryObj } from '@storybook/react'
import type { ReactElement } from 'react'
import { ICONS, type IconName } from './registry'

const NAMES = Object.keys(ICONS) as IconName[]

function Gallery({ size, color }: { size: number; color: string }): ReactElement {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
      {NAMES.map((name) => {
        const Icon = ICONS[name]
        return (
          <div
            key={name}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              width: 110
            }}
          >
            {/* colour comes from this container, never from the icon */}
            <div style={{ color, display: 'flex', alignItems: 'center', height: 40 }}>
              <Icon size={size} />
            </div>
            <span className="type-11" style={{ color: 'var(--text-muted)' }}>
              {name.replace(/Icon$/, '')}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const meta: Meta<typeof Gallery> = {
  title: 'Foundations/Icons',
  component: Gallery,
  args: { size: 24, color: 'var(--chrome-icon)' },
  argTypes: {
    size: { control: { type: 'range', min: 9, max: 48, step: 1 } },
    color: {
      control: 'select',
      options: [
        'var(--chrome-icon)',
        'var(--text-primary)',
        'var(--text-muted)',
        'var(--accent)',
        'var(--success)',
        'var(--danger)'
      ]
    }
  }
}

export default meta
type Story = StoryObj<typeof Gallery>

export const All: Story = {}

/** Every glyph is currentColor, so one token flips the whole set. */
export const Accent: Story = { args: { color: 'var(--accent)' } }

/** The chevron ships at 10px per BU-6; check it stays legible that small. */
export const Small: Story = { args: { size: 10 } }
