import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import { BeaconProvider } from './api/BeaconProvider'
import { JobTray } from './api/JobTray'
import { useDataAge } from './api/useHealth'
import { AssistantPanel } from './assistant/AssistantPanel'
import { MockTranscript } from './assistant/transcript'
import { AppShell } from './shell/AppShell'
import { PaneHost } from './shell/PaneHost'
import { useJobs } from './api/jobs'
import { HomeView } from './views/home/HomeView'
import { activityRows } from './views/home/activityRows'
import { useEngine } from './state/engine'
import { useTheme } from './state/theme'
import { runUpdateAction, useUpdate } from './state/update'
import { useWorkspace } from './state/tabs.store'
import { registerPlaceholderViews } from './views/register'

type BridgeState = { status: 'pending' } | { status: 'ok'; info: AppInfo } | { status: 'failed' }

// Registered at module scope so the registry is populated before the first
// render — a view resolved during render would otherwise miss it.
registerPlaceholderViews()

/**
 * Home, every launch — not the last page visited.
 *
 * `home` deliberately matches no sidebar id, which is what leaves every slot
 * unhighlighted while it is showing. That is the frame's behaviour (its
 * Sidebar instance highlights nothing) rather than an oversight.
 */
const HOME_PAGE = 'home'

/**
 * Everything that needs the API client sits inside BeaconProvider, so the
 * shell can render before — and without — an engine.
 */
export function App(): ReactElement {
  const engine = useEngine()

  return (
    <BeaconProvider engine={engine}>
      <AppBody />
    </BeaconProvider>
  )
}

function AppBody(): ReactElement {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'pending' })
  const [page, setPage] = useState(HOME_PAGE)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const engine = useEngine()
  const update = useUpdate()
  const dataAge = useDataAge()
  const selectTab = useWorkspace((state) => state.selectTab)
  const openOrRetarget = useWorkspace((state) => state.openOrRetarget)
  const jobs = useJobs((state) => state.jobs)

  // Fixed at mount rather than recomputed each render, so Home's date and its
  // relative timestamps agree with each other and nothing re-renders on a tick.
  const [today] = useState(() => new Date())

  /**
   * `Manage sources…` goes to Data Coverage, which is the pane that can
   * actually say something about what is configured. There is no settings
   * surface for sources, and sending the user nowhere would be worse than
   * sending them to the nearest true answer.
   */
  const openCoverage = (): void => {
    setPage('data-explorer')
    selectTab('seed-coverage')
  }

  /**
   * An identifier picked from the app-wide search (BU-72).
   *
   * Retargets the Prices tab already open rather than stacking another —
   * `openOrRetarget` is the same route a watchlist row takes, so anything
   * linked to that tab follows along, which is the point of a link.
   */
  const openIdentifier = (subject: string): void => {
    setPage('data-explorer')
    openOrRetarget({
      page: 'data-explorer',
      viewKind: 'prices',
      title: 'Prices',
      subject
    })
  }

  // The footer toggle is the manual override (BU-39). Until someone touches
  // it the preference stays `system`, so a fresh install follows the OS live;
  // flipping it writes an explicit light or dark and stops tracking.
  const theme = useTheme()

  useEffect(() => {
    // Never let a bridge failure escape this effect. An uncaught throw here
    // tears down the whole React tree and the user gets a blank window.
    const load = async (): Promise<void> => {
      const api = window.beacon
      if (api === undefined) {
        setBridge({ status: 'failed' })
        return
      }
      try {
        setBridge({ status: 'ok', info: await api.appInfo() })
      } catch {
        setBridge({ status: 'failed' })
      }
    }
    void load()
  }, [])

  // beacon-ui's own version, distinct from py-beacon's which the engine reports.
  const appVersion = bridge.status === 'ok' ? bridge.info.version : undefined

  return (
    <AppShell
      sidebar={{ activeId: page, onSelect: setPage }}
      menuBar={{
        onToggleAssistant: () => {
          setAssistantOpen((open) => !open)
        },
        // The data sources panel reports what is actually connected, so it
        // needs the same engine state the footer uses.
        engine: engine.status,
        onManageSources: openCoverage,
        onSelectTab: selectTab,
        onOpenIdentifier: openIdentifier,
        // Layout is per page (BU-75), so the bar's layout menu needs to know
        // which one it is acting on.
        page,
        onGoHome: () => {
          setPage(HOME_PAGE)
        },
        ...(bridge.status === 'ok' ? { platform: bridge.info.platform } : {})
      }}
      footer={{
        // Truthful: this is the python supervisor's own state, pushed from
        // main, not an inference from whether the IPC bridge answered.
        engine: {
          state: engine.status,
          ...(engine.version === undefined ? {} : { version: engine.version }),
          ...(engine.detail === undefined ? {} : { detail: engine.detail })
        },
        // Real freshness from /health's cache_age, refreshed when py-beacon
        // publishes a data.freshness event rather than on a timer.
        ...(dataAge === undefined ? {} : { dataUpdated: dataAge }),
        ...(appVersion === undefined ? {} : { version: appVersion }),
        // electron-updater, live from main. Nothing downloads unasked, so
        // this is also the control surface — see ADR-0004.
        update,
        onUpdateAction: runUpdateAction,
        themeMode: theme.mode,
        onThemeChange: theme.setPreference
      }}
      {...(assistantOpen
        ? {
            assistant: (
              <AssistantPanel
                context={['TECH10 Backtest']}
                onClose={() => {
                  setAssistantOpen(false)
                }}
              >
                <MockTranscript />
              </AssistantPanel>
            )
          }
        : {})}
    >
      {page === HOME_PAGE ? (
        <HomeView
          today={today}
          activity={activityRows(jobs, today.getTime())}
          onQuickstart={(target, tab) => {
            setPage(target)
            selectTab(tab)
          }}
        />
      ) : (
        <PaneHost page={page} />
      )}
      <JobTray />
    </AppShell>
  )
}
