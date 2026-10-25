import { useId, type ReactElement } from 'react'
import { keyLabel, shortcutText, type Shortcut } from './catalogue'
import './Keycap.css'

const HEIGHT = 24
/** The top's depth: the skirt shows below it, most at the front, as a low cap's does. */
const TOP_HEIGHT = HEIGHT - 8

/**
 * One key, drawn as a low-profile mechanical keycap (Karan): a shallow top
 * on a skirt that shows most at the front, casting a little shadow. Wide
 * enough for its legend, so Shift is wider than K.
 */
export function Keycap({ name }: { name: string }): ReactElement {
  const label = keyLabel(name)
  const width = Math.max(HEIGHT, Math.round(label.length * 6.4 + 14))
  // useId's colons do not survive inside url(#…).
  const dish = `keycap-dish-${useId().replace(/:/g, '')}`

  return (
    <svg
      className="keycap"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={dish} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="keycap-dish-high" />
          <stop offset="1" className="keycap-dish-low" />
        </linearGradient>
      </defs>
      <rect
        className="keycap-shadow"
        x="0.5"
        y="2"
        width={width - 1}
        height={HEIGHT - 2}
        rx="4.5"
      />
      <rect
        className="keycap-body"
        x="0.5"
        y="0.5"
        width={width - 1}
        height={HEIGHT - 2.5}
        rx="4"
      />
      <rect
        className="keycap-top"
        x="2.5"
        y="1.5"
        width={width - 5}
        height={TOP_HEIGHT}
        rx="3"
        fill={`url(#${dish})`}
      />
      <text
        className="keycap-legend"
        x={width / 2}
        y={1.5 + TOP_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </svg>
  )
}

/** A shortcut as keycaps: keys pressed together side by side, steps joined by "then". */
export function KeyShortcut({ shortcut }: { shortcut: Shortcut }): ReactElement {
  return (
    <span className="key-shortcut" role="img" aria-label={shortcutText(shortcut)}>
      {shortcut.map((step, at) => (
        <span key={at} className="key-shortcut-step">
          {at > 0 && (
            <span className="key-shortcut-then type-11" aria-hidden="true">
              then
            </span>
          )}
          {step.map((key) => (
            <Keycap key={key} name={key} />
          ))}
        </span>
      ))}
    </span>
  )
}
