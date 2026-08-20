import { useMemo, useState, type ReactElement } from 'react'
import { AddValue } from '../../components/AddValue/AddValue'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { Table, type Column } from '../../components/Table/Table'
import {
  checkManual,
  combine,
  filtersFor,
  runRows,
  type Candidate,
  type FilterRow
} from './builder'
import { addMember, draftProblem, parseMembers, removeMember, type DraftUniverse } from './members'
import { billions, buildRow, volume, type UniverseRow } from './universe'
import { FilterRows } from './FilterRows'
import './UniverseEditor.css'

export interface UniverseEditorProps {
  draft: DraftUniverse
  onChange: (next: DraftUniverse) => void
  /**
   * Carries the resolved membership — filters plus manual, deduped. The view
   * cannot recompute it: the filter state lives here, and having two places
   * derive "what gets saved" is how they come to disagree.
   */
  onSave: (members: string[]) => void
  onCancel: () => void
  /** Disabled while the request is in flight. */
  saving?: boolean
  /** Whatever the engine said, rendered inline rather than as a raw error. */
  problem?: string | undefined
  /** "Create" vs "Save" — the same form serves both. */
  mode: 'create' | 'edit'
  /**
   * Every name in the loaded dataset, with its reference fields. The filters
   * are derived from these, and manual entries are checked against them.
   */
  pool: readonly Candidate[]
  /** True while the pool is still arriving; filters cannot be built yet. */
  loading?: boolean
}

const COLUMNS: readonly Column<UniverseRow>[] = [
  {
    key: 'position',
    header: '#',
    width: 40,
    align: 'right',
    render: (row) => String(row.position)
  },
  { key: 'ticker', header: 'Ticker', width: 90, emphasis: true, render: (row) => row.ticker },
  { key: 'name', header: 'Name', width: 190, render: (row) => row.name ?? '—' },
  { key: 'sector', header: 'Sector', width: 170, render: (row) => row.sector ?? '—' },
  {
    key: 'cap',
    header: 'FF Mkt Cap ($B)',
    width: 120,
    align: 'right',
    render: (row) => billions(row.marketCap)
  },
  { key: 'adv', header: 'ADV 3M', width: 100, align: 'right', render: (row) => volume(row.adv) }
]

/**
 * Build a universe the way an index is built (BU-85).
 *
 * Filters over the loaded dataset, a table of what they matched, and manual
 * entry on top — with the members visible before anything is saved. The chip
 * row this replaced could say a universe had forty names and nothing about
 * what any of them were.
 *
 * Manual entries are CHECKED against the dataset as they are typed. The
 * engine refuses a member it does not hold, and discovering that at save
 * time, for one name out of forty, is no use.
 */
