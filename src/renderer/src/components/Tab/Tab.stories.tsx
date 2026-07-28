import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Tab } from './Tab'
import { TabBar } from './TabBar'

const meta: Meta<typeof Tab> = {
  title: 'Primitives/Tab',
  component: Tab,
  args: { label: 'Prices', active: false, dirty: false }
}

export default meta
type Story = StoryObj<typeof Tab>

export const Document: Story = { args: { label: 'TECH10', active: true } }
export const DocumentDirty: Story = { args: { label: 'FACTSHEET-A4', dirty: true } }
export const Pinned: Story = {
  args: { label: 'Frontier', chip: { kind: 'pin', target: 'TECH10' } }
}
export const GlobalTool: Story = { args: { label: 'Data Coverage' } }
export const QueryView: Story = {
  args: { label: 'Prices', chip: { kind: 'query', subject: 'AAPL' } }
}
export const LinkedQueryView: Story = {
  args: { label: 'Charting', chip: { kind: 'query', subject: 'AAPL', linked: true } }
}

/** All six archetypes, matching the Figma demo bar 229:4264. */
export const AllArchetypes: Story = {
  render: () => (
    <TabBar>
      <Tab label="TECH10" active />
      <Tab label="GLOBAL-EQ" dirty />
      <Tab label="Frontier" chip={{ kind: 'pin', target: 'TECH10' }} />
      <Tab label="Data Coverage" />
      <Tab label="Prices" chip={{ kind: 'query', subject: 'AAPL' }} />
      <Tab label="Charting" chip={{ kind: 'query', subject: 'AAPL', linked: true }} />
    </TabBar>
  )
}

/**
 * BU-11 decision: overflow scrolls. Narrow the viewport and the strip
 * scrolls — chips keep their full grammar rather than truncating.
 */
export const Overflow: Story = {
  render: function OverflowDemo() {
    const [active, setActive] = useState(0)
    const tabs = [
      'TECH10',
      'GLOBAL-EQ',
      'Frontier',
      'Data Coverage',
      'Prices',
      'Charting',
      'Weights',
      'Attribution',
      'Drilldown',
      'Comparison',
      'Risk Model',
      'Exposures'
    ]

    return (
      <div style={{ width: 520, border: '1px dashed var(--divider)' }}>
        <TabBar activeIndex={active} onNewTab={() => undefined}>
          {tabs.map((label, index) => (
            <Tab
              key={label}
              label={label}
              active={index === active}
              onSelect={() => {
                setActive(index)
              }}
              onClose={() => undefined}
            />
          ))}
        </TabBar>
        <p className="type-11" style={{ color: 'var(--text-muted)', padding: '10px 0 0' }}>
          Selecting a tab off-screen scrolls it into view.
        </p>
      </div>
    )
  }
}

/** Close is hover-revealed, so a full bar is not a row of competing crosses. */
export const Closable: Story = {
  render: () => (
    <TabBar onNewTab={() => undefined}>
      <Tab
        label="Prices"
        chip={{ kind: 'query', subject: 'AAPL' }}
        active
        onClose={() => undefined}
      />
      <Tab
        label="Charting"
        chip={{ kind: 'query', subject: 'AAPL', linked: true }}
        onClose={() => undefined}
      />
      <Tab label="Data Coverage" />
    </TabBar>
  )
}
