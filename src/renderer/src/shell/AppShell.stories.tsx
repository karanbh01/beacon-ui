import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { AppShell } from './AppShell'
import { SIDEBAR_PAGES } from './pages'
import { Button } from '../components/Button/Button'
import { PaneHeader } from '../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../components/SummaryLine/SummaryLine'
import { Table } from '../components/Table/Table'
import { WEIGHTS_COLUMNS } from '../components/Table/weightsColumns'
import { Tab } from '../components/Tab/Tab'
import { TabBar } from '../components/Tab/TabBar'
import { CONSTITUENTS, TECH10 } from '../mocks/tech10'

const meta: Meta<typeof AppShell> = {
  title: 'Shell/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' }
}

export default meta
type Story = StoryObj<typeof AppShell>

/**
 * BU-15 acceptance: shell at the Figma frame geometry (62 / 58 / 32) in both
 * themes. Everything inside the pane is BU-17's job; it is here so the bands
 * have something realistic to frame.
 */
export const Shell: Story = {
  render: function ShellDemo() {
    const [page, setPage] = useState('beacon-view')
    const [tab, setTab] = useState(0)

    return (
      <div style={{ height: 700 }}>
        <AppShell
          sidebar={{ activeId: page, onSelect: setPage }}
          footer={{
            engine: { state: 'connected', version: '0.0.2' },
            dataUpdated: '2h ago',
            version: '0.0.1',
            updateAvailable: true
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <TabBar activeIndex={tab} onNewTab={() => undefined}>
              {['TECH10', 'Weights', 'Attribution'].map((label, index) => (
                <Tab
                  key={label}
                  label={label}
                  active={index === tab}
                  onSelect={() => {
                    setTab(index)
                  }}
                />
              ))}
            </TabBar>

            <PaneHeader
              kind="document"
              title={TECH10.name}
              meta="Beacon US Technology Top 10 · Equity index · USD"
              controls={
                <>
                  <Button chevron>Export</Button>
                  <Button variant="accent">Save</Button>
                </>
              }
            />

            <SummaryLine
              items={[
                { label: 'Constituents', value: String(TECH10.weights.constituents) },
                { label: 'Σ weight', value: TECH10.weights.sum.toFixed(2) },
                { label: 'Capped', value: String(TECH10.weights.capped) },
                { label: 'As of', value: TECH10.asOf }
              ]}
            />

            <Table
              columns={WEIGHTS_COLUMNS}
              rows={CONSTITUENTS}
              getRowId={(row) => row.ticker}
              maxBodyHeight={240}
            />
          </div>
        </AppShell>
      </div>
    )
  }
}

/** The 380px right rail reflows the pane. Real content lands in BU-18. */
export const WithAssistant: Story = {
  render: () => (
    <div style={{ height: 700 }}>
      <AppShell
        sidebar={{ activeId: 'beacon-view' }}
        footer={{ engine: { state: 'connected', version: '0.0.2' } }}
        assistant={
          <div style={{ padding: 16 }}>
            <p className="type-11" style={{ color: 'var(--text-muted)' }}>
              AI Assistant rail — BU-18.
            </p>
          </div>
        }
      >
        <p className="type-11">Pane narrows to make room for the 380px rail.</p>
      </AppShell>
    </div>
  )
}

/** Engine degraded — the footer must say so rather than stay optimistic. */
export const EngineDegraded: Story = {
  render: () => (
    <div style={{ height: 400 }}>
      <AppShell
        sidebar={{ activeId: SIDEBAR_PAGES[0]?.id ?? 'home' }}
        footer={{ engine: { state: 'degraded' }, version: '0.0.1' }}
      >
        <p className="type-11">BU-19 wires this to the real python process.</p>
      </AppShell>
    </div>
  )
}