export function UniverseEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  saving = false,
  problem,
  mode,
  pool,
  loading = false
}: UniverseEditorProps): ReactElement {
  const [paste, setPaste] = useState('')
  const [rows, setRows] = useState<FilterRow[]>([])

  const specs = useMemo(() => filtersFor(pool), [pool])
  const known = useMemo(() => new Set(pool.map((candidate) => candidate.identifier)), [pool])

  // No complete row contributes nothing rather than everything: the builder
  // adds to a membership, it does not whittle the dataset down.
  const run = useMemo(() => runRows(pool, rows, specs), [pool, rows, specs])
  const matched = run.matched
  const manual = useMemo(() => checkManual(draft.members, known), [draft.members, known])

  // What will actually be saved: the filtered set plus anything added by hand.
  const members = useMemo(() => combine(matched, draft.members), [matched, draft.members])

  const byIdentifier = useMemo(
    () => new Map(pool.map((candidate) => [candidate.identifier, candidate.fields])),
    [pool]
  )
  const tableRows = members.map((identifier, index) =>
    buildRow(identifier, index + 1, byIdentifier.get(identifier), byIdentifier.has(identifier))
  )

  const applyPaste = (): void => {
    const parsed = parseMembers(paste)
    if (parsed.length === 0) return
    onChange({ ...draft, members: parsed.reduce(addMember, draft.members) })
    setPaste('')
  }

  // The engine's rule is about the SAVED set, which includes the filtered
  // names — a draft with no hand-added members is still valid if a filter
  // matched something.
  const blocked = draftProblem({ ...draft, members })

  return (
    <Card
      title={mode === 'create' ? 'New universe' : 'Edit universe'}
      className="universe-editor"
      aside={
        <span className="universe-editor-count type-11">
          {members.length.toLocaleString('en-US')} member{members.length === 1 ? '' : 's'}
          {matched.length > 0 && ` · ${matched.length.toLocaleString('en-US')} from filters`}
        </span>
      }
    >
      <div className="universe-editor-fields">
        <Field label="Name" width={220}>
          <input
            className="universe-editor-input"
            value={draft.name}
            maxLength={64}
            aria-label="Universe name"
            onChange={(event) => {
              onChange({ ...draft, name: event.target.value })
            }}
          />
        </Field>
        <Field label="Description" width={380}>
          <input
            className="universe-editor-input"
            value={draft.description}
            aria-label="Universe description"
            onChange={(event) => {
              onChange({ ...draft, description: event.target.value })
            }}
          />
        </Field>
      </div>

      {loading && <p className="universe-editor-note type-11">Loading the dataset to filter on…</p>}

      {/* No seeded universe means no dataset to filter over — BN-132 seeds it
          at engine startup, so an engine that predates it lands here. */}
      {!loading && pool.length === 0 && (
        <p className="universe-editor-note type-11">
          This engine has no seeded universe to filter over, so members can only be added by hand.
        </p>
      )}

      {!loading && pool.length > 0 && (
        <FilterRows specs={specs} rows={rows} remaining={run.remaining} onChange={setRows} />
      )}

      <div className="universe-editor-manual">
        <AddValue
          label="Add symbol…"
          onAdd={(value) => {
            onChange({ ...draft, members: addMember(draft.members, value) })
          }}
        />
        <textarea
          className="universe-editor-textarea"
          value={paste}
          rows={2}
          aria-label="Paste identifiers"
          placeholder="Paste a list — commas, spaces or one per line"
          onChange={(event) => {
            setPaste(event.target.value)
          }}
        />
        <Button onClick={applyPaste} disabled={paste.trim() === ''}>
          Add pasted
        </Button>
      </div>

      {/*
        The answer to "I cannot confirm the ticker is validated". Both halves
        are stated: what was accepted, and what the dataset does not carry.
      */}
      {pool.length > 0 && draft.members.length > 0 && (
        <p className="universe-editor-manual-state type-11">
          {manual.found.length > 0 && (
            <span className="universe-ok">
              {manual.found.length} added by hand, found in the dataset
            </span>
          )}
          {manual.unknown.length > 0 && (
            <span className="universe-bad">
              {manual.found.length > 0 ? ' · ' : ''}
              not in the dataset: {manual.unknown.join(', ')}
              <button
                type="button"
                className="universe-link"
                onClick={() => {
                  onChange({
                    ...draft,
                    members: manual.unknown.reduce(removeMember, draft.members)
                  })
                }}
              >
                remove them
              </button>
            </span>
          )}
        </p>
      )}

      {tableRows.length > 0 && (
        <div className="universe-editor-preview">
          <Table
            columns={COLUMNS}
            rows={tableRows}
            getRowId={(row) => row.ticker}
            maxBodyHeight={320}
          />
        </div>
      )}

      {/* The engine's own words when it refused, ours when it would. */}
      {(problem ?? blocked) !== undefined && (
        <p className="universe-editor-problem type-11">{problem ?? blocked}</p>
      )}

      <div className="universe-editor-actions">
        <Button
          variant="accent"
          onClick={() => {
            onSave(members)
          }}
          disabled={saving || blocked !== undefined}
        >
          {mode === 'create' ? 'Create universe' : 'Save changes'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}
