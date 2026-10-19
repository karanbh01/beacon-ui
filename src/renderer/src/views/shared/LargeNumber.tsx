import type { ReactElement } from 'react'
import { useNumberPreferences } from '../../state/dataPreferences'
import { formatCount, formatMoney, moneyHeader } from './largeNumbers'

/**
 * Large numbers as Data Preferences say (BU-228).
 *
 * Components rather than formatter calls, so a column definition built once
 * need not be rebuilt with the preferences threaded through it: each cell
 * reads the choice itself, and changing it redraws every table at once.
 */

/** A money amount in the chosen unit and precision. */
export function Money({ value }: { value: number | null | undefined }): ReactElement {
  const preferences = useNumberPreferences()
  return <>{formatMoney(value, preferences)}</>
}

/**
 * A fund's money, each amount with its own suffix: 898,979,030 → "899.0M".
 *
 * A run's flows, fees and assets span hundreds to billions in one table,
 * so no single unit serves them — the default (billions, no decimals) reads
 * a 250,000 subscription as 0. The chosen decimals still apply, with one at
 * least so a suffixed amount is not rounded to a whole million.
 */
export function CompactMoney({ value }: { value: number | null | undefined }): ReactElement {
  const { decimals } = useNumberPreferences()
  return <>{formatMoney(value, { unit: 'auto', decimals: Math.max(decimals, 1) })}</>
}

/** A large count — a volume, an ADV — at the chosen precision. */
export function Count({ value }: { value: number | null | undefined }): ReactElement {
  const { decimals } = useNumberPreferences()
  return <>{formatCount(value, decimals)}</>
}

/** A money column's header naming the chosen unit: "Market Cap (bn USD)". */
export function MoneyHeader({
  label,
  currency
}: {
  label: string
  currency: string
}): ReactElement {
  const { unit } = useNumberPreferences()
  return <>{moneyHeader(label, currency, unit)}</>
}
