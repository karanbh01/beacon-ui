import type { ReactElement } from 'react'
import { Card } from '../../components/Card/Card'
import { KV, KVList } from '../../components/KV/KV'
import { asPercent, errorsOf, warningsOf, type Finding } from './pipeline'
import type { PreviewResponse } from '../shared/strategyQueries'
import './ValidationCard.css'

export interface ValidationCardProps {
  report?: { valid: boolean; findings: Finding[] } | undefined
  /**
   * Findings the app made itself, before the engine was asked (BU-160).
   *
   * Shown with the engine's own and counted with them: to a reader they are
   * the same kind of thing — a reason this draft is not an index yet.
   */
  own?: readonly Finding[]
  preview?: PreviewResponse | undefined
  dirty: boolean
  /** True while the draft has changed since preview was last run. */
  stale: boolean
}

/**
 * Figma 322:1641.
 *
 * Two things share this card and both now describe the DRAFT. The findings
 * come from `/indices/validate`, which has always taken a body; the resolved
 * figures come from `/indices/preview`, which takes one since BN-120. Before
 * that it took an id and could only describe what was saved, so the card had
 * to caption its own numbers as belonging to the last save.
 *
 * `stale` therefore means something narrower now: the draft has moved since
 * the last preview was RUN, not that preview cannot see the draft at all.
 */
export function ValidationCard({
  report,
  own = [],
  preview,
  dirty,
  stale
}: ValidationCardProps): ReactElement {
  const findings = [...own, ...(report?.findings ?? [])]
  const errors = errorsOf(findings)
  const warnings = warningsOf(findings)
  const capped = preview?.assets.filter((asset) => asset.capped).length ?? 0

  return (
    <Card title="Validation" className="validation-card">
      <KVList>
        <KV
          label="Draft"
          value={
            errors.length > 0
              ? 'blocked'
              : report === undefined
                ? 'not validated yet'
                : report.valid
                  ? 'valid'
                  : 'blocked'
          }
          tone={
            errors.length > 0
              ? 'negative'
              : report === undefined
                ? 'default'
                : report.valid
                  ? 'positive'
                  : 'negative'
          }
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
          The draft has changed since these were resolved. Preview again to refresh them.
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
