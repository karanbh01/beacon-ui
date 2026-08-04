import { useMemo, useState, type ReactElement } from 'react'
import { activeJobs, useJobs } from '../../api/jobs'
import { Button } from '../../components/Button/Button'
import { Card } from '../../components/Card/Card'
import { Checkbox } from '../../components/Checkbox/Checkbox'
import { Field } from '../../components/Field/Field'
import { KV, KVList } from '../../components/KV/KV'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { PaperPreview } from '../../components/PaperPreview/PaperPreview'
import { Select } from '../../components/Select/Select'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { useOverview } from '../shared/beaconQueries'
import { fromFraction, percent, signedPercent, sinceStart, toPoints } from '../shared/indexMetrics'
import { useOpenRender, useRenderReport, useTemplates } from '../shared/reportQueries'
import { FACTSHEET_SECTIONS, orderedSelection, renderFilename, toggle } from './sections'
import './FactsheetView.css'

const ALL = FACTSHEET_SECTIONS.map((section) => section.id)

/**
 * Reports → Factsheet. Figma 234:10798.
 *
 * Export is the job flow again: `POST /reports/render` answers 202, the event
 * feed reports progress, and the finished PDF is fetched and handed to the OS.
 * The bytes travel through the renderer because the download is
 * authenticated — opening py-beacon's URL in a browser would arrive with no
 * bearer token.
 */
export function FactsheetView({ tab, subject, pane }: ViewProps): ReactElement {
  const indexId = subject ?? tab.pinnedDoc ?? ''
  const [templateId, setTemplateId] = useState('FACTSHEET-A4')
  const [selected, setSelected] = useState<readonly string[]>(ALL)
  const [message, setMessage] = useState<string | undefined>(undefined)

  const templates = useTemplates()
  const overview = useOverview(indexId)
  const render = useRenderReport()
  const open = useOpenRender()
  const jobs = useJobs((state) => state.jobs)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  const running = activeJobs(jobs).find((job) => job.kind.toLowerCase().includes('render'))
  const level = useMemo(() => toPoints(overview.data?.level), [overview.data])

  const options = useMemo(() => {
    const stored = (templates.data?.templates ?? []).map((template) => ({
      value: template.template_id,
      label: template.name
    }))
    const builtIn = (templates.data?.built_in ?? []).map((id) => ({
      value: id,
      label: `${id} · built-in`
    }))
    return [...builtIn, ...stored]
  }, [templates.data])

  const exportPdf = (): void => {
    setMessage(undefined)
    render.mutate(
      { templateId, indexId },
      {
        onSuccess: (job) => {
          open.mutate(
            {
              renderId: job.job_id,
              filename: renderFilename(templateId, indexId, new Date())
            },
            {
              onSuccess: (result) => {
                setMessage(
                  result.error === ''
                    ? `Opened ${result.path}`
                    : `Saved to ${result.path}, but the system could not open it: ${result.error}`
                )
              }
            }
          )
        }
      }
    )
  }

  const editable = (templates.data?.templates ?? []).some(
    (template) => template.template_id === templateId
  )

  return (
    <div className="factsheet-view">
      <PaneHeader
        kind="fields"
        controls={
          <>
            <Button
              disabled={!editable}
              onClick={() => {
                openOrRetarget({
                  page: tab.page,
                  pane,
                  viewKind: 'template-editor',
                  title: 'Template Editor',
                  subject: templateId
                })
              }}
            >
              Edit template
            </Button>
            <Button
              variant="accent"
              disabled={indexId === '' || running !== undefined || render.isPending}
              onClick={exportPdf}
            >
              {running === undefined ? 'Export PDF' : 'Rendering…'}
            </Button>
          </>
        }
      >
        <Field label="Template" width={220}>
          <Select
            className="factsheet-inline-select"
            options={options}
            value={templateId}
            onChange={setTemplateId}
            label="Template"
            placeholder={templateId}
          />
        </Field>
        <Field label="Index" width={140} value={indexId === '' ? '—' : indexId} />
        <Field label="As of" width={140} value={overview.data?.end.slice(0, 10) ?? '—'} />
      </PaneHeader>

      {indexId === '' && <ViewEmpty>Pin this pane to an index.</ViewEmpty>}
      {render.isError && <ViewError error={render.error} />}
      {open.isError && <ViewError error={open.error} />}
      {message !== undefined && <p className="factsheet-message type-11">{message}</p>}

      {!editable && templateId !== '' && (
        <p className="factsheet-note type-11">
          <strong>{templateId}</strong> is a built-in template: py-beacon generates it from the
          index&rsquo;s latest backtest rather than storing it, so it can be rendered but not
          edited. The section list below changes this preview, not the PDF.
        </p>
      )}

      <div className="factsheet-main-row">
        <Card title="Sections" className="factsheet-sections">
          {FACTSHEET_SECTIONS.map((section) => (
            <Checkbox
              key={section.id}
              label={section.label}
              checked={selected.includes(section.id)}
              onChange={() => {
                setSelected((current) => toggle(current, section.id))
              }}
            />
          ))}
        </Card>

        <PaperPreview
          header={`${indexId || '—'} · Factsheet`}
          footer={`py-beacon ${overview.data === undefined ? '' : 'live'} · ${templateId}`}
          page={1}
          pageCount={1}
        >
          {orderedSelection(selected).map((section) => (
            <section key={section.id} className="sheet-section">
              <h4 className="sheet-heading">{section.label}</h4>
              {section.id === 'key-facts' && overview.data !== undefined && (
                <KVList>
                  <KV label="Index" value={overview.data.name} />
                  <KV label="Base" value={overview.data.start.slice(0, 10)} />
                  <KV label="Observations" value={String(overview.data.observations)} />
                  <KV label="Rebalances" value={String(overview.data.rebalances)} />
                </KVList>
              )}
              {section.id === 'risk' && overview.data !== undefined && (
                <KVList>
                  <KV
                    label="CAGR"
                    value={percent(fromFraction(overview.data.metrics.annualised_return))}
                  />
                  <KV
                    label="Volatility"
                    value={percent(fromFraction(overview.data.metrics.volatility))}
                  />
                  <KV label="Sharpe" value={overview.data.metrics.sharpe_ratio.toFixed(2)} />
                  <KV
                    label="Max drawdown"
                    value={signedPercent(fromFraction(overview.data.metrics.max_drawdown))}
                  />
                </KVList>
              )}
              {section.id === 'performance' && (
                <p className="sheet-body">
                  Since base {signedPercent(sinceStart(level))} over {String(level.length)}{' '}
                  observations.
                </p>
              )}
            </section>
          ))}
        </PaperPreview>
      </div>

      <p className="factsheet-footnote type-11">
        The preview is ink on paper — literal colours, identical in both themes and to the PDF it
        becomes · export renders as a job and the finished file is opened by the system
      </p>
    </div>
  )
}
