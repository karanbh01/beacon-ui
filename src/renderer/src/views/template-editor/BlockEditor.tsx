import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { BLOCK_KINDS, isBlockKind, type Block, type BlockKind } from './blocks'
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
 * The KIND is chosen from the engine's published set (BU-212). It was a
 * free-text field while nothing said which kinds existed, and the default a
 * new block got — `TextBlock` — was a name the engine never accepted. A
 * closed set typed into an open field is the guess this editor was built on.
 *
 * The FIELDS are still generic, for the reason they always were: py-beacon
 * publishes which kinds exist but not what each one takes. The constraint
 * editor shows what the alternative looks like when a field catalogue exists
 * — see `/optimise/constraint-types` and issue #43.
 */
export function BlockEditor({ block, onApply, onCancel }: BlockEditorProps): ReactElement {
  const [kind, setKind] = useState<BlockKind>(block.kind)
  const [entries, setEntries] = useState<Entry[]>(() => toEntries(block))

  const apply = (): void => {
    const fields = entries
      .filter((entry) => entry.key.trim() !== '')
      .map((entry) => [entry.key.trim(), parse(entry.value)] as const)
    // Kind last, so a field someone typed in called "kind" cannot replace it.
    onApply({ ...Object.fromEntries(fields), kind })
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
          <Select
            label="Block kind"
            value={kind}
            onChange={(next) => {
              if (isBlockKind(next)) setKind(next)
            }}
            options={Object.entries(BLOCK_KINDS).map(([value, label]) => ({ value, label }))}
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
