import { useMemo } from 'react'
import type { components } from '@shared/api.generated'
import type { Column } from '../../components/Table/Table'
import { useTableColumns } from '../../state/holdingColumns'
import { useFieldCatalogue } from './queries'

type FieldDescriptor = components['schemas']['FieldDescriptor']

/** A reference column a table can show: the engine's name and its label. */
export interface ReferenceColumn {
  key: string
  label: string
}

/** A row's reference columns as the engine sends them, keyed in lower case. */
export type ReferenceValues = Readonly<Record<string, unknown>> | null | undefined

/*
 * Bookkeeping, not a description of the holding: when the reference row
 * was valid. Not offered as a column.
 */
const NOT_OFFERED = new Set(['date_from', 'date_to'])

/**
 * The reference columns a chooser offers: the stored ones the loaded data
 * carries, labelled as the engine labels them (py-beacon 0.9.2, BN-325).
 * Derived fields (market cap, ADV) are left out: `reference_fields` takes
 * stored columns.
 */
export function referenceChoices(fields: readonly FieldDescriptor[]): ReferenceColumn[] {
  return fields
    .filter((field) => field.namespace === 'reference' && !field.derived)
    .filter((field) => !NOT_OFFERED.has(field.name.toLowerCase()))
    .map((field) => ({ key: field.name.toLowerCase(), label: labelOf(field) }))
}

/**
 * What a table asks the engine for and how it heads the columns: the
 * table's own choice or the default, labelled from the engine's catalogue.
 */
export function useReferenceColumns(table: string): {
  fields: readonly string[]
  columns: ReferenceColumn[]
} {
  const fields = useTableColumns(table)
  const catalogue = useFieldCatalogue()
  const columns = useMemo(() => {
    const labels = new Map(
      referenceChoices(catalogue.data?.fields ?? []).map((choice) => [choice.key, choice.label])
    )
    return fields.map((key) => ({ key, label: labels.get(key) ?? inWords(key) }))
  }, [fields, catalogue.data])
  return { fields, columns }
}

/**
 * Ticker, then the chosen reference columns, wherever a table lists
 * tickers (Karan, 2026-10-19). Text, so left-aligned, header and values
 * alike; the values are the engine's, as of the row's own date.
 */
export function holdingColumns<T>(
  tickerOf: (row: T) => string,
  referenceOf: (row: T) => ReferenceValues,
  columns: readonly ReferenceColumn[],
  /** What a table changes about its ticker column: how it draws, how far it narrows. */
  ticker: Partial<Column<T>> = {}
): Column<T>[] {
  return [
    {
      key: 'ticker',
      header: 'Ticker',
      width: 80,
      emphasis: true,
      render: tickerOf,
      value: tickerOf,
      ...ticker
    },
    ...columns.map((column): Column<T> => ({
      key: `reference-${column.key}`,
      header: column.label,
      width: widthOf(column.key),
      // How far a table that fits its pane may narrow it (BU-226).
      minWidth: column.key === 'name' ? 120 : 64,
      wrapHeader: true,
      render: (row) => formatReference(referenceOf(row)?.[column.key]),
      value: (row) => {
        const raw = referenceOf(row)?.[column.key]
        return typeof raw === 'number' ? raw : formatReference(raw)
      }
    }))
  ]
}

/** Wide enough for what each kind of column holds; a code needs little. */
function widthOf(key: string): number {
  if (key === 'name') return 180
  if (/sector|industry|group/.test(key)) return 160
  return 100
}

/** A reference value as text: the engine's string, a number with separators, a dash for none. */
export function formatReference(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString('en-US')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string')
    return /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : value
  return JSON.stringify(value)
}

/**
 * A `/data/reference` row keyed in lower case, as the holding rows are, for
 * the tables that already read reference data whole (the universes, the
 * watchlist) rather than through `reference_fields`.
 */
export function lowerKeys(fields: Readonly<Record<string, unknown>> | undefined): ReferenceValues {
  if (fields === undefined) return undefined
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value])
  )
}

function labelOf(field: FieldDescriptor): string {
  return field.label.trim() === '' ? inWords(field.name) : field.label
}

/** `country_domicile` → "Country domicile": the engine's own fallback for an unlabelled column. */
function inWords(key: string): string {
  const words = key.toLowerCase().replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
