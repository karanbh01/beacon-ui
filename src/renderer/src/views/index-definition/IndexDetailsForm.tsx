import type { ReactElement } from 'react'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import type { IndexDocument } from './pipeline'
import './IndexDetailsForm.css'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'].map((code) => ({
  value: code,
  label: code
}))

/** py-beacon documents exactly these four. */
const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'SEMI-ANNUAL', 'ANNUAL'].map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase()
}))

export interface IndexDetailsFormProps {
  document: IndexDocument
  onChange: (change: (current: IndexDocument) => IndexDocument) => void
  /** A saved index cannot be renamed: the id is its URL. */
  idLocked: boolean
}

/**
 * Figma 321:1552.
 *
 * Figma's form also carries Return Type, Calendar, Publication, Schedule and
 * Effective. `IndexDocument` is
 * `{id, name, description, currency, base_date, base_value,
 * rebalancing_frequency, universe, pipeline}` and models none of the five, so
 * they are left out rather than rendered as controls that cannot be saved.
 * Tracked in #44.
 */
export function IndexDetailsForm({
  document,
  onChange,
  idLocked
}: IndexDetailsFormProps): ReactElement {
  const set = <K extends keyof IndexDocument>(key: K, value: IndexDocument[K]): void => {
    onChange((current) => ({ ...current, [key]: value }))
  }

  return (
    <section className="index-details">
      <h3 className="index-section-label">Index details</h3>

      <div className="index-form-row">
        <Field label="Id" width={140}>
          <input
            className="index-input"
            aria-label="Id"
            value={document.id}
            disabled={idLocked}
            onChange={(event) => {
              set('id', event.target.value)
            }}
          />
        </Field>

        <Field label="Name" width={290}>
          <input
            className="index-input"
            aria-label="Name"
            value={document.name}
            onChange={(event) => {
              set('name', event.target.value)
            }}
          />
        </Field>

        <Field label="Currency" width={100}>
          <Select
            className="index-inline-select"
            options={CURRENCIES}
            value={document.currency}
            onChange={(value) => {
              set('currency', value)
            }}
            label="Currency"
          />
        </Field>
      </div>

      <div className="index-form-row">
        <Field label="Base date" width={140}>
          <input
            className="index-input"
            type="date"
            aria-label="Base date"
            value={document.base_date.slice(0, 10)}
            onChange={(event) => {
              set('base_date', event.target.value)
            }}
          />
        </Field>

        <Field label="Base value" width={120}>
          <input
            className="index-input"
            type="number"
            aria-label="Base value"
            value={document.base_value}
            onChange={(event) => {
              set('base_value', Number(event.target.value))
            }}
          />
        </Field>

        <Field label="Rebalance frequency" width={150}>
          <Select
            className="index-inline-select"
            options={FREQUENCIES}
            value={document.rebalancing_frequency}
            onChange={(value) => {
              set('rebalancing_frequency', value)
            }}
            label="Rebalance frequency"
          />
        </Field>
      </div>

      <div className="index-form-row">
        <Field label="Description" width={572}>
          <input
            className="index-input"
            aria-label="Description"
            value={document.description ?? ''}
            onChange={(event) => {
              set('description', event.target.value)
            }}
          />
        </Field>
      </div>
    </section>
  )
}
