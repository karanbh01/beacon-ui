import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import type { Block } from './blocks'
import './BlockEditor.css'

export interface BlockEditorProps {
  block: Block
  onApply: (block: Block) => void
  onCancel: () => void
}

interface Entry {
  key: string
  value: string
}

function toEntries(block: Block): Entry[] {
  return Object.entries(block)
    .filter(([key]) => key !== 'kind')
    .map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    }))
}

function parse(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

/**
 * The inline editor for one block.
 *
 * Generic for the same reason the index rule editor is: `blocks` is a list of
 * free-form objects and py-beacon publishes no catalogue of kinds or their
 * fields. The constraint editor shows what the alternative looks like when a
 * catalogue exists — see `/optimise/constraint-types` and issue #43.
 */
export function BlockEditor({ block, onApply, onCancel }: BlockEditorProps): ReactElement {
  const [kind, setKind] = useState(typeof block.kind === 'string' ? block.kind : '')
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(block))

  const apply = (): void => {
    const fields = entries
      .filter((entry) => entry.key.trim() !== '')
      .map((entry) => [entry.key.trim(), parse(entry.value)] as const)
    onApply({ kind: kind.trim(), ...Object.fromEntries(fields) })
  }

  const update = (index: number, patch: Partial<Entry>): void => {
    setEntries((current) =>
      current.map((entry, at) => (at === index ? { ...entry, ...patch } : entry))
    )
  }

  return (
    <div className="block-editor">
      <div className="block-editor-fields">
        <Field label="Block kind" width={180}>
          <input
            className="block-editor-input"
            aria-label="Block kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value)
            }}
          />
        </Field>

        {entries.map((entry, index) => (
          <div className="block-editor-pair" key={index}>
            <Field label="Field" width={150}>
              <input
                className="block-editor-input"
                aria-label={`Field ${String(index + 1)} name`}
                value={entry.key}
                onChange={(event) => {
                  update(index, { key: event.target.value })
                }}
              />
            </Field>
            <Field label="Value" width={170}>
              <input
                className="block-editor-input"
                aria-label={`Field ${String(index + 1)} value`}
                value={entry.value}
                onChange={(event) => {
                  update(index, { value: event.target.value })
                }}
              />
            </Field>
          </div>
        ))}
      </div>

      <div className="block-editor-actions">
        <Button variant="accent" onClick={apply}>
          Apply
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          onClick={() => {
            setEntries((current) => [...current, { key: '', value: '' }])
          }}
        >
          Add field
        </Button>
      </div>
    </div>
  )
}
