import type { ReactElement } from 'react'
import type { Column } from '../../components/Table/Table'
import { holdingColumns, type ReferenceColumn } from '../shared/holdingColumns'
import { percent, type PreviewAsset } from './derivation'

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
export function solveColumns(reference: readonly ReferenceColumn[]): Column<PreviewAsset>[] {
  return [
    ...holdingColumns<PreviewAsset>(
      (asset) => asset.identifier,
      (asset) => asset.reference,
      reference,
      {
        // A name solved to zero is out of the index, not merely small. The
        // weight column says 0.00% either way, so the identifier carries the
        // distinction the waterfall's ✕ carries on the other face.
        render: (asset) => (
          <span className={asset.included ? undefined : 'solve-dropped'}>{asset.identifier}</span>
        )
      }
    ),
    {
      key: 'before',
      header: 'Parent Weight',
      width: 110,
      align: 'right',
      render: (asset) => percent(asset.source_weight),
      value: (asset) => (asset.source_weight == null ? undefined : asset.source_weight * 100)
    },
    {
      key: 'after',
      header: 'Solved Weight',
      width: 110,
      align: 'right',
      render: (asset) => percent(asset.solved_weight),
      value: (asset) => (asset.solved_weight == null ? undefined : asset.solved_weight * 100)
    },
    {
      key: 'delta',
      header: 'Δ',
      width: 100,
      align: 'right',
      render: (asset) => delta(asset.weight_delta),
      value: (asset) => (asset.weight_delta == null ? undefined : asset.weight_delta * 100)
    }
  ]
}

/** Called rather than rendered: this is a cell, not a component. */
function delta(value: number | null | undefined): ReactElement {
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
