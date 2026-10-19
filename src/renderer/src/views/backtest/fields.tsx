import type { Dispatch, ReactElement, SetStateAction } from 'react'
import type { BacktestOptions } from '../shared/strategyDocuments'
import type { BacktestSetup } from './setup'

/** What every part of the backtest form is handed. */
export interface SectionProps {
  setup: BacktestSetup
  onChange: Dispatch<SetStateAction<BacktestSetup>>
  options: BacktestOptions | undefined
}

/** A bare input inside Field's box, which owns the chrome. */
export function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder
}: {
  label: string
  value: string
  onChange: (next: string) => void
  type?: 'text' | 'number' | 'date'
  placeholder?: string
}): ReactElement {
  return (
    <input
      className="backtest-input"
      // Plain text for a number: no spinner arrows nobody would use.
      type={type === 'number' ? 'text' : type}
      {...(type === 'number' ? { inputMode: 'decimal' as const } : {})}
      aria-label={label}
      value={value}
      {...(placeholder === undefined ? {} : { placeholder })}
      onChange={(event) => {
        onChange(event.target.value)
      }}
    />
  )
}
