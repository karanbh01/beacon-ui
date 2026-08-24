import { useMemo, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { KV, KVList } from '../../components/KV/KV'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import { useReference } from '../shared/queries'
import { REFERENCE_CARDS, indexFields, readField, unclaimedCount } from './reference'
import './ReferenceView.css'

/**
 * Data Explorer → Reference Data. Figma 234:4680.
 *
 * A 2×2 grid of key/value cards over one reference call. Nothing is derived
 * and nothing is cached beyond the query — the engine is the only authority
 * on what an instrument is.
 */
export function ReferenceView({ tab, subject }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  const query = useReference(identifier)
  const setSubject = useWorkspace((state) => state.setSubject)

  const fields = query.data?.fields
  const index = useMemo(() => indexFields(fields), [fields])
  const extras = useMemo(() => unclaimedCount(fields), [fields])
  const name = readField(index, ['name', 'long_name', 'longname'])

  return (
    <div className="reference-view">
      <PaneHeader
        kind="query"
        tabId={tab.id}
        requires="reference"
        subject={identifier}
        {...(name === '—' ? {} : { meta: name })}
        onQuery={(next) => {
          // The store owns the subject (BU-16).
          setSubject(tab.id, next)
        }}
        controls={<Button chevron>Export</Button>}
      />

      {identifier === '' && <ViewEmpty>Type an identifier to load its reference data.</ViewEmpty>}
      {query.isPending && identifier !== '' && <ViewLoading what={identifier} />}
      {query.isError && <ViewError error={query.error} />}

      {query.isSuccess && (
        <>
          <div className="reference-grid">
            {REFERENCE_CARDS.map((card) => (
              <Card key={card.title} title={card.title} className="reference-card">
                <KVList>
                  {card.rows.map((row) => (
                    <KV key={row.label} label={row.label} value={readField(index, row.keys)} />
                  ))}
                </KVList>
              </Card>
            ))}
          </div>
          <p className="reference-footnote type-11">
            {index.size} field{index.size === 1 ? '' : 's'} returned · source: py-beacon reference
            data
            {extras > 0 && ` · ${String(extras)} not shown on these cards`}
          </p>
        </>
      )}
    </div>
  )
}
