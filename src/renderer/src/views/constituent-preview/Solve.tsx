import type { ReactElement } from 'react'
import { Badge } from '../../components/Badge/Badge'
import { Card } from '../../components/Card/Card'
import { describeRoom, type PreviewSolve } from './derivation'

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
