import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import type { AppInfo } from '@shared/ipc'
import { AssistantPanel } from './assistant/AssistantPanel'
import { MockTranscript } from './assistant/transcript'
import { AppShell } from './shell/AppShell'
import { PaneHost } from './shell/PaneHost'
import { SIDEBAR_PAGES } from './shell/pages'
import { ThemeSwitch } from './state/ThemeSwitch'
import { useTheme } from './state/theme'
import { useWorkspace } from './state/tabs.store'
import { registerPlaceholderViews } from './views/register'
import { SEED_TABS } from './views/seed'

type BridgeState = { status: 'pending' } | { status: 'ok'; info: AppInfo } | { status: 'failed' }

// Registered at module scope so the registry is populated before the first
// render — a view resolved during render would otherwise miss it.
registerPlaceholderViews()

const DEFAULT_PAGE = SIDEBAR_PAGES[0]?.id ?? 'data-explorer'

export function App(): ReactElement {
  const [bridge, setBridge] = useState<BridgeState>({ status: 'pending' })
  const [page, setPage] = useState(DEFAULT_PAGE)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const theme = useTheme()
  const openTab = useWorkspace((state) => state.openTab)

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

  const engineVersion = bridge.status === 'ok' ? bridge.info.version : undefined

  return (
    <AppShell
      sidebar={{ activeId: page, onSelect: setPage }}
      menuBar={{
        onToggleAssistant: () => {
          setAssistantOpen((open) => !open)
        },
        extra: <ThemeSwitch {...theme} />,
        ...(bridge.status === 'ok' ? { platform: bridge.info.platform } : {})
      }}
      footer={{
        engine:
          bridge.status === 'failed'
            ? { state: 'degraded' }
            : bridge.status === 'pending'
              ? { state: 'starting' }
              : {
                  state: 'connected',
                  ...(engineVersion === undefined ? {} : { version: engineVersion })
                },
        ...(engineVersion === undefined ? {} : { version: engineVersion })
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
    </AppShell>
  )
}
