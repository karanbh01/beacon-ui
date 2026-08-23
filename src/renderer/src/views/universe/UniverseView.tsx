import { useMemo, useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
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
import { useCoverage, useReferenceRows } from '../shared/queries'
import { billions, buildRow, volume, type UniverseRow } from './universe'
import { blankUniverse, isEditable, type DraftUniverse } from './members'
import { useCandidatePool } from './pool'
import { UniverseEditor } from './UniverseEditor'
import { UniverseOverview, type UniverseSummary } from './UniverseOverview'
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

  // Memoised because the point-in-time counts key off it: `?? []` is a fresh
  // array every render, which would rebuild the identifier list each time and
  // re-key the reference queries.
  const catalogue = useMemo(() => universes.data?.universes ?? [], [universes.data])

  /*
   * No subject means the OVERVIEW, not the first universe (BU-93).
   *
   * This used to fall back to `catalogue[0]`, which on any real engine is the
   * seeded GLOBAL — so opening the tab dropped you into five thousand rows of
   * somebody else's universe, and nothing anywhere answered "what universes
   * do I have?".
   */
  const selected = subject ?? ''
  const members = useUniverseMembers(selected)

  /**
   * Point in time, empty for today (BU-92).
   *
   * Empty is the default and has to stay so: a date field that starts filled
   * makes every reader check whether they are looking at live data.
   */
  const [asOf, setAsOf] = useState('')

  const [draft, setDraft] = useState<DraftUniverse | undefined>(undefined)
  const [mode, setMode] = useState<'create' | 'edit'>('create')
  const create = useCreateUniverse()
  const save = useSaveUniverse()

  // Only while the builder is open: the pool is the whole dataset.
  const pool = useCandidatePool(draft !== undefined, asOf)

  const coverage = useCoverage()

  /**
   * The latest date the data reaches, which is what "as of today" means here.
   *
   * Market rather than reference: reference is a static frame with no end, so
   * the last date anything is actually known for is the market series'.
   */
  const dataAsOf = coverage.data?.datasets
    .find((set) => set.dataset === 'market')
    ?.end?.slice(0, 10)

  /*
   * The overview's counts are point-in-time, so they need reference data for
   * every name in every universe. Fetched only while the overview is on
   * screen — that is thousands of rows, and a user reading one universe's
   * table has no use for it.
   */
  const overviewing = draft === undefined && selected === ''
  const everyMember = useMemo(
    () => (overviewing ? catalogue.flatMap((universe) => universe.identifiers ?? []) : []),
    [overviewing, catalogue]
  )
  const validity = useReferenceRows(everyMember, undefined, overviewing ? (dataAsOf ?? '') : '')

  const summaries: UniverseSummary[] = catalogue.map((universe) => ({
    id: universe.id,
    name: universe.name,
    // Members still listed on the as-of date. Undefined while that is still
    // arriving: showing the stored length first would have the number tick
    // down as the real answer lands, which reads as wrong rather than
    // provisional.
    constituents:
      validity.loading || dataAsOf === undefined
        ? undefined
        : (universe.identifiers ?? []).filter((identifier) => validity.byIdentifier.has(identifier))
            .length,
    source: universe.source
  }))

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

  const stored = useMemo(() => members.data?.identifiers ?? [], [members.data])

  /*
   * Every member, however many there are (BU-94).
   *
   * This asked in one call and took the first 1,000, which drew the surplus
   * with dashes — harmless until BU-92 started DROPPING rows the engine had
   * not confirmed, at which point the truncation was deciding the count. A
   * 5,000-name universe reported 757 where the answer was 3,849.
   */
  const reference = useReferenceRows(stored, undefined, asOf)
  const byIdentifier = reference.byIdentifier

  /*
   * Under an as-of date the membership is the names LISTED THEN.
   *
   * The stored document is a fixed list that outlives its members, and the
   * engine answers `found: false` for a row that was not valid on the date.
   * Showing those as blank rows would say "we have no data for this" where
   * the truth is "this was not a listed instrument yet" — so they come out.
   *
   * With no date this must not change anything: `found: false` then means the
   * engine simply has no reference row, which is a fact worth drawing as a
   * row of dashes.
   */
  const identifiers = useMemo(
    () => (asOf === '' ? stored : stored.filter((identifier) => byIdentifier.has(identifier))),
    [asOf, stored, byIdentifier]
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
            {/* A query tab, so the subject IS where it is — clearing it is
                the way back to the list (BU-96). */}
            {selected !== '' && (
              <Button
                onClick={() => {
                  setSubject(tab.id, '')
                }}
              >
                ← All universes
              </Button>
            )}
            <Button onClick={startCreate}>New universe…</Button>
            {/* Seeded universes are the engine's, and it refuses writes to
                them — so the control is absent rather than failing. */}
            {editable && current !== undefined && <Button onClick={startEdit}>Edit</Button>}
            <Button chevron>Export</Button>
          </>
        }
      >
        <Select
          options={[
            { value: '', label: 'All universes' },
            ...catalogue.map((universe) => ({ value: universe.id, label: universe.name }))
          ]}
          value={selected}
          placeholder="No universes"
          label="Universe"
          disabled={catalogue.length === 0}
          onChange={(value) => {
            setSubject(tab.id, value)
          }}
        />
        {/* Point-in-time belongs to a universe's membership; on the overview
            there is none to date, and a control that does nothing is worse
            than an absent one. */}
        {selected !== '' && (
          <Field label="As of" width={130}>
            <input
              className="universe-input"
              type="date"
              aria-label="As of"
              value={asOf}
              onChange={(event) => {
                setAsOf(event.target.value)
              }}
            />
          </Field>
        )}
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

      {/* No universe chosen: what exists, rather than one picked for you. */}
      {draft === undefined && selected === '' && catalogue.length > 0 && (
        <UniverseOverview
          universes={summaries}
          asOf={dataAsOf}
          onOpen={(id) => {
            setSubject(tab.id, id)
          }}
        />
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

      {members.isSuccess && stored.length === 0 && (
        <ViewEmpty>This universe has no members.</ViewEmpty>
      )}

      {/* Emptied by the date rather than empty — a different sentence. */}
      {stored.length > 0 && identifiers.length === 0 && !reference.loading && (
        <ViewEmpty>
          None of this universe’s {stored.length.toLocaleString('en-US')} members were listed on{' '}
          {asOf}.
        </ViewEmpty>
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
            {asOf !== '' && ` as of ${asOf}`}
            {asOf !== '' &&
              identifiers.length < stored.length &&
              ` · ${(stored.length - identifiers.length).toLocaleString('en-US')} of the stored ${stored.length.toLocaleString('en-US')} were not listed then`}{' '}
            · click a row to open Reference Data
          </p>
        </>
      )}
    </div>
  )
}
