import { Fragment, useState, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Badge } from '../../components/Badge/Badge'
import { ParamField } from '../index-definition/ParamField'
import { fieldValue } from '../index-definition/ruleCatalogue'
import type { SectionProps } from './fields'
import { emptyClass, filled, type ClassDraft } from './setup'
import '../index-definition/Methodology.css'

/**
 * Share classes as Index Definition lists its rules (Karan, 2026-10-17):
 * numbered rows, a badge, a one-line summary and an outcome, with the row's
 * fields opening beneath it when it is clicked. The same classes Methodology
 * uses, so the two read as one grammar.
 *
 * None is one class with the fund's capital, as without classes. Each class
 * shares the one book in its own currency, fee and distribution.
 */
export function ShareClasses({ setup, onChange, options }: SectionProps): ReactElement {
  const [open, setOpen] = useState<string | undefined>(undefined)
  const params = options?.share_class_settings ?? []

  const update = (key: string, name: string, value: string): void => {
    onChange((current) => ({
      ...current,
      classes: current.classes.map((draft) =>
        draft.key === key ? { ...draft, values: { ...draft.values, [name]: value } } : draft
      )
    }))
  }

  return (
    <div className="backtest-classes">
      <h4 className="methodology-group">Share classes</h4>
      {setup.classes.map((draft, at) => (
        <Fragment key={draft.key}>
          <div
            className={['methodology-row', open === draft.key && 'methodology-selected']
              .filter(Boolean)
              .join(' ')}
          >
            <button
              type="button"
              className="methodology-main"
              aria-pressed={open === draft.key}
              onClick={() => {
                setOpen(open === draft.key ? undefined : draft.key)
              }}
            >
              <span className="methodology-index">{String(at + 1).padStart(2, '0')}</span>
              <Badge>{filled(draft.values.currency, 'Base')}</Badge>
              <span className="methodology-summary">{summarise(draft)}</span>
              <span className="methodology-outcome">{capitalOf(draft)}</span>
            </button>
            <span className="methodology-actions">
              <button
                type="button"
                className="methodology-action"
                aria-label={`Remove class ${filled(draft.values.name, String(at + 1))}`}
                onClick={() => {
                  onChange((current) => ({
                    ...current,
                    classes: current.classes.filter((entry) => entry.key !== draft.key)
                  }))
                }}
              >
                ×
              </button>
            </span>
          </div>

          {open === draft.key && (
            <div className="backtest-class">
              {params.map((param) => (
                <ParamField
                  key={param.name}
                  param={param}
                  value={draft.values[param.name] ?? fieldValue(param, {})}
                  onChange={(next) => {
                    update(draft.key, param.name, next)
                  }}
                />
              ))}
            </div>
          )}
        </Fragment>
      ))}

      <AddSlot
        label="Add share class"
        indent={44}
        onClick={() => {
          const key = `class-${String(Date.now())}`
          onChange((current) => ({ ...current, classes: [...current.classes, emptyClass(key)] }))
          setOpen(key)
        }}
      />
    </div>
  )
}

/** "A · accumulating · hedged · 25 bps fee", from whatever is set. */
function summarise(draft: ClassDraft): string {
  const values = draft.values
  const parts = [
    filled(values.name, 'Unnamed class'),
    filled(values.distribution, 'accumulating'),
    values.hedged === 'true' ? 'hedged' : undefined,
    values.management_fee_bps ? `${values.management_fee_bps} bps fee` : undefined
  ]
  return parts.filter((part) => part !== undefined).join(' · ')
}

function capitalOf(draft: ClassDraft): string {
  const value = Number(draft.capital)
  return Number.isFinite(value) && draft.capital !== ''
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '—'
}
