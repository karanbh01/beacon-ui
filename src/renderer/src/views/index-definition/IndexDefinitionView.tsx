import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import {
  usePreviewDocument,
  useSaveIndex,
  useUniverseMembers,
  useUniverses,
  useValidateIndex
} from '../shared/strategyQueries'
import { IndexDetailsForm } from './IndexDetailsForm'
import { Methodology } from './Methodology'
import { ValidationCard } from './ValidationCard'
import { useIndexDraft } from './useIndexDraft'
import { addRule, moveRule, removeRule, replaceRule, type IndexDocument } from './pipeline'
import './IndexDefinitionView.css'

/**
 * Strategy Builder → Index Definition. Figma 234:6070.
 *
 * The first document view in the app: it holds a draft, tracks dirty on the
 * tab, and has Validate / Revert / Save rather than a query bar.
 */
export function IndexDefinitionView({ tab }: ViewProps): ReactElement {
  const indexId = tab.title
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

  if (loading) return <ViewLoading what={indexId} />
  if (error !== undefined) return <ViewError error={error} />
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
            <Button
              onClick={() => {
                run(draft)
              }}
              disabled={validate.isPending}
            >
              Validate
            </Button>
            <Button onClick={revert} disabled={!dirty}>
              Revert
            </Button>
            <Button
              variant="accent"
              disabled={!dirty || save.isPending}
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
                viewKind: 'universe-set',
                title: 'Universe Set',
                subject: draft.universe.universe_id ?? ''
              })
            }}
          >
            Open Universe Set →
          </button>
        </div>
      </section>

      <div className="index-main-row">
        <Methodology
          document={draft}
          steps={preview.data?.steps ?? []}
          editingId={editingId}
          onSelect={setEditingId}
          onAdd={() => {
            edit(addRule)
          }}
          onApply={(rule) => {
            edit((current) => replaceRule(current, rule))
            setEditingId(undefined)
          }}
          onRemove={(id) => {
            edit((current) => removeRule(current, id))
            setEditingId(undefined)
          }}
          onMove={(id, delta) => {
            edit((current) => moveRule(current, id, delta))
          }}
        />

        <ValidationCard
          {...(validate.data === undefined ? {} : { report: validate.data })}
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
