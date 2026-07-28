import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../Button/Button'
import { Field } from '../Field/Field'
import { PaneHeader } from './PaneHeader'

const meta: Meta<typeof PaneHeader> = {
  title: 'Primitives/PaneHeader',
  component: PaneHeader,
  parameters: { layout: 'padded' }
}

export default meta
type Story = StoryObj<typeof PaneHeader>

const noop = (): void => undefined

/** Demo strip config 1 — Prices. */
export const Query: Story = {
  render: () => (
    <PaneHeader
      kind="query"
      subject="AAPL"
      meta="Apple Inc. · NASDAQ · USD · Common Stock"
      onQuery={noop}
      controls={
        <>
          <Button chevron>Daily</Button>
          <Button chevron>Adjusted</Button>
          <Button chevron>Export</Button>
        </>
      }
    />
  )
}

/** Demo strip config 2 — Charting, linked. Same kind, linked TickerField. */
export const LinkedQuery: Story = {
  render: () => (
    <PaneHeader
      kind="query"
      subject="AAPL"
      linkedTo="Prices"
      meta="Apple Inc. · NASDAQ · USD · Common Stock"
      onQuery={noop}
      controls={
        <>
          <Button chevron>Line</Button>
          <Button chevron>Indicators</Button>
          <Button chevron>Export</Button>
        </>
      }
    />
  )
}

/** Demo strip config 3 — TECH10 index definition, dirty. */
export const Document: Story = {
  render: () => (
    <PaneHeader
      kind="document"
      title="TECH10"
      meta="Beacon US Technology Top 10 · Equity index · USD"
      status="1 unsaved change"
      controls={
        <>
          <Button>Validate</Button>
          <Button>Revert</Button>
          <Button variant="accent">Save</Button>
        </>
      }
    />
  )
}

/** Same document, saved — the status simply drops. */
export const DocumentClean: Story = {
  render: () => (
    <PaneHeader
      kind="document"
      title="TECH10"
      meta="Beacon US Technology Top 10 · Equity index · USD"
      controls={
        <>
          <Button>Validate</Button>
          <Button variant="accent">Save</Button>
        </>
      }
    />
  )
}

/** Demo strip config 4 — Risk Model. */
export const Fields: Story = {
  render: () => (
    <PaneHeader
      kind="fields"
      controls={
        <>
          <Button chevron>Export</Button>
          <Button variant="accent">Re-estimate</Button>
        </>
      }
    >
      <Field label="Risk model" value="BEACON-COV-1Y" chevron />
      <Field label="Estimator" value="Ledoit-Wolf shrinkage" chevron />
      <Field label="Window" value="252 trading days" chevron />
      <Field label="Frequency" value="Daily" chevron />
    </PaneHeader>
  )
}

/** All four configs together, as the Figma demo strip presents them. */
export const DemoStrip: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {(
        [
          ['QUERY · prices', Query],
          ['LINKED QUERY · charting', LinkedQuery],
          ['DOCUMENT · index definition', Document],
          ['FIELDS · risk model', Fields]
        ] as const
      ).map(([caption, Config]) => (
        <div key={caption} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="type-10" style={{ color: 'var(--text-muted)' }}>
            {caption}
          </span>
          {Config.render?.({} as never, {} as never)}
        </div>
      ))}
    </div>
  )
}
