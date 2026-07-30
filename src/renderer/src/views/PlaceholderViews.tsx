import type { ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { PaneHeader } from '../components/PaneHeader/PaneHeader'
import { SummaryLine } from '../components/SummaryLine/SummaryLine'
import { Table } from '../components/Table/Table'
import { WEIGHTS_COLUMNS } from '../components/Table/weightsColumns'
import { Card } from '../components/Card/Card'
import { KV, KVList } from '../components/KV/KV'
import { CONSTITUENTS, TECH10, signedPct } from '../mocks/tech10'
import type { ViewProps } from '../shell/viewRegistry'
import './placeholders.css'

/**
 * Stand-in views so the shell is navigable before the real ones land.
 *
 * Everything here renders M0 primitives against the sanctioned mock dataset.
 * None of it talks to py-beacon — live views start at BU-22, and each will
 * replace its placeholder by re-registering the same viewKind.
 */

export function WeightsView({ subject }: ViewProps): ReactElement {
  return (
    <div className="view-stack">
      <PaneHeader
        kind="document"
        title={subject ?? TECH10.name}
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
          { label: '10 constituents', value: `Σ ${TECH10.weights.sum.toFixed(2)}%` },
          { label: 'top-5 weight', value: `${TECH10.weights.top5.toFixed(1)}%` },
          { label: 'HHI', value: TECH10.weights.hhi.toFixed(3) },
          { label: 'effective N', value: TECH10.weights.effectiveN.toFixed(1) },
          { label: 'capped at 20%', value: String(TECH10.weights.capped) }
        ]}
      />
      <Table
        columns={WEIGHTS_COLUMNS}
        rows={CONSTITUENTS}
        getRowId={(row) => row.ticker}
        totalRow={{ ticker: 'Total', weight: '100.00%', delta: '0.00' }}
      />
      <p className="view-note type-11">
        Σ weights = 100.00% · capped names pinned at 20% until next rebalance · effective N = 1 /
        HHI
      </p>
    </div>
  )
}

export function OverviewView({ subject }: ViewProps): ReactElement {
  return (
    <div className="view-stack">
      <PaneHeader
        kind="document"
        title={subject ?? TECH10.name}
        meta="Index overview"
        controls={<Button chevron>Export</Button>}
      />
      <Card title="Key facts">
        <KVList>
          <KV label="Base date" value={TECH10.baseDate} />
          <KV label="Base level" value={TECH10.baseLevel.toFixed(2)} />
          <KV label="Current level" value={TECH10.level.toFixed(2)} />
          <KV label="YTD" value={signedPct(TECH10.attribution.ytd)} tone="positive" />
          <KV label="Cap drag" value={signedPct(TECH10.attribution.capDrag)} tone="negative" />
          <KV label="Tracking error" value={`${TECH10.risk.trackingError.toFixed(1)}%`} />
        </KVList>
      </Card>
    </div>
  )
}

export function PricesView({ tab, subject }: ViewProps): ReactElement {
  return (
    <div className="view-stack">
      <PaneHeader
        kind="query"
        subject={subject ?? ''}
        meta="Live prices land in BU-22"
        onQuery={() => undefined}
        controls={
          <>
            <Button chevron>Daily</Button>
            <Button chevron>Adjusted</Button>
          </>
        }
      />
      <Pending viewKind={tab.viewKind} issue="BU-22" />
    </div>
  )
}

export function Pending({ viewKind, issue }: { viewKind: string; issue: string }): ReactElement {
  return (
    <Card title="Not built yet">
      <p className="type-11 view-note">
        <code>{viewKind}</code> is a placeholder. The real view arrives in {issue}, once the python
        bridge (BU-19 – BU-21) can supply data.
      </p>
    </Card>
  )
}

export function GenericView({ tab }: ViewProps): ReactElement {
  return (
    <div className="view-stack">
      <PaneHeader kind="document" title={tab.title} meta={tab.viewKind} />
      <Pending viewKind={tab.viewKind} issue="a later milestone" />
    </div>
  )
}
