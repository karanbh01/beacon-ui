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
import { SIDEBAR_PAGES } from './shell/pages'
import { useEngine } from './state/engine'
import { useTheme } from './state/theme'
import { runUpdateAction, useUpdate } from './state/update'
import { useWorkspace } from './state/tabs.store'
import { registerPlaceholderViews } from './views/register'
import { SEED_TABS } from './views/seed'

type BridgeState = { status: 'pending' } | { status: 'ok'; info: AppInfo } | { status: 'failed' }

// Registered at module scope so the registry is populated before the first
// render — a view resolved during render would otherwise miss it.
registerPlaceholderViews()

const DEFAULT_PAGE = SIDEBAR_PAGES[0]?.id ?? 'data-explorer'

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
  const [page, setPage] = useState(DEFAULT_PAGE)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const engine = useEngine()
  const update = useUpdate()
  const dataAge = useDataAge()
  const openTab = useWorkspace((state) => state.openTab)
  const selectTab = useWorkspace((state) => state.selectTab)

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

  // No visible control yet — the theme picker belongs in the footer and the
  // mockup for it does not exist. Called anyway so the app keeps following
  // the OS live: initTheme() applies the stored preference at boot, and this
  // subscribes to prefers-color-scheme changes while `system` is selected.
  useTheme()

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

  useEffect(() => {
    // Seed only an empty workspace. Reopening the app must not resurrect
    // tabs the user closed, and persistence has already rehydrated by now.
    if (useWorkspace.getState().tabs.length > 0) return
    for (const tab of SEED_TABS) openTab(tab)
  }, [openTab])

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
        onUpdateAction: runUpdateAction
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
      <PaneHost page={page} />
      <JobTray />
    </AppShell>
  )
}
