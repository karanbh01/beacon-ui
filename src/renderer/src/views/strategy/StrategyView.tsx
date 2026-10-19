import { useState, type ReactElement } from 'react'
import { isDocumentId } from '../../api/ids'
import { BackButton } from '../../components/BackButton/BackButton'
import { Button } from '../../components/Button/Button'
import { PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { useOpenedDefinition } from '../../state/tabMemory'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { FaultNotice, ViewError, ViewLoading } from '../shared/ViewState'
import {
  useBacktestOptions,
  useDeleteStrategy,
  useSaveStrategy,
  useStrategies,
  useValidateStrategy
} from '../shared/strategyDocuments'
import { ImplementationCard } from './ImplementationCard'
import { StrategyCatalogue } from './StrategyCatalogue'
import { StrategyForm } from './StrategyForm'
import { draftFindings, useStrategyDraft } from './strategyDraft'
import './StrategyView.css'

/**
 * Strategy Builder → Strategy (py-beacon 0.9.0, Karan).
 *
 * Where a strategy is written: the index it holds, the kind, and how it is
 * carried out. A document view like Index Definition — a draft with
 * Validate, Revert and Save, the catalogue when nothing is open — and the
 * strategy it saves is what Beacon View backtests (Backtest… opens that).
 */
export function StrategyView({ tab, subject, pane }: ViewProps): ReactElement {
  const strategies = useStrategies()
  const deleteStrategy = useDeleteStrategy()
  const options = useBacktestOptions()
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)

  // What the catalogue opened, kept per tab like Index Definition's (BU-227).
  const [opened, setOpened] = useOpenedDefinition(tab.id)
  const named =
    subject ?? tab.subject ?? tab.pinnedDoc ?? (isDocumentId(tab.title) ? tab.title : undefined)
  const chosen = named ?? opened
  const strategyId = chosen ?? ''

  const { draft, saved, dirty, loading, error, edit, revert, commit } = useStrategyDraft(
    tab.id,
    strategyId
  )
  const validate = useValidateStrategy()
  const save = useSaveStrategy()
  const [removed, setRemoved] = useState<string | undefined>(undefined)

  if (chosen === undefined && strategies.isPending) return <ViewLoading what="strategies" />
  if (loading) return <ViewLoading what={strategyId} />
  if (error !== undefined) return <ViewError error={error} />

  if (chosen === undefined || draft === undefined) {
    return (
      <div className="strategy-view">
        {removed !== undefined && <p className="strategy-removed type-11">{removed}</p>}
        {strategies.isError && <ViewError error={strategies.error} />}
        <StrategyCatalogue
          strategies={strategies.data?.strategies ?? []}
          onOpen={setOpened}
          onDelete={(strategy) => {
            // Its runs go with it, so the confirmation says so (BN-312).
            void window.beacon
              ?.confirm({
                title: 'Delete strategy',
                message: `Delete “${strategy.name}”?`,
                detail: 'Its saved backtest and every run of it are deleted with it.'
              })
              .then((confirmed) => {
                if (!confirmed) return
                deleteStrategy.mutate(strategy.id, {
                  onSuccess: (result) => {
                    setRemoved(
                      `Deleted ${result.strategy_id}${result.backtest_record_deleted ? ' and its saved backtest' : ''}.`
                    )
                  }
                })
              })
          }}
        />
      </div>
    )
  }

  const own = draftFindings(draft)
  const backtest = (): void => {
    openOrRetarget({
      page: 'beacon-view',
      pane,
      viewKind: 'backtest',
      title: draft.id,
      subject: draft.id
    })
  }

  return (
    <div className="strategy-view">
      <PaneHeader
        kind="document"
        title={draft.id}
        meta={draft.index_id === '' ? 'holds no index yet' : `${draft.name} · ${draft.index_id}`}
        {...(saved === undefined
          ? { status: 'new · not saved yet' }
          : dirty
            ? { status: 'unsaved changes' }
            : {})}
        controls={
          <>
            {named === undefined && (
              <BackButton
                to="All strategies"
                onClick={() => {
                  setOpened(undefined)
                }}
              />
            )}
            <Button
              disabled={validate.isPending || own.length > 0}
              onClick={() => {
                validate.mutate(draft)
              }}
            >
              {validate.isPending ? 'Validating…' : 'Validate'}
            </Button>
            <Button onClick={revert} disabled={!dirty}>
              Revert
            </Button>
            <Button
              variant="accent"
              disabled={!dirty || save.isPending || own.length > 0}
              onClick={() => {
                save.mutate(
                  { document: draft, isNew: saved === undefined },
                  {
                    onSuccess: (result) => {
                      commit(result.strategy)
                    }
                  }
                )
              }}
            >
              Save
            </Button>
            {/* Only what is saved can be run: the engine backtests the
                stored strategy, not this draft. */}
            <Button disabled={saved === undefined || dirty} onClick={backtest}>
              Backtest…
            </Button>
          </>
        }
      />

      {save.isError && <ViewError error={save.error} />}
      {validate.isError && <ViewError error={validate.error} />}
      {own.length > 0 && (
        <ul className="strategy-findings type-11">
          {own.map((finding) => (
            <li key={finding}>{finding}</li>
          ))}
        </ul>
      )}
      {validate.data !== undefined &&
        (validate.data.valid ? (
          <p className="strategy-note type-11">The engine would accept this strategy as written.</p>
        ) : (
          <FaultNotice
            fault={{
              code: 'INVALID_RULE',
              message: 'The engine would refuse this strategy.',
              detail: { findings: validate.data.findings }
            }}
          />
        ))}

      <StrategyForm document={draft} onChange={edit} options={options.data} />
      <ImplementationCard document={draft} onChange={edit} options={options.data} />
    </div>
  )
}
