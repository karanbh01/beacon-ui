import { Fragment, useState, type ReactElement, type ReactNode } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { Card } from '../../components/Card/Card'
import '../index-definition/Methodology.css'

/** One row: what it is, what it is set to, and its editor when opened. */
export interface SpecRow {
  id: string
  /** The type, or the group of settings, as a badge. */
  badge: string
  /** Its settings in a line, e.g. "Minimum price 5 · Exit 4". */
  summary: string
  /** Drawn under the row while it is open; `close` folds it away. */
  editor: (close: () => void) => ReactNode
  onRemove?: () => void
  onMove?: (delta: -1 | 1) => void
}

export interface SpecGroup {
  key: string
  /** The group's heading, as Index Definition heads its rule groups. */
  label: string
  rows: readonly SpecRow[]
  /** An add slot under the group. `onAdd` answers the new row's id, to open it. */
  add?: { label: string; onAdd: () => string | undefined; blocked?: string }
}

/**
 * A strategy's settings as Index Definition draws its methodology (Karan,
 * 2026-10-19): numbered rows under group headings, each a type and a line
 * of what it is set to, opening an editor under itself. Numbering runs
 * across the whole list, as the methodology's does.
 */
export function SpecRows({
  title,
  groups
}: {
  title: string
  groups: readonly SpecGroup[]
}): ReactElement {
  const [open, setOpen] = useState<string | undefined>(undefined)
  const all = groups.flatMap((group) => group.rows)

  return (
    <Card title={title} flush className="strategy-rows">
      {groups.map((group) => (
        <Fragment key={group.key}>
          <h4 className="methodology-group">{group.label}</h4>
          {group.rows.map((row) => (
            <Fragment key={row.id}>
              <Row
                row={row}
                position={all.indexOf(row) + 1}
                selected={row.id === open}
                onSelect={() => {
                  setOpen(row.id === open ? undefined : row.id)
                }}
              />
              {row.id === open &&
                row.editor(() => {
                  setOpen(undefined)
                })}
            </Fragment>
          ))}
          {group.add !== undefined && (
            <AddSlot
              label={group.add.label}
              indent={44}
              {...(group.add.blocked === undefined ? {} : { blocked: group.add.blocked })}
              onClick={() => {
                setOpen(group.add?.onAdd())
              }}
            />
          )}
        </Fragment>
      ))}
    </Card>
  )
}

function Row({
  row,
  position,
  selected,
  onSelect
}: {
  row: SpecRow
  position: number
  selected: boolean
  onSelect: () => void
}): ReactElement {
  return (
    <div className={selected ? 'methodology-row methodology-selected' : 'methodology-row'}>
      <button type="button" className="methodology-main" aria-pressed={selected} onClick={onSelect}>
        <span className="methodology-index">{String(position).padStart(2, '0')}</span>
        <Badge>{row.badge}</Badge>
        <span className="methodology-summary">{row.summary}</span>
      </button>
      {(row.onMove !== undefined || row.onRemove !== undefined) && (
        <span className="methodology-actions">
          {row.onMove !== undefined && (
            <>
              <Action label={`Move ${row.badge} up`} glyph="↑" onClick={() => row.onMove?.(-1)} />
              <Action label={`Move ${row.badge} down`} glyph="↓" onClick={() => row.onMove?.(1)} />
            </>
          )}
          {row.onRemove !== undefined && (
            <Action label={`Remove ${row.badge}`} glyph="×" onClick={row.onRemove} />
          )}
        </span>
      )}
    </div>
  )
}

function Action({
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
