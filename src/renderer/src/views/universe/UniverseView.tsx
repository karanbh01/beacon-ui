import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { Table, type Column } from '../../components/Table/Table'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import {
  isUnsupported,
  useCreateUniverse,
  useSaveUniverse,
  useUniverseMembers,
  useUniverses
} from '../shared/strategyQueries'
import { REFERENCE_BATCH_LIMIT, useReferenceBatch } from '../shared/queries'
import { billions, buildRow, fieldsByIdentifier, volume, type UniverseRow } from './universe'
import { blankUniverse, isEditable, type DraftUniverse } from './members'
import { useCandidatePool } from './pool'
import { UniverseEditor } from './UniverseEditor'
import './UniverseView.css'

const COLUMNS: readonly Column<UniverseRow>[] = [
  {
    key: 'position',
    header: '#',
    width: 40,
    align: 'right',
    render: (row) => String(row.position)
  },
  { key: 'ticker', header: 'Ticker', width: 80, emphasis: true, render: (row) => row.ticker },
  { key: 'name', header: 'Name', width: 200, render: (row) => row.name ?? '—' },
  { key: 'sector', header: 'GICS Sector', width: 190, render: (row) => row.sector ?? '—' },
  {
    key: 'cap',
    header: 'FF Mkt Cap ($B)',
    width: 130,
    align: 'right',
    render: (row) => billions(row.marketCap)
  },
  { key: 'adv', header: 'ADV 3M', width: 100, align: 'right', render: (row) => volume(row.adv) }
]

/**
 * Strategy Builder → Universe Set. Figma 234:6348.
 *
 * Every column the frame draws, from one request. This table used to fan out
 * a reference call per name and stop at 60, with a footnote explaining why —
 * `/data/reference` takes a list now (#45).
 *
 * ADV 3M comes back too, and not because of the batching: it is a DERIVED
 * field, returned only when named in `fields`. The endpoint's default is
 * stored columns, so asking for everything would still not have produced it.
 */
export function UniverseView({ tab, subject, pane }: ViewProps): ReactElement {
  const universes = useUniverses()
  const setSubject = useWorkspace((state) => state.setSubject)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const catalogue = universes.data?.universes ?? []
  const selected = subject !== undefined && subject !== '' ? subject : (catalogue[0]?.id ?? '')
  const members = useUniverseMembers(selected)

  const [draft, setDraft] = useState<DraftUniverse | undefined>(undefined)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const create = useCreateUniverse()
  const save = useSaveUniverse()

  // Only while the builder is open: the pool is the whole dataset.
  const pool = useCandidatePool(draft !== undefined)

  const current = catalogue.find((universe) => universe.id === selected)
  const editable = isEditable(current)
  const pending = create.isPending || save.isPending
  const failure = create.error ?? save.error

  /*
   * The two repos ship independently, so an app can meet a server that has
   * the universe views but not BN-132's verbs. That is a sentence, not a raw
   * 404 — see `isUnsupported`.
   */
  const problem = isUnsupported(failure)
    ? 'This engine version does not support creating universes yet.'
    : failure instanceof Error
      ? failure.message
      : undefined

  const startCreate = (): void => {
    setMode('create')
    setDraft(blankUniverse())
  }

  const startEdit = (): void => {
    if (current === undefined) return
    setMode('edit')
    setDraft({
      name: current.name,
      description: current.description ?? '',
      members: [...(members.data?.identifiers ?? [])]
    })
  }

  // The builder resolves filters and manual entries into the membership, so
  // the saved list comes back from it rather than being re-derived here.
  const commit = (resolved: string[]): void => {
    if (draft === undefined) return

    const done = (id: string): void => {
      setDraft(undefined)
      setSubject(tab.id, id)
    }

    if (mode === 'create') {
      create.mutate(
        {
          name: draft.name.trim(),
          description: draft.description.trim() === '' ? null : draft.description.trim(),
          identifiers: resolved
        },
        {
          // 201 carries the created Universe itself, and the server derives
          // its id from the name — so this is the only place it is known.
          onSuccess: (result) => {
            done(result.id)
          }
        }
      )
      return
    }

    save.mutate(
      {
        id: selected,
        name: draft.name.trim(),
        description: draft.description.trim() === '' ? null : draft.description.trim(),
        identifiers: resolved
      },
      {
        onSuccess: () => {
          done(selected)
        }
      }
    )
  }

  const identifiers = useMemo(() => members.data?.identifiers ?? [], [members.data])

  // One request for the whole universe, where this was a useQueries fan-out
  // of one call per name that stopped at 60.
  const reference = useReferenceBatch(identifiers)
  const byIdentifier = useMemo(
    () => fieldsByIdentifier(reference.data?.entries ?? []),
    [reference.data]
  )

  const rows = identifiers.map((identifier, index) =>
    buildRow(identifier, index + 1, byIdentifier.get(identifier), byIdentifier.has(identifier))
  )

  return (
    <div className="universe-view">
      <PaneHeader
        kind="fields"
        controls={
          <>
            <Button onClick={startCreate}>New universe…</Button>
            {/* Seeded universes are the engine's, and it refuses writes to
                them — so the control is absent rather than failing. */}
            {editable && current !== undefined && <Button onClick={startEdit}>Edit</Button>}
            <Button chevron>Export</Button>
          </>
        }
      >
        <Select
          options={catalogue.map((universe) => ({ value: universe.id, label: universe.name }))}
          value={selected}
          placeholder="No universes"
          label="Universe"
          disabled={catalogue.length === 0}
          onChange={(value) => {
            setSubject(tab.id, value)
          }}
        />
      </PaneHeader>

      {draft !== undefined && (
        <UniverseEditor
          draft={draft}
          mode={mode}
          saving={pending}
          pool={pool.candidates}
          loading={pool.loading}
          {...(problem === undefined ? {} : { problem })}
          onChange={setDraft}
          onSave={commit}
          onCancel={() => {
            setDraft(undefined)
            create.reset()
            save.reset()
          }}
        />
      )}

      {draft === undefined && current !== undefined && !editable && (
        <p className="universe-note type-11">
          {current.name} was seeded by the engine, so it cannot be edited or deleted. Create your
          own to change the membership.
        </p>
      )}

      {universes.isPending && <ViewLoading what="universes" />}
      {universes.isError && <ViewError error={universes.error} />}
      {members.isError && <ViewError error={members.error} />}

      {universes.isSuccess && catalogue.length === 0 && draft === undefined && (
        <ViewEmpty>
          This engine has no stored universes.{' '}
          <button type="button" className="universe-link" onClick={startCreate}>
            Create a universe…
          </button>
        </ViewEmpty>
      )}

      {members.isSuccess && identifiers.length === 0 && (
        <ViewEmpty>This universe has no members.</ViewEmpty>
      )}

      {identifiers.length > 0 && (
        <>
          <Table
            columns={COLUMNS}
            rows={rows}
            getRowId={(row) => row.ticker}
            onSelectRow={(row) => {
              openOrRetarget({
                page: 'data-explorer',
                pane,
                viewKind: 'reference-data',
                title: 'Reference Data',
                subject: row.ticker
              })
            }}
            maxBodyHeight={620}
          />
          <p className="universe-footnote type-11">
            {identifiers.length.toLocaleString('en-US')} assets
            {identifiers.length > REFERENCE_BATCH_LIMIT &&
              ` · detail for the first ${REFERENCE_BATCH_LIMIT.toLocaleString('en-US')}, which is py-beacon's cap per call`}{' '}
            · click a row to open Reference Data
          </p>
        </>
      )}
    </div>
  )
}
