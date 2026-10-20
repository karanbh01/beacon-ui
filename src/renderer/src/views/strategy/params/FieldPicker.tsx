import { useMemo, type ReactElement } from 'react'
import { Field } from '../../../components/Field/Field'
import { Select } from '../../../components/Select/Select'
import { useFieldCatalogue } from '../../shared/queries'
import { readField, written } from './paramValues'

/** How each namespace reads in a picker, in the order a signal reaches for them. */
const NAMESPACES: Record<string, string> = {
  features: 'Feature',
  market: 'Market',
  reference: 'Reference',
  actions: 'Corporate action'
}

/** Features and market data first: what a signal usually ranks on. */
function rank(namespace: string): number {
  const at = Object.keys(NAMESPACES).indexOf(namespace)
  return at === -1 ? Object.keys(NAMESPACES).length : at
}

/**
 * A datapoint chosen from what the engine publishes (BN-330), as a field
 * signal ranks on: every field in `/data/fields`, by namespace. The paths
 * are the engine's own spelling, never put together here.
 */
export function FieldPicker({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const catalogue = useFieldCatalogue()
  const fields = useMemo(() => catalogue.data?.fields ?? [], [catalogue.data])
  const chosen = readField(value)
  const path = chosen === undefined ? '' : `${chosen.namespace}.${chosen.name}`

  const options = useMemo(
    () =>
      [...fields]
        .sort((a, b) => rank(a.namespace) - rank(b.namespace))
        .map((field) => ({
          value: `${field.namespace}.${field.name}`,
          label: `${NAMESPACES[field.namespace] ?? field.namespace} · ${field.label}`
        })),
    [fields]
  )

  return (
    <Field label={label} width={280}>
      <Select
        label={label}
        options={options}
        value={path}
        placeholder={catalogue.isLoading ? 'Loading fields…' : 'Choose a field…'}
        onChange={(next) => {
          const field = fields.find((entry) => `${entry.namespace}.${entry.name}` === next)
          if (field === undefined) return
          onChange(
            written({
              node: 'field',
              namespace: field.namespace,
              name: field.name,
              ...(field.dataset == null ? {} : { dataset: field.dataset })
            })
          )
        }}
      />
    </Field>
  )
}
