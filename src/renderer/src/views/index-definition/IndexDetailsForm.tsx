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

/** The enum py-beacon declares on `return_type` (BN-125). */
const RETURN_TYPES = [
  { value: 'PRICE', label: 'Price' },
  { value: 'TOTAL_RETURN', label: 'Total return' },
  { value: 'NET_TOTAL_RETURN', label: 'Total return (net)' }
]

/**
 * Free text, not a list.
 *
 * A trading calendar is an exchange-calendars code — XNAS, XLON, and several
 * hundred more. Enumerating them here would be a list to maintain against a
 * package this app does not depend on, and would reject a valid code the
 * moment the two fell out of step.
 */
const CALENDAR_PLACEHOLDER = 'XNAS'

export interface IndexDetailsFormProps {
  document: IndexDocument
  onChange: (change: (current: IndexDocument) => IndexDocument) => void
  /** A saved index cannot be renamed: the id is its URL. */
  idLocked: boolean
}

/**
 * Figma 321:1552.
 *
 * Return Type, Calendar, Publication, Schedule and Effective are live since
 * BN-121 and BN-125. They were left out rather than rendered as controls that
 * could not be saved, because `IndexDocument` modelled none of them.
 *
 * Schedule is `rebalance_day_rule` and Effective is `effective_lag_sessions`,
 * which py-beacon names for what they do rather than for how the frame labels
 * them — the labels here follow the frame, the keys follow the engine.
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
        <Field label="Return type" width={170}>
          <Select
            className="index-inline-select"
            options={RETURN_TYPES}
            value={document.return_type}
            onChange={(value) => {
              set('return_type', value as IndexDocument['return_type'])
            }}
            label="Return type"
          />
        </Field>

        <Field label="Calendar" width={110}>
          <input
            className="index-input"
            aria-label="Calendar"
            placeholder={CALENDAR_PLACEHOLDER}
            value={document.calendar ?? ''}
            onChange={(event) => {
              set('calendar', event.target.value === '' ? null : event.target.value)
            }}
          />
        </Field>

        <Field label="Publication" width={150}>
          <input
            className="index-input"
            aria-label="Publication"
            placeholder="End of day"
            value={document.publication_time ?? ''}
            onChange={(event) => {
              set('publication_time', event.target.value === '' ? null : event.target.value)
            }}
          />
        </Field>

        <Field label="Schedule" width={210}>
          <input
            className="index-input"
            aria-label="Schedule"
            value={document.rebalance_day_rule}
            onChange={(event) => {
              set('rebalance_day_rule', event.target.value)
            }}
          />
        </Field>

        <Field label="Effective (sessions)" width={140}>
          <input
            className="index-input"
            aria-label="Effective (sessions)"
            value={String(document.effective_lag_sessions)}
            onChange={(event) => {
              const next = Number(event.target.value)
              set('effective_lag_sessions', Number.isFinite(next) ? next : 0)
            }}
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
