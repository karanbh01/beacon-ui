import { Fragment, type ReactElement, type ReactNode } from 'react'
import type { Tone } from '../Stat/Stat'
import './SummaryLine.css'

export interface SummaryItem {
  label: string
  value: ReactNode
  tone?: Tone
}

export interface SummaryLineProps {
  items: readonly SummaryItem[]
  className?: string
}

/**
 * One 11px line of label/value pairs separated by a divider-coloured dot
 * (taxonomy 7). Used where the table already carries the detail and a stat
 * strip would over-claim: Corporate Actions, Watchlist, Constituent Preview,
 * Optimisation Run, Risk Model, Weights, Drilldown.
 *
 * Labels are Regular/muted, values Medium/primary — the weight contrast is
 * what makes the pairs readable at 11px without any separator between them.
 */
export function SummaryLine({ items, className }: SummaryLineProps): ReactElement {
  return (
    <p className={['summary-line', className].filter(Boolean).join(' ')}>
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && (
            <span className="summary-sep" aria-hidden="true">
              &middot;
            </span>
          )}
          <span className="summary-pair">
            <span className="summary-label">{item.label}</span>
            <span className={`summary-value tone-${item.tone ?? 'default'}`}>{item.value}</span>
          </span>
        </Fragment>
      ))}
    </p>
  )
}
