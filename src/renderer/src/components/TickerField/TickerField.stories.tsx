import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TickerField } from './TickerField'

const meta: Meta<typeof TickerField> = {
  title: 'Primitives/TickerField',
  component: TickerField,
  args: { subject: 'AAPL' }
}

export default meta
type Story = StoryObj<typeof TickerField>

export const Unlinked: Story = {}

/** Chain plus the instruction for taking ownership (taxonomy 2). */
export const Linked: Story = { args: { linkedTo: 'Prices' } }

/**
 * BU-9 acceptance, driven live: type in the linked field and it severs —
 * the chain drops and the hint switches to the plain query prompt. BU-16
 * consumes the same event to flip the tab to an independent query view.
 */
export const SeverOnType: Story = {
  render: function SeverDemo() {
    const [linked, setLinked] = useState(true)
    const [subject, setSubject] = useState('AAPL')
    const [log, setLog] = useState<string[]>([])

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TickerField
          subject={subject}
          {...(linked ? { linkedTo: 'Prices' } : {})}
          onQuery={(next) => {
            setSubject(next)
            setLog((entries) => [...entries, `query ${next}`])
          }}
          onSever={() => {
            setLinked(false)
            setLog((entries) => [...entries, 'sever'])
          }}
        />
        <p className="type-11" style={{ color: 'var(--text-muted)', margin: 0 }}>
          {linked ? 'linked — type to break' : 'independent'}
        </p>
        <ul className="type-11" style={{ color: 'var(--text-secondary)', margin: 0 }}>
          {log.map((entry, index) => (
            <li key={`${entry}-${String(index)}`}>{entry}</li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-default"
          onClick={() => {
            setLinked(true)
          }}
        >
          Re-link
        </button>
      </div>
    )
  }
}
