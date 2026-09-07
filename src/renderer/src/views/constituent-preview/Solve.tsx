import type { ReactElement } from 'react'
import { Badge } from '../../components/Badge/Badge'
import { Card } from '../../components/Card/Card'
import type { Column } from '../../components/Table/Table'
import { describeRoom, percent, type PreviewAsset, type PreviewSolve } from './derivation'

/**
 * Before, after, and what moved (BU-173).
 *
 * The derived analogue of the waterfall columns. A solve has no rungs to
 * show — it moves every weight at once rather than eliminating names in
 * steps — so the honest per-name story is the parent's published weight, the
 * optimiser's allocation, and the distance between them.
 *
 * Δ is signed and coloured because its sign is the point: reading down the
 * column tells you what the objective bought and what it sold.
 */
export function solveColumns(): Column<PreviewAsset>[] {
  return [
    {
      key: 'ticker',
      header: 'Ticker',
      width: 90,
      emphasis: true,
      // A name solved to zero is out of the index, not merely small. The
      // weight column says 0.00% either way, so the identifier carries the
      // distinction the waterfall's ✕ carries on the other face.
      render: (asset) => (
        <span className={asset.included ? undefined : 'solve-dropped'}>{asset.identifier}</span>
      )
    },
    {
      key: 'before',
      header: 'Parent w',
      width: 110,
      align: 'right',
      render: (asset) => percent(asset.source_weight)
    },
    {
      key: 'after',
      header: 'Solved w',
      width: 110,
      align: 'right',
      render: (asset) => percent(asset.solved_weight)
    },
    {
      key: 'delta',
      header: 'Δ',
      width: 100,
      align: 'right',
      render: (asset) => <Delta value={asset.weight_delta} />
    }
  ]
}

function Delta({ value }: { value: number | null | undefined }): ReactElement {
  if (value == null) return <span className="solve-delta-flat">—</span>

  // Below a basis point the sign is noise from the solver rather than a
  // decision, so it reads as flat rather than as a tiny buy.
  const tone = Math.abs(value) < 0.0001 ? 'flat' : value > 0 ? 'up' : 'down'
  const sign = tone === 'up' ? '+' : ''

  return (
    <span className={`solve-delta-${tone}`}>
      {sign}
      {percent(value)}
    </span>
  )
}

export interface SolveConstraintsProps {
  solve: PreviewSolve
}

/**
 * Every constraint at the solution, not only the binding ones.
 *
 * A list of binding constraints is a list of zeros: slack is zero at the
 * boundary by definition. What a reader wants beside "this cap bound" is
 * "and the turnover budget had four points of room left", which only the
 * full set can say — so the non-binding rows are the informative ones and
 * both are here.
 */
export function SolveConstraints({ solve }: SolveConstraintsProps): ReactElement {
  const rows = solve.constraints ?? []

  return (
    <Card
      title="Constraints at the solution"
      aside={<span className="type-11">{`${String(rows.length)} in force`}</span>}
      flush
      className="solve-card"
    >
      {rows.length === 0 && <p className="solve-empty type-11">This solve ran unconstrained.</p>}

      {rows.map((constraint, index) => (
        <div
          key={`${constraint.label}-${String(index)}`}
          className={constraint.binding ? 'solve-constraint is-binding' : 'solve-constraint'}
        >
          <span className="solve-constraint-index">{String(index + 1).padStart(2, '0')}</span>
          {/* 'eq' and 'ineq' as py-beacon words them: an equality is always
              binding, so the kind explains a binding row that no choice of
              objective could have left slack in. */}
          <Badge>{constraint.kind}</Badge>
          <span className="solve-constraint-label">{constraint.label}</span>
          <span className="solve-constraint-room">{describeRoom(constraint)}</span>
        </div>
      ))}
    </Card>
  )
}
