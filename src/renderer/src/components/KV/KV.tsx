import type { ReactElement, ReactNode } from 'react'
import type { Tone } from '../Stat/Stat'
import './KV.css'

export interface KVProps {
  label: string
  value: ReactNode
  /** Validation outcomes colour their value: resolves green, fails red. */
  tone?: Tone
  className?: string
}

/**
 * Figma 322:1643. A label/value pair on one justified line, 11px throughout:
 * muted label left, value right.
 *
 * Distinct from SummaryLine, which packs several pairs onto one line with dot
 * separators. KV stacks — it is for validation cards and key-facts panes
 * where each fact wants its own row and the values align on the right edge.
 */
export function KV({ label, value, tone = 'default', className }: KVProps): ReactElement {
  return (
    <div className={['kv', className].filter(Boolean).join(' ')}>
      <span className="kv-label">{label}</span>
      <span className={`kv-value tone-${tone}`}>{value}</span>
    </div>
  )
}

/** Stacks KV rows with the spacing the validation card uses. */
export function KVList({ children }: { children: ReactNode }): ReactElement {
  return <div className="kv-list">{children}</div>
}
