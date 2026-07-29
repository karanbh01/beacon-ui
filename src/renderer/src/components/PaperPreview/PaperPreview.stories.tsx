import type { Meta, StoryObj } from '@storybook/react'
import { PaperPreview, PaperRow, PaperSection } from './PaperPreview'
import { CONSTITUENTS, TECH10, signedPct } from '../../mocks/tech10'

const meta: Meta<typeof PaperPreview> = {
  title: 'Primitives/PaperPreview',
  component: PaperPreview
}

export default meta
type Story = StoryObj<typeof PaperPreview>

const FOOTER = 'py-beacon 0.4.2 · generated 27 Jul 2026'

/**
 * BU-14 acceptance: a static factsheet that renders identically in both
 * themes. Flip the Storybook theme toolbar — the desk behind the page
 * changes, the page itself does not move a pixel.
 */
export const Factsheet: Story = {
  render: () => (
    <PaperPreview header="Beacon · TECH10 factsheet" footer={FOOTER} page={1} pageCount={4}>
      <h1 className="paper-title">TECH10</h1>
      <p className="paper-subtitle">
        Beacon US Technology Top 10 · Equity index · USD · as of {TECH10.asOf}
      </p>

      <PaperSection title="Performance">
        <div className="paper-chart" />
        <PaperRow label="Index level" value={TECH10.level.toFixed(2)} />
        <PaperRow label="Base" value={`${TECH10.baseDate} = ${TECH10.baseLevel.toFixed(2)}`} />
        <PaperRow label="YTD return" value={signedPct(TECH10.attribution.ytd)} />
        <PaperRow label="Tracking error" value={`${TECH10.risk.trackingError.toFixed(1)}%`} />
      </PaperSection>

      <PaperSection title="Attribution">
        <PaperRow label="Gross" value={signedPct(TECH10.attribution.gross)} />
        <PaperRow label="Cap drag" value={signedPct(TECH10.attribution.capDrag)} />
        <PaperRow label="Costs" value={signedPct(TECH10.attribution.costs)} />
        <PaperRow label="Net YTD" value={signedPct(TECH10.attribution.ytd)} />
      </PaperSection>

      <PaperSection title="Top holdings">
        {CONSTITUENTS.slice(0, 5).map((row) => (
          <PaperRow
            key={row.ticker}
            label={`${row.ticker} · ${row.name}`}
            value={`${row.weight.toFixed(2)}%`}
          />
        ))}
      </PaperSection>

      <p className="paper-note">
        Σ weights = 100.00% · three names capped at 20% until next rebalance · past performance,
        whether actual or simulated, is not indicative of future results.
      </p>
    </PaperPreview>
  )
}

/** Fixed 540:764 ratio at any preview width. */
export const Scaled: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {[260, 360, 540].map((width) => (
        <PaperPreview
          key={width}
          header="TECH10"
          footer={FOOTER}
          page={1}
          pageCount={4}
          width={width}
        >
          <h1 className="paper-title">TECH10</h1>
          <p className="paper-subtitle">Equity index · USD</p>
          <PaperSection title="Performance">
            <div className="paper-chart" />
            <PaperRow label="Index level" value={TECH10.level.toFixed(2)} />
            <PaperRow label="YTD return" value={signedPct(TECH10.attribution.ytd)} />
          </PaperSection>
        </PaperPreview>
      ))}
    </div>
  )
}

/** Page furniture is optional — a preview tile needs neither rule. */
export const Bare: Story = {
  render: () => (
    <PaperPreview width={300}>
      <h1 className="paper-title">TECH10</h1>
      <p className="paper-subtitle">No running header or footer</p>
    </PaperPreview>
  )
}
