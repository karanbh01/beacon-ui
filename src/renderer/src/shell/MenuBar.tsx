import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { EDIT_COMMANDS, type EditCommand, type EngineStatus } from '@shared/ipc'
import { AiAgentsIcon, DataSourcesIcon, LogoBetaIcon, WindowFormatIcon } from '../icons/generated'
import { layoutFor, SINGLE_PANE, useChrome } from '../state/chrome'
import { presetsFor, usePresets } from '../state/presets'
import {
  refreshOf,
  useGenerateData,
  useRefreshStore,
  useServedStore
} from '../views/shared/storeQueries'
import { currentPane, useCurrentPane } from '../state/currentPane'
import { activeTab } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { useTheme } from '../state/theme'
import { ChromeSearch } from './chrome/ChromeSearch'
import type { SourcesStart } from './DataSourcesDialog'
import { DataSourcesPanel } from './chrome/DataSourcesPanel'
import { useEditTarget } from './chrome/editTarget'
import { LayoutMenu } from './chrome/LayoutMenu'
import { PresetPicker } from './chrome/PresetPicker'
import { MenuDropdown } from './chrome/MenuDropdown'
import { buildMenus, type MenuAction } from './chrome/menuModel'
import { HOME_PAGE_ID } from './pages'
import type { ViewOption } from './viewRegistry'
import { ModellingAssumptionsDialog } from './ModellingAssumptionsDialog'
import { closeTabHere, newTabHere, pagePanes, reopenLastTab } from './tabActions'
import { WindowControls } from './WindowControls'
import { HoldingColumnsDialog } from '../views/shared/HoldingColumnsDialog'
import './MenuBar.css'
import { assistantShips, isReleaseBuild } from './release'

export interface MenuBarProps {
  onSearch?: (query: string) => void
  onToggleAssistant?: () => void
  /** Engine status, so the data sources panel can tell the truth. */
  engine?: EngineStatus
  /**
   * Opens the data-sources dialog (BU-215), from `Manage sources…` and from
   * the sources panel's Manage link. It opened Data Coverage once, as "the
   * nearest true answer" when nothing else existed (BU-145), then a separate
   * settings window built on the model py-beacon 0.1.2 retired.
   *
   * `start` sends it straight to a picker, for the Data menu's Open and
   * Import items.
   */
  onManageSources?: (start?: SourcesStart) => void
  /** Opens Data Preferences: how large numbers read, app-wide (BU-228). */
  onDataPreferences?: () => void
  onSelectTab?: (id: string) => void
  /** An identifier picked from search: open it on Prices. */
  onOpenIdentifier?: (subject: string) => void
  /** A view picked from search, optionally pinned to a subject (BU-79). */
  onOpenView?: (view: ViewOption, subject?: string) => void
  /** An index picked from search: open its overview. */
  onOpenIndex?: (id: string) => void
  /**
   * A preset picked from search (BU-120).
   *
   * Routed through the app rather than applied here, because applying one
   * means GOING to the page it belongs to, and the bar does not own which
   * page is showing. `subject` arrives when the query named an instrument
   * to load into it (BU-122).
   */
  onApplyPreset?: (id: string, subject?: string) => void
  onCreateIndex?: (name: string) => void
  /** The logo is how Home is reached — see HomeView. */
  onGoHome?: () => void
  /**
   * Opens the preset dialog (BU-119).
   *
   * Saving needs a name, and a name needs somewhere to type it; the bar has
   * nowhere, so the app owns that surface and the bar only asks for it.
   */
  onSavePreset?: () => void
  /**
   * Sidebar page the layout menu acts on (BU-75). Layout is per page, so the
   * bar has to know which one is showing or its menu would edit the wrong
   * arrangement and reflect a state nobody is looking at.
   */
  page?: string
  /** process.platform, so macOS can leave room for its traffic lights. */
  platform?: string
  className?: string
}

/** Only one chrome popover open at a time — two would overlap and compete. */
type OpenPanel = 'none' | 'sources' | 'layout'

/**
 * Figma 81:2. 62px tall, 0.5px bottom rule, 479px search field.
 *
 * HTML menus for now, per BU-15 — these are buttons that will grow real
 * dropdowns. Native application menus are a separate concern in src/main.
 *
 * This bar IS the title bar (BU-37): the window is frameless, so the bar
 * carries the drag region and, off macOS, the window controls. Every
 * interactive child has to opt out of dragging or it stops being clickable.
 */
