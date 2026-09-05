import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { useWorkspace } from '../../state/tabs.store'
import { isDocumentId } from '../../api/ids'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import {
  useDeleteIndex,
  useIndices,
  usePreviewDocument,
  useSaveIndex,
  useUniverseMembers,
  useUniverses,
  useValidateIndex
} from '../shared/strategyQueries'
import { IndexDetailsForm } from './IndexDetailsForm'
import { IndexOverview } from './IndexOverview'
import { Methodology } from './Methodology'
import { ValidationCard } from './ValidationCard'
import { useIndexDraft } from './useIndexDraft'
import {
  addCap,
  addRule,
  addTreatment,
  applyRow,
  draftFindings,
  hasWeighting,
  moveRule,
  removeRow,
  type IndexDocument
} from './pipeline'
import './IndexDefinitionView.css'

/**
 * Strategy Builder → Index Definition. Figma 234:6070.
 *
 * The first document view in the app: it holds a draft, tracks dirty on the
 * tab, and has Validate / Revert / Save rather than a query bar.
 */
export function IndexDefinitionView({ tab, subject, pane }: ViewProps): ReactElement {
  const indices = useIndices()
  const deleteIndex = useDeleteIndex()
  const catalogue = indices.data?.indices ?? []

  /*
   * A document tab carries its id in the title — that is how Index Overview
   * and the palette open one, and the tab strip draws the id as the label.
   * The sidebar opens this view with no document at all, and a title of
   * "Index Definition", which is NOT an id: the engine answers a space with
   * 422, and it used to answer 404, which this view reads as "a new index".
   * So the blank editor everyone saw was a 404 being misread.
   *
   * Hence the title is used only when it could actually address a document.
   * With nothing to address, the view shows the CATALOGUE (BU-95) rather
   * than picking an index, which is what Universe Set does.
   */
  /*
   * `opened` is what the overview was clicked into, held locally rather than
   * on the tab: `setSubject` applies only to QUERY tabs, because a document
   * tab's identity is its document (taxonomy 1). This tab is "Index
   * Definition", so what it is currently showing is the pane's business, and
   * the back control is just clearing it.
   */
  const [opened, setOpened] = useState<string | undefined>(undefined)

  const named =
    subject ?? tab.subject ?? tab.pinnedDoc ?? (isDocumentId(tab.title) ? tab.title : undefined)
  const chosen = named ?? opened
  const indexId = chosen ?? ''
  const { draft, saved, dirty, loading, error, edit, revert, commit } = useIndexDraft(
    tab.id,
    indexId
  )

  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [previewedFor, setPreviewedFor] = useState<string | undefined>(undefined)

  const universes = useUniverses()
  const members = useUniverseMembers(draft?.universe.universe_id ?? '')
  const validate = useValidateIndex()
  const preview = usePreviewDocument()
  const save = useSaveIndex()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  // Only the overview needs the catalogue; a tab that names its document
  // must not wait on a list it will never read.
  if (chosen === undefined && indices.isPending) return <ViewLoading what="indices" />
  if (loading) return <ViewLoading what={indexId} />
  if (error !== undefined) return <ViewError error={error} />

  /*
   * No document chosen: the catalogue, and the way to start one (BU-95).
   *
   * This used to be a dead end — "This engine has no stored index
   * definitions", which is true and useless on the tab whose purpose is
   * creating them.
   */
  if (chosen === undefined) {
    return (
      <div className="index-definition-view">
        <IndexOverview
          indices={catalogue}
          onOpen={setOpened}
          onDelete={(index) => {
            /*
             * The confirmation names what goes with it (BU-151).
             *
             * The engine deletes the runs keyed to this id along with the
             * definition, and a backtest somebody waited two minutes for
             * disappearing unannounced is the app failing to say what it was
             * about to do.
             */
            void window.beacon
              ?.confirm({
                title: 'Delete index',
                message: `Delete “${index.name}”?`,
                detail:
                  'The definition and its backtest results are removed from the engine. Universes and market data are untouched.'
              })
              .then((confirmed) => {
                if (confirmed) deleteIndex.mutate(index.id)
              })
          }}
        />
      </div>
    )
  }

  if (draft === undefined) {
    return <ViewEmpty>No index definition named “{indexId}” on this engine.</ViewEmpty>
  }

  const run = (document: IndexDocument): void => {
    validate.mutate(document)
    preview.mutate({ document })
    setPreviewedFor(JSON.stringify(document))
  }

  return (
    <div className="index-definition-view">
      <PaneHeader
        kind="document"
        title={draft.id}
        meta={`${draft.name} · ${draft.currency} · base ${draft.base_date.slice(0, 10)}`}
        {...(saved === undefined
          ? { status: 'new · not saved yet' }
          : dirty
            ? { status: 'unsaved changes' }
            : {})}
        controls={
          <>
            {/*
              The route back to the catalogue, and between indices (BU-103).
              Universe Set has always had this; the index editor only ever had
              the back arrow that #103 removes, so without it there would be
              no way out of a document opened from the overview.
            */}
            {named === undefined && (
              <Select
                label="Index"
                value={indexId}
                options={[
                  { value: '', label: 'All indices' },
                  ...catalogue.map((index) => ({ value: index.id, label: index.name })),
                  // A brand new index is not in the catalogue until it saves,
                  // and a picker showing a value it does not list reads as
                  // broken.
                  ...(catalogue.some((index) => index.id === indexId)
                    ? []
                    : [{ value: indexId, label: `${indexId} · new` }])
                ]}
                onChange={(value) => {
                  setOpened(value === '' ? undefined : value)
                }}
              />
            )}
            <Button
              onClick={() => {
                run(draft)
              }}
              // Neither call can be made with no scheme chosen: the request
              // schema rejects the body before any of it is read (BU-160).
              disabled={validate.isPending || !hasWeighting(draft)}
            >
              Validate
            </Button>
            <Button onClick={revert} disabled={!dirty}>
              Revert
            </Button>
            <Button
              variant="accent"
              disabled={!dirty || save.isPending || !hasWeighting(draft)}
              onClick={() => {
                save.mutate(
                  { document: draft, isNew: saved === undefined },
                  {
                    onSuccess: (result) => {
                      commit(result.index)
                    }
                  }
                )
              }}
            >
              Save
            </Button>
          </>
        }
      />

      {save.isError && <ViewError error={save.error} />}

      <IndexDetailsForm document={draft} onChange={edit} idLocked={saved !== undefined} />

      <section className="index-universe">
        <h3 className="index-section-label">Universe</h3>
        <div className="index-universe-row">
          <Select
            options={(universes.data?.universes ?? []).map((universe) => ({
              value: universe.id,
              label: universe.name
            }))}
            value={draft.universe.universe_id ?? ''}
            placeholder="No universes"
            label="Starting universe"
            disabled={(universes.data?.universes ?? []).length === 0}
            onChange={(value) => {
              edit((current) => ({ ...current, universe: { universe_id: value } }))
            }}
          />
          <span className="index-universe-count type-11">
            {members.data === undefined
              ? 'eligible assets unknown'
              : `${members.data.identifiers.length.toLocaleString('en-US')} eligible assets`}
          </span>
          <button
            type="button"
            className="index-link type-11"
            onClick={() => {
              openOrRetarget({
                page: tab.page,
                pane,
                viewKind: 'universe-set',
                title: 'Universe Set',
                subject: draft.universe.universe_id ?? ''
              })
            }}
          >
            {/* With nothing to choose, the link has to be the way OUT of that
                state rather than a tour of it (BU-78). */}
            {(universes.data?.universes ?? []).length === 0
              ? 'Create a universe… →'
              : 'Open Universe Set →'}
          </button>
        </div>
      </section>

      <div className="index-main-row">
        <Methodology
          document={draft}
          steps={preview.data?.steps ?? []}
          editingId={editingId}
          onSelect={setEditingId}
          onAdd={(group) => {
            /*
             * Each group adds a different thing, and one of them adds nothing
             * yet: a weighting is CHOSEN, so with none there the slot opens
             * the editor and the row appears when a scheme is applied
             * (BU-160).
             */
            if (group === 'weighting' && !hasWeighting(draft)) {
              setEditingId(draft.pipeline.weighting.id)
              return
            }
            if (group === 'weighting') edit(addCap)
            else if (group === 'treatment') edit(addTreatment)
            else edit(addRule)
          }}
          onApply={(rule) => {
            edit((current) => applyRow(current, rule))
            setEditingId(undefined)
          }}
          onRemove={(id) => {
            edit((current) => removeRow(current, id))
            setEditingId(undefined)
          }}
          onMove={(id, delta) => {
            edit((current) => moveRule(current, id, delta))
          }}
        />

        <ValidationCard
          {...(validate.data === undefined ? {} : { report: validate.data })}
          // What this app knows before the engine is asked (BU-160): an
          // unchosen weighting is a 422 from the request schema, not a
          // finding, so it has to be said here.
          own={draftFindings(draft)}
          {...(preview.data === undefined ? {} : { preview: preview.data })}
          dirty={dirty}
          stale={previewedFor !== undefined && previewedFor !== JSON.stringify(draft)}
        />
      </div>

      <button
        type="button"
        className="index-link type-11"
        onClick={() => {
          openOrRetarget({
            page: tab.page,
            pane,
            viewKind: 'constituent-preview',
            title: 'Constituent Preview',
            subject: draft.id
          })
        }}
      >
        Open Constituent Preview →
      </button>
    </div>
  )
}
