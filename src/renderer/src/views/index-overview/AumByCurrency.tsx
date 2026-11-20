import type { ReactElement } from 'react'
import { CompactMoney } from '../shared/LargeNumber'
import { percent } from '../shared/indexMetrics'
import { HoverTip } from './HoverTip'

/** One share class's assets now, in the book's currency, and the currency it is dealt in. */
export interface ClassHolding {
  name: string
  currency: string
  assets: number | undefined
  /** Hedged into its currency: drawn striped. */
  hedged: boolean
}

/**
 * Over the AUM table (Karan, 2026-11-20): the fund's assets by the currency
 * its classes are dealt in, as a bridge: each currency's bar starts where
 * the one above it ends, so together they run the fund's whole assets. A
 * currency with several classes stacks them, each in the colour the flows
 * chart gives it, a hedged class striped. No axes and no figures, which the
 * table under it has; each class's are on hover.
 */
export function AumByCurrency({
  classes,
  colourOf
}: {
  classes: readonly ClassHolding[]
  colourOf: (name: string) => string
}): ReactElement {
  const total = classes.reduce((sum, row) => sum + (row.assets ?? 0), 0)
  const rows = byCurrency(classes)
  // Where along the fund's assets each currency starts: the totals before it.
  const starts = rows.map((_, at) => rows.slice(0, at).reduce((sum, row) => sum + row.total, 0))
  // A share of the fund as a share of the track, which the whole fund spans.
  const along = (amount: number): string => `${String((amount / (total || 1)) * 100)}%`

  return (
    <div className="aum-currencies" role="img" aria-label="Assets by currency and share class">
      {rows.map((row, at) => {
        const start = starts[at] ?? 0
        return (
          <div key={row.currency} className="aum-currency">
            <span className="aum-currency-name type-11">{row.currency}</span>
            <div className="aum-currency-track">
              <div
                className="aum-currency-bar"
                style={{
                  left: along(start),
                  width: along(row.total),
                  // Each class as wide as its assets within the currency's bar.
                  gridTemplateColumns: row.classes
                    .map((holding) => `${String((holding.assets ?? 0) / (row.total || 1))}fr`)
                    .join(' ')
                }}
              >
                {row.classes.map((holding) => (
                  <HoverTip
                    key={holding.name}
                    className="aum-currency-part"
                    tip={<PartTip holding={holding} total={total} />}
                  >
                    <span
                      className={
                        holding.hedged
                          ? 'aum-currency-fill aum-currency-hedged'
                          : 'aum-currency-fill'
                      }
                      style={{ backgroundColor: colourOf(holding.name) }}
                    />
                  </HoverTip>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PartTip({ holding, total }: { holding: ClassHolding; total: number }): ReactElement {
  return (
    <>
      <div className="header-tip-title">
        {`Class ${holding.name} · ${holding.currency}${holding.hedged ? ' · hedged' : ''}`}
      </div>
      <dl className="header-tip-params">
        <dt>Net assets</dt>
        <dd>
          <CompactMoney value={holding.assets} />
        </dd>
        <dt>Share of the fund</dt>
        <dd>{percent(total === 0 ? undefined : ((holding.assets ?? 0) / total) * 100, 1)}</dd>
      </dl>
    </>
  )
}

/** The classes grouped by currency, the largest currency first, its classes by name. */
function byCurrency(
  classes: readonly ClassHolding[]
): { currency: string; total: number; classes: ClassHolding[] }[] {
  const groups = new Map<string, ClassHolding[]>()
  for (const holding of classes) {
    groups.set(holding.currency, [...(groups.get(holding.currency) ?? []), holding])
  }
  return [...groups]
    .map(([currency, members]) => ({
      currency,
      total: members.reduce((sum, row) => sum + (row.assets ?? 0), 0),
      classes: [...members].sort((one, other) => one.name.localeCompare(other.name))
    }))
    .sort((one, other) => other.total - one.total)
}
