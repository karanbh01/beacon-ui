import type { ReactElement } from 'react'
import { CheckSelect } from '../../../components/CheckSelect/CheckSelect'
import { Field } from '../../../components/Field/Field'
import { useReferenceValues } from '../../shared/queries'
import { readList, written } from './paramValues'

/**
 * Values of one reference column, such as the sectors a screen leaves out
 * (BN-330), ticked from every value the column holds. A value already
 * chosen stays on offer even if the data no longer holds it, so it can be
 * seen and taken off.
 */
export function ReferenceValuesField({
  label,
  column,
  value,
  onChange
}: {
  label: string
  column: string
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const held = useReferenceValues(column)
  const chosen = readList(value)
  const offered = [...new Set([...(held.data?.values ?? []), ...chosen])]

  return (
    <Field label={label} width={240}>
      <CheckSelect
        label={label}
        options={offered}
        value={chosen}
        placeholder={held.isLoading ? 'Loading…' : 'None'}
        disabled={offered.length === 0}
        onChange={(next) => {
          onChange(written(next))
        }}
      />
    </Field>
  )
}
