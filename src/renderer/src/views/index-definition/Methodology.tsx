import { Fragment, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { Card } from '../../components/Card/Card'
import { RuleEditor } from './RuleEditor'
import { MAX_WEIGHT_PARAM } from './ruleCatalogue'
import {
  addSlotFor,
  capId,
  GROUPS,
  hasWeighting,
  pipelineRows,
  weightingAsRule,
  type IndexDocument,
  type GroupId,
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
  /** Which group's slot was used — they do not all add the same thing. */
  onAdd: (group: GroupId) => void
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
  const weighting = props.document.pipeline.weighting

  /*
   * A weighting being CHOSEN is an editor with no row under it (BU-160).
   *
   * "Add weighting…" cannot append a scheme the way "Add rule…" appends a
   * rule, because picking the scheme is the whole of the act — so the slot
   * opens the editor against a weighting that has none yet, and the row
   * appears when it is applied.
   */
  const choosing = props.editingId === weighting.id && !hasWeighting(props.document)

  const editor = (id: string): ReactElement | null => {
    const rule = editedRule(props.document, id)
    if (rule === null) return null

    return (
      <RuleEditor
        rule={rule}
        stage={isWeighting(props.document, id) ? 'weighting' : 'selection'}
        // The cap lives on the weighting spec, so it is edited with it.
        extraParameters={isWeighting(props.document, id) ? [MAX_WEIGHT_PARAM] : []}
        onApply={props.onApply}
        onCancel={() => {
          props.onSelect(undefined)
        }}
      />
    )
  }

  return (
    <Card title="Methodology" flush className="methodology">
      {GROUPS.map((group) => {
        const slot = addSlotFor(group.id, props.document)
        return (
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
                      props.onSelect(
                        !row.editable || row.id === props.editingId ? undefined : row.id
                      )
                    }}
                    onRemove={() => {
                      props.onRemove(row.id)
                    }}
                    onMove={(delta) => {
                      props.onMove(row.id, delta)
                    }}
                  />
                  {row.id === props.editingId && editor(row.id)}
                </Fragment>
              ))}

            {group.id === 'weighting' && choosing && editor(weighting.id)}

            <AddSlot
              label={slot.label}
              indent={44}
              {...(slot.blocked === undefined ? {} : { blocked: slot.blocked })}
              onClick={() => {
                props.onAdd(group.id)
              }}
            />
          </Fragment>
        )
      })}
    </Card>
  )
}

/** True for the weighting row and for the cap, which is edited with it. */
function isWeighting(document: IndexDocument, id: string): boolean {
  const weighting = document.pipeline.weighting
  return id === weighting.id || id === capId(weighting)
}

/** What the editor is editing: a selection rule, or the weighting as one. */
function editedRule(document: IndexDocument, id: string): RuleSpec | null {
  if (isWeighting(document, id)) return weightingAsRule(document.pipeline.weighting)
  return (document.pipeline.selection ?? []).find((rule) => rule.id === id) ?? null
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
 * Every row renders the same shape whatever py-beacon models it as — a rule,
 * the weighting, its cap, the treatment. What differs is what the row lets
 * you do with it: the treatment has one legal value, so it can be taken out
 * but there is nothing to open an editor for.
 */
function MethodologyRow({
  row,
  position,
  selected,
  onSelect,
  onRemove,
  onMove
}: RowProps): ReactElement {
  const classes = [
    'methodology-row',
    selected && 'methodology-selected',
    !row.editable && 'is-fixed'
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <button
        type="button"
        className="methodology-main"
        aria-pressed={selected}
        disabled={!row.editable}
        onClick={onSelect}
      >
        <span className="methodology-index">{String(position).padStart(2, '0')}</span>
        <Badge>{row.type}</Badge>
        <span className="methodology-summary">{row.summary}</span>
        <span className="methodology-outcome">{row.outcome ?? '—'}</span>
      </button>

      {(row.movable || row.removable) && (
        <span className="methodology-actions">
          {row.movable && (
            <>
              <RowAction
                label={`Move ${row.name} up`}
                glyph="↑"
                onClick={() => {
                  onMove(-1)
                }}
              />
              <RowAction
                label={`Move ${row.name} down`}
                glyph="↓"
                onClick={() => {
                  onMove(1)
                }}
              />
            </>
          )}
          {row.removable && <RowAction label={`Remove ${row.name}`} glyph="×" onClick={onRemove} />}
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
