import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'

/** How a stored value reads in the box. */
export type InputFormat = 'money' | 'percent'

export interface FormattedInputProps {
  /** As stored and sent: "300000000", or a fraction such as "0.02". */
  value: string
  onChange: (value: string) => void
  format: InputFormat
  label: string
  className?: string
}

/**
 * A figure typed as people write it (Karan, 2026-10-18).
 *
 * Money gains its commas as it is typed — 300,000,000, not 300000000 — and
 * a fraction is entered as a percent: 2 for 2%, stored as 0.02. A plain text
 * box rather than a number input: nobody sets a fund's capital with spinner
 * arrows, and a number input cannot hold the commas.
 *
 * The text is kept here and only re-read from `value` when the two stop
 * agreeing (a revert, a run's settings arriving), because a figure being
 * typed passes through states that parse to something else: "2." is 0.02.
 */
export function FormattedInput({
  value,
  onChange,
  format,
  label,
  className
}: FormattedInputProps): ReactElement {
  const box = useRef<HTMLInputElement>(null)
  const caret = useRef<number | undefined>(undefined)
  const [text, setText] = useState(() => toText(value, format))
  const shown = fromText(text, format) === value ? text : toText(value, format)

  // Put the caret back after the same number of figures it followed, since
  // inserting commas moves everything after them along.
  useLayoutEffect(() => {
    const figures = caret.current
    if (figures === undefined || box.current === null) return
    caret.current = undefined
    const at = positionAfter(shown, figures)
    box.current.setSelectionRange(at, at)
  })

  return (
    <input
      ref={box}
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onChange={(event) => {
        const raw = event.target.value
        caret.current = figuresBefore(raw, event.target.selectionStart ?? raw.length)
        const next = format === 'money' ? grouped(clean(raw)) : clean(raw)
        setText(next)
        onChange(fromText(next, format))
      }}
    />
  )
}

/** Only what a number is made of: digits, one point, a leading minus. */
function clean(raw: string): string {
  const kept = raw.replace(/[^0-9.-]/g, '')
  const negative = kept.startsWith('-')
  const [whole = '', ...rest] = kept.replace(/-/g, '').split('.')
  const decimals = rest.length > 0 ? `.${rest.join('')}` : ''
  return `${negative ? '-' : ''}${whole}${decimals}`
}

/** Commas in the whole part; the decimals left exactly as typed. */
function grouped(cleaned: string): string {
  const negative = cleaned.startsWith('-')
  const unsigned = negative ? cleaned.slice(1) : cleaned
  const [whole = '', decimals] = unsigned.split('.')
  const commas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${commas}${decimals === undefined ? '' : `.${decimals}`}`
}

function toText(value: string, format: InputFormat): string {
  if (value === '') return ''
  if (format === 'money') return grouped(clean(value))
  const number = Number(value)
  return Number.isFinite(number) ? tidy(number * 100) : value
}

function fromText(text: string, format: InputFormat): string {
  const plain = text.replace(/,/g, '')
  if (format === 'money') return plain
  if (plain === '' || plain === '-') return ''
  const number = Number(plain)
  return Number.isFinite(number) ? tidy(number / 100) : plain
}

/** Floating-point noise off: 2.0000000000000004 → "2". */
function tidy(number: number): string {
  return String(Number(number.toPrecision(12)))
}

function figuresBefore(text: string, at: number): number {
  return text.slice(0, at).replace(/[^0-9.-]/g, '').length
}

function positionAfter(text: string, figures: number): number {
  let seen = 0
  for (let at = 0; at < text.length; at++) {
    if (seen === figures) return at
    if (/[0-9.-]/.test(text.charAt(at))) seen += 1
  }
  return text.length
}
