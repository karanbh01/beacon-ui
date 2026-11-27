import { useState, type ReactElement } from 'react'
import { Button } from '../../components/Button/Button'
import { Calculating } from '../../components/Calculating/Calculating'
import { HeaderLabel, PaneHeader } from '../../components/PaneHeader/PaneHeader'
import { TickerField } from '../../components/TickerField/TickerField'
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl'
import { pageSubject } from '../../state/tabs.logic'
import { useWorkspace } from '../../state/tabs.store'
import type { ViewProps } from '../../shell/viewRegistry'
import { ViewEmpty, ViewError } from '../shared/ViewState'
import { useAnalysisOptions } from '../shared/analyticsQueries'
import { useAsset, useProfile } from '../shared/beaconQueries'
import { useStrategyCatalogue } from '../shared/strategyDocuments'
import { DrilldownContribution } from './DrilldownContribution'
import { DrilldownHead } from './DrilldownHead'
import { DrilldownRisk } from './DrilldownRisk'
import { DrilldownSelection } from './DrilldownSelection'
import { DrilldownSummary } from './DrilldownSummary'
import { DrilldownTrading } from './DrilldownTrading'
import type { Period } from './profile'
import '../index-overview/IndexOverviewView.css'
import './DrilldownView.css'

type Face = 'summary' | 'selection' | 'contribution' | 'risk' | 'trading'

/*
 * Karan's order (2026-11-26): the name at a glance, then why it is held,
 * what it added, what it risked, and what it cost, as the Overview runs from
 * what a strategy did to how it was carried out.
 */
const FACES: readonly { value: Face; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'selection', label: 'Selection' },
  { value: 'contribution', label: 'Contribution' },
  { value: 'risk', label: 'Risk' },
  { value: 'trading', label: 'Trading' }
]

/**
 * Beacon View → Asset Drilldown. Figma 234:8850; laid out again as the
 * Overview is (Karan, 2026-11-26).
 *
 * One name in the latest run of the page's strategy: its profile from
 * py-beacon (BN-468..474), every part a dated table, on five faces. The
 * figures are the run's own, measured on its daily total returns; nothing
 * here is worked out in the app.
 *
 * The app's SECOND linked view, and the one that proves the mechanic
 * generalises: the first (Charting) follows Prices on the Data Explorer
 * page, this one follows Weights on Beacon View. Neither knows anything
 * about the other; both resolve their subject from whatever tab they were
 * linked to (taxonomy §1, archetype 6).
 */
export function DrilldownView({ tab, subject, pane }: ViewProps): ReactElement {
  const identifier = subject ?? ''
  /*
   * The strategy whose run held this name, from the page's Overview
   * (BU-166). A pin on an older tab says which, where there is no Overview.
   *
   * It used to fall back to a hard-coded 'TECH10', so a drilldown opened from
   * any other index quietly described that one instead.
   */
  const anchor = useWorkspace((state) => pageSubject(state, tab.page, 'overview'))
  /*
   * Or the one picked beside the name (Karan, 2026-11-27): a name can be in
   * more than one backtest, so the tab can drill into any of them.
   */
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const strategyId = picked ?? (anchor === '' ? (tab.pinnedDoc ?? '') : anchor)
  const catalogue = useStrategyCatalogue()

  const [face, setFace] = useState<Face>('summary')
  const [by, setBy] = useState<Period>('quarter')
  const asset = useAsset(strategyId, identifier)
  const profile = useProfile(strategyId, identifier, by)
  const options = useAnalysisOptions()

  const setSubject = useWorkspace((state) => state.setSubject)
  const severLink = useWorkspace((state) => state.severLink)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const sourceTitle = useWorkspace((state) =>
    tab.linkSourceId === undefined
      ? undefined
      : state.tabs.find((candidate) => candidate.id === tab.linkSourceId)?.title
  )

  // What the figures are measured against: the run's tracked comparator
  // since py-beacon 0.11.0, a code the catalogue names, and the run itself
  // before it. Lower case, as it sits mid-sentence: "against the optimised index".
  const code = profile.data?.against ?? asset.data?.against ?? undefined
  const comparator =
    code === undefined ? strategyId : (options.data?.names.comparator?.[code] ?? code).toLowerCase()
  // An engine before 0.11.0 has no profile: Summary still has the asset's figures.
  const data = profile.data

  return (
    <div className="drilldown-view">
      <PaneHeader
        kind="query"
        subject={identifier}
        {...(sourceTitle === undefined ? {} : { linkedTo: sourceTitle })}
        label="Security"
        beside={
          <HeaderLabel label="Backtest">
            <TickerField
              subject={strategyId}
              index={catalogue.rows}
              label="Backtest"
              onQuery={(next) => {
                setPicked(next)
              }}
            />
          </HeaderLabel>
        }
        onQuery={(next) => {
          if (tab.archetype === 'linked') severLink(tab.id)
          setSubject(tab.id, next)
        }}
        onSever={() => {
          severLink(tab.id)
        }}
        controls={
          <>
            <Button
              onClick={() => {
                openOrRetarget({
                  page: 'data-explorer',
                  pane,
                  viewKind: 'prices',
                  title: 'Prices',
                  subject: identifier
                })
              }}
            >
              Open in Data Explorer
            </Button>
            <Button chevron>Export</Button>
          </>
        }
      />

      {identifier === '' && (
        <ViewEmpty figure="ticker">
          {tab.archetype === 'linked'
            ? 'The tab this one follows has no constituent selected yet.'
            : 'Type a constituent to drill into it.'}
        </ViewEmpty>
      )}
      {identifier !== '' && strategyId === '' && (
        <ViewEmpty figure="ticker">Pick a backtest that holds {identifier}.</ViewEmpty>
      )}
      {/* The orb, as the Overview waits (Karan, 2026-11-27). */}
      {asset.isPending && identifier !== '' && strategyId !== '' && (
        <Calculating label="Loading" subject={identifier} />
      )}
      {asset.isError && <ViewError error={asset.error} />}

      {/*
        The name itself stays put while the faces change under it (Karan,
        2026-11-26), so the toggle sits below the top rather than above it.
      */}
      {asset.isSuccess && (
        <>
          <DrilldownHead
            strategyId={strategyId}
            identifier={identifier}
            profile={data}
            asset={asset.data}
          />
          <SegmentedControl
            segments={FACES}
            value={face}
            onChange={setFace}
            label="Drilldown section"
            className="overview-faces"
          />
        </>
      )}
      {asset.isSuccess && face === 'summary' && (
        <DrilldownSummary
          strategyId={strategyId}
          identifier={identifier}
          profile={data}
          asset={asset.data}
        />
      )}
      {asset.isSuccess && face === 'selection' && <DrilldownSelection profile={data} />}
      {asset.isSuccess && face === 'contribution' && (
        <DrilldownContribution profile={data} by={by} onBy={setBy} comparator={comparator} />
      )}
      {asset.isSuccess && face === 'risk' && (
        <DrilldownRisk profile={data} comparator={comparator} />
      )}
      {asset.isSuccess && face === 'trading' && <DrilldownTrading profile={data} />}
      {asset.isSuccess && face !== 'summary' && profile.isError && (
        <p className="drilldown-none type-11">
          This engine has no profile of {identifier}: {profile.error.message}
        </p>
      )}
    </div>
  )
}
