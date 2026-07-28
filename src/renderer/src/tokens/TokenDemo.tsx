import type { ReactElement } from 'react'
import { COLORS, cssVar, type ColorToken } from './tokens'
import './TokenDemo.css'

const TOKEN_NAMES = Object.keys(COLORS.dark) as ColorToken[]

/** Mock rows shaped like the Weights table, to exercise signed colouring. */
const ROWS = [
  { name: 'AAPL', weight: '8.42%', change: '+1.21%', positive: true },
  { name: 'MSFT', weight: '7.90%', change: '+0.44%', positive: true },
  { name: 'NVDA', weight: '7.15%', change: '-2.08%', positive: false },
  { name: 'AVGO', weight: '5.63%', change: '-0.37%', positive: false }
]

function Swatch({ token }: { token: ColorToken }): ReactElement {
  return (
    <div className="swatch">
      <div className="swatch-chip" style={{ background: cssVar(token) }} />
      <span className="swatch-name">{token}</span>
    </div>
  )
}

/**
 * Exists to prove BU-4's acceptance criterion: every colour here resolves
 * through a CSS custom property, so flipping `data-theme` on the root element
 * restyles the whole page without a single component re-render or prop change.
 */
export function TokenDemo(): ReactElement {
  return (
    <div className="demo">
      <section className="demo-card">
        <h2 className="demo-head">Tokens</h2>
        <div className="swatch-grid">
          {TOKEN_NAMES.map((token) => (
            <Swatch key={token} token={token} />
          ))}
        </div>
      </section>

      <section className="demo-card">
        <h2 className="demo-head">Composed</h2>
        <table className="demo-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Weight</th>
              <th className="num">Change</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td className="num">{row.weight}</td>
                <td className={row.positive ? 'num pos' : 'num neg'}>{row.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="demo-controls">
          <button type="button" className="btn">
            Reset
          </button>
          <button type="button" className="btn accent">
            Apply
          </button>
        </div>
        <p className="demo-foot">
          4 constituents &middot; &Sigma; = 29.10% &middot; as of 27 Jul 2026
        </p>
      </section>
    </div>
  )
}