export function MenuBar({
  onSearch,
  onToggleAssistant,
  engine = 'starting',
  onManageSources,
  onDataPreferences,
  onSelectTab,
  onOpenIdentifier,
  onOpenView,
  onOpenIndex,
  onApplyPreset,
  onCreateIndex,
  onGoHome,
  onSavePreset,
  page = HOME_PAGE_ID,
  platform,
  className
}: MenuBarProps): ReactElement {
  const [panel, setPanel] = useState<OpenPanel>('none')
  const [choosingColumns, setChoosingColumns] = useState(false)
  const [settingAssumptions, setSettingAssumptions] = useState(false)
  const [pickingPreset, setPickingPreset] = useState(false)
  /** Which top-level menu is open, by label. Only one at a time (BU-76). */
  const [menu, setMenu] = useState<string | undefined>(undefined)
  const bar = useRef<HTMLElement>(null)
  const theme = useTheme()
  const layout = useChrome((state) => layoutFor(state.layoutByPage, page))
  const setLayout = useChrome((state) => state.setLayout)
  const saved = usePresets((state) => state.presets)
  const applyPreset = usePresets((state) => state.apply)
  const resetPage = useWorkspace((state) => state.resetPage)
  // What Edit's tab items can act on (BU-282): the current window's tab, and
  // whether anything has been closed to bring back.
  const chosenPane = useCurrentPane((state) => state.byPage[page])
  const paneCount = pagePanes(page).length
  const canClose = useWorkspace((state) => {
    if (paneCount === 0) return false
    const pane = currentPane(chosenPane, state, page, paneCount)
    return activeTab(state, page, pane, paneCount) !== undefined
  })
  const canReopen = useWorkspace((state) => state.closed.length > 0)

  // Only this page's, since a preset names views by kind and the kinds a page
  // can open are its own.
  const presets = useMemo(() => presetsFor(saved, page), [saved, page])

  const classes = ['menu-bar', platform === 'darwin' && 'menu-bar-mac', className]
    .filter(Boolean)
    .join(' ')

  /** Clicking the open panel's own trigger closes it, as a menu should. */
  const toggle = (which: OpenPanel) => () => {
    setPanel((current) => (current === which ? 'none' : which))
  }

  const close = (): void => {
    setPanel('none')
  }

  /*
   * Home has no panes (BU-135).
   *
   * It is a page of its own rather than a pane host, so a layout chosen
   * there is stored and never drawn — the control has to say so rather than
   * accept the click and do nothing.
   */
  const arrangeable = page !== HOME_PAGE_ID
  const served = useServedStore()
  const refreshable = served !== undefined && refreshOf(served).available
  const menus = buildMenus({
    theme: theme.preference,
    layout,
    arrangeable,
    refreshable,
    releaseBuild: isReleaseBuild(),
    engineStarted: engine !== 'idle',
    tabs: { canOpen: paneCount > 0, canClose, canReopen }
  })

  /*
   * Dismissal is owned by the bar, not by each menu.
   *
   * Hovering from one open menu to a sibling has to SWITCH rather than
   * close-and-reopen, so the open menu is one piece of state up here and a
   * dropdown never listens for its own outside click.
   */
  useEffect(() => {
    if (menu === undefined) return undefined

    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return
      if (bar.current?.contains(event.target) === true) return
      setMenu(undefined)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMenu(undefined)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const generate = useGenerateData()
  const refreshStore = useRefreshStore()
  const restoreEditTarget = useEditTarget()

  // Both halves, or it is not a reset: a single pane still holding six tabs
  // is the arrangement you were trying to get out of.
  const resetWindow = (): void => {
    setLayout(page, SINGLE_PANE.id)
    resetPage(page)
  }

  /*
   * View's two shortcuts (BU-274, BU-275), taken before anything else sees
   * them: Electron's default menu binds Ctrl+Shift+R to Force Reload, and a
   * keydown the page has prevented is not passed on to it.
   */
  const shortcuts = useRef({ arrangeable, resetWindow })
  shortcuts.current = { arrangeable, resetWindow }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return
      if (event.code === 'KeyR') {
        event.preventDefault()
        if (shortcuts.current.arrangeable) shortcuts.current.resetWindow()
      } else if (event.code === 'KeyP') {
        event.preventDefault()
        setMenu(undefined)
        setPickingPreset(true)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  const runMenu = (action: MenuAction): void => {
    if (action === 'theme-light') theme.setPreference('light')
    else if (action === 'theme-dark') theme.setPreference('dark')
    else if (action === 'theme-system') theme.setPreference('system')
    else if (action === 'preset-save') onSavePreset?.()
    else if (action === 'manage-sources') onManageSources?.()
    else if (action === 'open-data-folder') onManageSources?.('open-folder')
    else if (action === 'import-data') onManageSources?.('import')
    else if (action === 'generate-data') generate.mutate()
    else if (action === 'refresh-data' && served !== undefined) refreshStore.mutate(served.id)
    else if (action === 'data-preferences') onDataPreferences?.()
    else if (action === 'holding-columns') setChoosingColumns(true)
    else if (action === 'refresh-engine') void window.beacon?.engine.restart()
    else if (action === 'modelling-assumptions') setSettingAssumptions(true)
    else if (action === 'preset-picker') setPickingPreset(true)
    else if (action === 'layout-reset') resetWindow()
    else if (action === 'tab-new') newTabHere(page)
    else if (action === 'tab-close') closeTabHere(page)
    else if (action === 'tab-reopen') reopenLastTab()
    else if (action.startsWith('edit-')) runEdit(action.slice('edit-'.length))
    else if (action.startsWith('layout-')) setLayout(page, action.slice('layout-'.length))
  }

  /** Back to the field or selection the menu was opened over, then the command. */
  const runEdit = (command: string): void => {
    if (!isEditCommand(command)) return
    setMenu(undefined)
    restoreEditTarget()
    void window.beacon?.edit(command)
  }

  return (
    <header className={classes} ref={bar}>
      {/*
        The logo goes Home. Measured rather than assumed: the Home frame's
        sidebar (89:558) highlights no slot, where every workspace page's
        does, so Home is not a sidebar destination — and the logo is the only
        control present in every frame with nothing else to do.
      */}
      <button type="button" className="menu-bar-logo" aria-label="Home" onClick={onGoHome}>
        <LogoBetaIcon size={47} aria-hidden="true" />
      </button>

      <nav className="menu-bar-menus" aria-label="Application menu">
        {menus.map((entry) => (
          <span key={entry.label} className="menu-bar-anchor">
            <button
              type="button"
              className={`menu-bar-menu${menu === entry.label ? ' menu-bar-menu-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={menu === entry.label}
              onClick={() => {
                setMenu((current) => (current === entry.label ? undefined : entry.label))
              }}
              // Standard menu-bar traversal: once one is open, moving across
              // the bar switches menus without a second click.
              onMouseEnter={() => {
                setMenu((current) => (current === undefined ? current : entry.label))
              }}
            >
              {entry.label}
            </button>
            <MenuDropdown
              menu={entry}
              open={menu === entry.label}
              onClose={() => {
                setMenu(undefined)
              }}
              onActivate={runMenu}
            />
          </span>
        ))}
      </nav>

      <ChromeSearch
        {...(onSearch === undefined ? {} : { onSubmit: onSearch })}
        {...(onSelectTab === undefined ? {} : { onSelectTab })}
        {...(onOpenIdentifier === undefined ? {} : { onOpenIdentifier })}
        {...(onOpenView === undefined ? {} : { onOpenView })}
        {...(onOpenIndex === undefined ? {} : { onOpenIndex })}
        {...(onApplyPreset === undefined ? {} : { onApplyPreset })}
        {...(onCreateIndex === undefined ? {} : { onCreateIndex })}
      />

      <div className="menu-bar-cluster">
        <span className="menu-bar-anchor">
          <button
            type="button"
            className={`menu-bar-icon${panel === 'sources' ? ' menu-bar-icon-open' : ''}`}
            aria-label="Data sources"
            aria-expanded={panel === 'sources'}
            aria-haspopup="dialog"
            onClick={toggle('sources')}
          >
            <DataSourcesIcon size={23} />
          </button>
          <DataSourcesPanel
            open={panel === 'sources'}
            onClose={close}
            engine={engine}
            onManage={() => {
              // The data-sources dialog, the same one the Data menu opens.
              // This used to open the settings window AND Data Coverage — the
              // second a leftover BU-145 meant to remove, contradicting the
              // comment above it.
              onManageSources?.()
              close()
            }}
          />
        </span>

        {assistantShips() && (
          <>
            <button
              type="button"
              className="menu-bar-icon"
              aria-label="AI assistant"
              onClick={onToggleAssistant}
            >
              <AiAgentsIcon size={30} />
            </button>
            <span className="menu-bar-rule" />
          </>
        )}

        <span className="menu-bar-anchor">
          <button
            type="button"
            className={`menu-bar-icon${panel === 'layout' ? ' menu-bar-icon-open' : ''}`}
            aria-label="Layout"
            aria-expanded={panel === 'layout'}
            aria-haspopup="dialog"
            disabled={!arrangeable}
            title={arrangeable ? undefined : 'Home has no panes to arrange'}
            onClick={toggle('layout')}
          >
            <WindowFormatIcon size={22} />
          </button>
          <LayoutMenu
            open={panel === 'layout'}
            onClose={close}
            value={layout}
            onSelect={(id) => {
              setLayout(page, id)
            }}
            presets={presets}
            onApplyPreset={applyPreset}
          />
        </span>

        <span className="menu-bar-rule" />
        <WindowControls />
      </div>
      {settingAssumptions && (
        <ModellingAssumptionsDialog
          onClose={() => {
            setSettingAssumptions(false)
          }}
        />
      )}
      {pickingPreset && (
        <PresetPicker
          arrangeable={arrangeable}
          presets={presets}
          onApplyPreset={applyPreset}
          onClose={() => {
            setPickingPreset(false)
          }}
        />
      )}
      {choosingColumns && (
        <HoldingColumnsDialog
          onClose={() => {
            setChoosingColumns(false)
          }}
        />
      )}
    </header>
  )
}

function isEditCommand(command: string): command is EditCommand {
  return (EDIT_COMMANDS as readonly string[]).includes(command)
}
