import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AssistantPanel } from './AssistantPanel'
import { MockTranscript } from './transcript'
import { AppShell } from '../shell/AppShell'

const meta: Meta<typeof AssistantPanel> = {
  title: 'Shell/AssistantPanel',
  component: AssistantPanel,
  parameters: { layout: 'fullscreen' }
}

export default meta
type Story = StoryObj<typeof AssistantPanel>

export const Panel: Story = {
  render: () => (
    <div style={{ height: 760, width: 380 }}>
      <AssistantPanel context={['TECH10 Backtest']}>
        <MockTranscript />
      </AssistantPanel>
    </div>
  )
}

/**
 * BU-18 acceptance: opening and closing reflows the pane. On a 1440 window
 * the pane goes 1382 → 1002, since 1440 − 58 sidebar − 380 rail = 1002.
 */
export const ReflowsThePane: Story = {
  render: function ReflowDemo() {
    const [open, setOpen] = useState(true)

    return (
      <div style={{ height: 760 }}>
        <AppShell
          sidebar={{ activeId: 'beacon-view' }}
          menuBar={{
            onToggleAssistant: () => {
              setOpen((value) => !value)
            }
          }}
          footer={{ engine: { state: 'connected', version: '0.0.2' } }}
          {...(open
            ? {
                assistant: (
                  <AssistantPanel
                    context={['TECH10 Backtest']}
                    onClose={() => {
                      setOpen(false)
                    }}
                  >
                    <MockTranscript />
                  </AssistantPanel>
                )
              }
            : {})}
        >
          <p className="type-11" style={{ color: 'var(--text-muted)' }}>
            Toggle the rail with the AI icon in the menu bar, or its ✕. The pane reflows; nothing
            here is wired to a backend yet.
          </p>
        </AppShell>
      </div>
    )
  }
}
