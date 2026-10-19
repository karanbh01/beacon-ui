import type { TypeSpec } from '../index-definition/ruleCatalogue'
import { TypedEditor } from './SpecEditors'
import type { SpecGroup, SpecRow } from './SpecRows'
import { labelOf, summariseSpec } from './specSummary'
import type { TypedSpec } from './strategyDraft'

/** A list of typed specs as rows: each edits, moves and goes on its own. */
export function listRows(
  prefix: string,
  label: string,
  catalogue: readonly TypeSpec[],
  specs: readonly TypedSpec[],
  onChange: (next: TypedSpec[]) => void
): SpecRow[] {
  return specs.map((spec, at) => ({
    id: `${prefix}-${String(at)}`,
    badge: labelOf(catalogue, spec.type),
    summary: summariseSpec(catalogue, spec),
    editor: (close) => (
      <TypedEditor
        label={label}
        catalogue={catalogue}
        spec={spec}
        onApply={(next) => {
          onChange(specs.map((entry, index) => (index === at ? next : entry)))
          close()
        }}
        onCancel={close}
      />
    ),
    onRemove: () => {
      onChange(specs.filter((_, index) => index !== at))
    },
    onMove: (delta) => {
      onChange(moved(specs, at, delta))
    }
  }))
}

/** An add slot that appends the catalogue's first type and opens it to choose. */
export function addTo(
  label: string,
  prefix: string,
  catalogue: readonly TypeSpec[],
  specs: readonly TypedSpec[],
  onChange: (next: TypedSpec[]) => void
): NonNullable<SpecGroup['add']> {
  const first = catalogue[0]
  return {
    label,
    ...(first === undefined ? { blocked: 'This engine lists none.' } : {}),
    onAdd: () => {
      if (first === undefined) return undefined
      onChange([...specs, { type: first.name, params: {} }])
      return `${prefix}-${String(specs.length)}`
    }
  }
}

function moved<T>(items: readonly T[], at: number, delta: -1 | 1): T[] {
  const to = at + delta
  if (to < 0 || to >= items.length) return [...items]
  const next = [...items]
  const [item] = next.splice(at, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}
