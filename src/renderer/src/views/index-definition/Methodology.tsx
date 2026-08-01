import { Fragment, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { Card } from '../../components/Card/Card'
import { RuleEditor } from './RuleEditor'
import {
  GROUPS,
  pipelineRows,
  type IndexDocument,
  type PipelineRow,
  type PreviewStep,
  type RuleSpec
} from './pipeline'
import './Methodology.css'

export interface MethodologyProps {
  document: IndexDocument
  steps: readonly PreviewStep[]
  /** Rule whose editor is open, if any. */
  editingId: string | undefined
  onSelect: (id: string | undefined) => void
  onAdd: () => void
  onApply: (rule: RuleSpec) => void
  onRemove: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
}

/**
 * Figma 322:1553. The pipeline as a numbered, grouped list.
 *
 * Numbering runs across the whole pipeline rather than restarting per group,
 * because that is what the rule ids in a validation finding refer to — a
 * finding pointing at "rule 06" has to be findable without counting groups.
 */
export function Methodology(props: MethodologyProps): ReactElement {
  const rows = pipelineRows(props.document, props.steps)
  const selection = props.document.pipeline.selection ?? []

  return (
    <Card title="Methodology" flush className="methodology">
      {GROUPS.map((group) => (
        <Fragment key={group.id}>
          <h4 className="methodology-group">{group.label}</h4>
          {rows
            .filter((row) => row.group === group.id)
            .map((row) => (
              <Fragment key={row.id}>
                <MethodologyRow
                  row={row}
                  position={rows.indexOf(row) + 1}
                  selected={row.id === props.editingId}
                  onSelect={() => {
                    props.onSelect(row.fixed || row.id === props.editingId ? undefined : row.id)
                  }}
                  onRemove={() => {
                    props.onRemove(row.id)
                  }}
                  onMove={(delta) => {
                    props.onMove(row.id, delta)
                  }}
                />
                {row.id === props.editingId && (
                  <RuleEditorFor
                    rules={selection}
                    id={row.id}
                    onApply={props.onApply}
                    onCancel={() => {
                      props.onSelect(undefined)
                    }}
                  />
                )}
              </Fragment>
            ))}
          {group.addable && <AddSlot label="Add rule…" indent={44} onClick={props.onAdd} />}
        </Fragment>
      ))}
    </Card>
  )
}

function RuleEditorFor({
  rules,
  id,
  onApply,
  onCancel
}: {
  rules: readonly RuleSpec[]
  id: string
  onApply: (rule: RuleSpec) => void
  onCancel: () => void
}): ReactElement | null {
  const rule = rules.find((candidate) => candidate.id === id)
  if (rule === undefined) return null
  return <RuleEditor rule={rule} onApply={onApply} onCancel={onCancel} />
}

interface RowProps {
  row: PipelineRow
  position: number
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
}

/**
 * Selection is a full-row wash, never a chip or a border (taxonomy 5).
 *
 * Fixed rows still render the same shape — py-beacon models weighting and
 * treatment as fields rather than rules, and hiding them would make the
 * methodology look shorter than the index actually is.
 */
function MethodologyRow({
  row,
  position,
  selected,
  onSelect,
  onRemove,
  onMove
}: RowProps): ReactElement {
  const classes = ['methodology-row', selected && 'methodology-selected', row.fixed && 'is-fixed']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <button
        type="button"
        className="methodology-main"
        aria-pressed={selected}
        disabled={row.fixed}
        onClick={onSelect}
      >
        <span className="methodology-index">{String(position).padStart(2, '0')}</span>
        <Badge>{row.type}</Badge>
        <span className="methodology-summary">{row.summary}</span>
        <span className="methodology-outcome">{row.outcome ?? '—'}</span>
      </button>

      {!row.fixed && (
        <span className="methodology-actions">
          <RowAction
            label={`Move ${row.id} up`}
            glyph="↑"
            onClick={() => {
              onMove(-1)
            }}
          />
          <RowAction
            label={`Move ${row.id} down`}
            glyph="↓"
            onClick={() => {
              onMove(1)
            }}
          />
          <RowAction label={`Remove ${row.id}`} glyph="×" onClick={onRemove} />
        </span>
      )}
    </div>
  )
}

function RowAction({
  label,
  glyph,
  onClick
}: {
  label: string
  glyph: string
  onClick: () => void
}): ReactElement {
  return (
    <button type="button" className="methodology-action" aria-label={label} onClick={onClick}>
      {glyph}
    </button>
  )
}
