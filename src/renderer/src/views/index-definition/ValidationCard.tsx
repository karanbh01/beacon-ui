import type { ReactElement } from 'react'
import { Card } from '../../components/Card/Card'
import { KV, KVList } from '../../components/KV/KV'
import { asPercent, errorsOf, warningsOf, type Finding } from './pipeline'
import type { PreviewResponse } from '../shared/strategyQueries'
import './ValidationCard.css'

export interface ValidationCardProps {
  report?: { valid: boolean; findings: Finding[] } | undefined
  preview?: PreviewResponse | undefined
  dirty: boolean
  /** True while the preview describes a document the draft has moved past. */
  stale: boolean
}

/**
 * Figma 322:1641.
 *
 * Two different things share this card, and the difference matters. The
 * FINDINGS come from `/indices/validate`, which takes the draft body and says
 * whether it could be saved. The RESOLVED figures come from
 * `/indices/{id}/preview`, which takes an id and therefore describes what is
 * STORED — so once the draft diverges the card says so rather than letting
 * last preview's numbers pass for the draft's.
 *
 * Figma also shows "Next rebalance · in 57 days". `IndexDocument` carries a
 * frequency but no schedule or calendar, so the date cannot be computed. Left
 * out; tracked in #44.
 */
export function ValidationCard({
  report,
  preview,
  dirty,
  stale
}: ValidationCardProps): ReactElement {
  const errors = report === undefined ? [] : errorsOf(report.findings)
  const warnings = report === undefined ? [] : warningsOf(report.findings)
  const capped = preview?.assets.filter((asset) => asset.capped).length ?? 0

  return (
    <Card title="Validation" className="validation-card">
      <KVList>
        <KV
          label="Draft"
          value={report === undefined ? 'not validated yet' : report.valid ? 'valid' : 'blocked'}
          tone={report === undefined ? 'default' : report.valid ? 'positive' : 'negative'}
        />
        <KV
          label="Pipeline resolves"
          value={
            preview === undefined
              ? '—'
              : `${String(preview.assets.filter((asset) => asset.included).length)} constituents · ${preview.as_of.slice(0, 10)}`
          }
        />
        <KV
          label="Cap engages"
          value={
            preview?.cap == null
              ? 'uncapped'
              : `${String(capped)} at ${asPercent(preview.cap)} · ${asPercent(preview.cap_redistributed, 2)} redistributed`
          }
        />
        <KV
          label="Weights sum"
          value={preview === undefined ? '—' : asPercent(preview.total_weight, 2)}
        />
        <KV label="Unsaved changes" value={dirty ? 'yes' : 'none'} />
      </KVList>

      {stale && (
        <p className="validation-note type-11">
          The figures above describe the <em>saved</em> index. Preview takes an id, not a body, so
          they will not follow the draft until it is saved.
        </p>
      )}

      {errors.length > 0 && (
        <ul className="validation-findings validation-errors type-11">
          {errors.map((finding) => (
            <li key={`${finding.code}-${finding.path}`}>
              <code>{finding.path}</code> {finding.message}
            </li>
          ))}
        </ul>
      )}

      {warnings.length > 0 && (
        <ul className="validation-findings validation-warnings type-11">
          {warnings.map((finding) => (
            <li key={`${finding.code}-${finding.path}`}>
              <code>{finding.path}</code> {finding.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
