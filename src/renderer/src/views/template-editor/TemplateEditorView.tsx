import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Field } from '../../components/Field/Field'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { Select } from '../../components/Select/Select'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError, ViewLoading } from '../shared/ViewState'
import {
  useSaveTemplate,
  useTemplate,
  useTemplates,
  type ReportTemplate
} from '../shared/reportQueries'
import { BlockEditor } from './BlockEditor'
import {
  addBlock,
  describeBlock,
  isDirty,
  kindOf,
  moveBlock,
  pageRows,
  removeBlock,
  replaceBlock
} from './blocks'
import './TemplateEditorView.css'

/**
 * Reports → Template Editor. Figma 234:11076.
 *
 * A document view like Index Definition: a draft, a dirty flag on the tab, and
 * Revert / Save. Blocks are drawn top to bottom, so their order IS the
 * document and reordering is a real edit.
 *
 * `blocks` is a list of free-form objects that each carry a `kind`, and
 * nothing publishes which kinds exist or what fields they take — the same gap
 * as index rules (#43). The block editor is generic for that reason.
 */
export function TemplateEditorView({ tab, subject }: ViewProps): ReactElement {
  const list = useTemplates()
  const stored = list.data?.templates ?? []
  const templateId =
    subject !== undefined && subject !== '' ? subject : (stored[0]?.template_id ?? '')
  const template = useTemplate(templateId)

  const [draft, setDraft] = useState<ReportTemplate | undefined>(undefined)
  const [editing, setEditing] = useState<number | undefined>(undefined)
  const seededFor = useRef<string | undefined>(undefined)

  const save = useSaveTemplate()
  const setSubject = useWorkspace((state) => state.setSubject)
  const setDirtyFlag = useWorkspace((state) => state.setDirty)

  const saved = template.data
  useEffect(() => {
    if (saved === undefined || seededFor.current === templateId) return
    seededFor.current = templateId
    setDraft(saved)
  }, [saved, templateId])

  const dirty = draft !== undefined && isDirty(draft, saved)
  useEffect(() => {
    setDirtyFlag(tab.id, dirty)
  }, [tab.id, dirty, setDirtyFlag])

  const edit = (change: (current: ReportTemplate) => ReportTemplate): void => {
    setDraft((current) => (current === undefined ? current : change(current)))
  }

  return (
    <div className="template-editor-view">
      <PaneHeader
        kind="document"
        title={draft?.template_id ?? templateId}
        {...(draft === undefined
          ? {}
          : { meta: `${draft.name} · ${String((draft.blocks ?? []).length)} blocks` })}
        {...(dirty ? { status: 'unsaved changes' } : {})}
        controls={
          <>
            <Button
              disabled={!dirty}
              onClick={() => {
                setDraft(saved)
              }}
            >
              Revert
            </Button>
            <Button
              variant="accent"
              disabled={!dirty || save.isPending}
              onClick={() => {
                if (draft !== undefined) save.mutate(draft)
              }}
            >
              Save
            </Button>
          </>
        }
      />

      {list.isPending && <ViewLoading what="templates" />}
      {list.isError && <ViewError error={list.error} />}
      {template.isError && <ViewError error={template.error} />}
      {save.isError && <ViewError error={save.error} />}

      {list.isSuccess && stored.length === 0 && (
        <ViewEmpty>
          This engine has no stored templates. Built-in templates are generated from code and cannot
          be edited.
        </ViewEmpty>
      )}

      {stored.length > 0 && (
        <div className="template-picker">
          <Select
            options={stored.map((entry) => ({ value: entry.template_id, label: entry.name }))}
            value={templateId}
            label="Template"
            onChange={(value) => {
              seededFor.current = undefined
              setSubject(tab.id, value)
            }}
          />
        </div>
      )}

      {draft !== undefined && (
        <>
          <section className="template-page-setup">
            <h3 className="template-section-label">Page setup</h3>
            <div className="template-form-row">
              <Field label="Name" width={280}>
                <input
                  className="template-input"
                  aria-label="Name"
                  value={draft.name}
                  onChange={(event) => {
                    const { value } = event.target
                    edit((current) => ({ ...current, name: value }))
                  }}
                />
              </Field>
              {pageRows(draft).map((row) => (
                <Field key={row.key} label={row.key.replace(/_/g, ' ')} width={140}>
                  <input
                    className="template-input"
                    aria-label={row.key}
                    value={row.value}
                    onChange={(event) => {
                      const { value } = event.target
                      edit((current) => ({
                        ...current,
                        page: { ...(current.page ?? {}), [row.key]: value }
                      }))
                    }}
                  />
                </Field>
              ))}
            </div>
          </section>

          <Card title="Blocks" flush className="template-blocks">
            {(draft.blocks ?? []).map((block, index) => (
              <Fragment key={index}>
                <div className={index === editing ? 'template-row is-selected' : 'template-row'}>
                  <button
                    type="button"
                    className="template-main"
                    aria-pressed={index === editing}
                    onClick={() => {
                      setEditing(index === editing ? undefined : index)
                    }}
                  >
                    <span className="template-index">{String(index + 1).padStart(2, '0')}</span>
                    <Badge>{kindOf(block)}</Badge>
                    <span className="template-summary">{describeBlock(block)}</span>
                  </button>
                  <span className="template-actions">
                    <button
                      type="button"
                      className="template-action"
                      aria-label={`Move block ${String(index + 1)} up`}
                      onClick={() => {
                        edit((current) => moveBlock(current, index, -1))
                      }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="template-action"
                      aria-label={`Move block ${String(index + 1)} down`}
                      onClick={() => {
                        edit((current) => moveBlock(current, index, 1))
                      }}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="template-action"
                      aria-label={`Remove block ${String(index + 1)}`}
                      onClick={() => {
                        edit((current) => removeBlock(current, index))
                        setEditing(undefined)
                      }}
                    >
                      ×
                    </button>
                  </span>
                </div>

                {index === editing && (
                  <BlockEditor
                    block={block}
                    onApply={(next) => {
                      edit((current) => replaceBlock(current, index, next))
                      setEditing(undefined)
                    }}
                    onCancel={() => {
                      setEditing(undefined)
                    }}
                  />
                )}
              </Fragment>
            ))}

            <AddSlot
              label="Add block…"
              indent={44}
              onClick={() => {
                edit((current) => addBlock(current))
              }}
            />
          </Card>

          <p className="template-footnote type-11">
            Blocks are drawn top to bottom, so their order is the document · py-beacon publishes no
            catalogue of block kinds or their fields, so the editor is generic — the same gap as
            index rules (#43)
          </p>
        </>
      )}
    </div>
  )
}
