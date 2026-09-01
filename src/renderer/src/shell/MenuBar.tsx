import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { EngineStatus } from '@shared/ipc'
import { AiAgentsIcon, DataSourcesIcon, LogoBetaIcon, WindowFormatIcon } from '../icons/generated'
import { layoutFor, SINGLE_PANE, useChrome } from '../state/chrome'
import { presetsFor, usePresets } from '../state/presets'
import { useCoverage } from '../views/shared/queries'
import { useWorkspace } from '../state/tabs.store'
import { useTheme } from '../state/theme'
import { ChromeSearch } from './chrome/ChromeSearch'
import { DataSourcesPanel } from './chrome/DataSourcesPanel'
import { LayoutMenu } from './chrome/LayoutMenu'
import { MenuDropdown } from './chrome/MenuDropdown'
import { buildMenus, type MenuAction } from './chrome/menuModel'
import { HOME_PAGE_ID } from './pages'
import type { ViewOption } from './viewRegistry'
import { WindowControls } from './WindowControls'
import './MenuBar.css'

export interface MenuBarProps {
  onSearch?: (query: string) => void
  onToggleAssistant?: () => void
  /** Engine status, so the data sources panel can tell the truth. */
  engine?: EngineStatus
  /** Opens the pane that reports coverage, from `Manage sources…`. */
  onManageSources?: () => void
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
  /** Which top-level menu is open, by label. Only one at a time (BU-76). */
  const [menu, setMenu] = useState<string | undefined>(undefined)
  const bar = useRef<HTMLElement>(null)
  const theme = useTheme()
  const layout = useChrome((state) => layoutFor(state.layoutByPage, page))
  const setLayout = useChrome((state) => state.setLayout)
  const saved = usePresets((state) => state.presets)
  const applyPreset = usePresets((state) => state.apply)
  const resetPage = useWorkspace((state) => state.resetPage)

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
  /*
   * The engine's datasets, for the Data menu's import rows (BU-146).
   *
   * The same query Data Coverage reads, so the menu and the pane cannot
   * disagree about what this engine carries.
   */
  const coverage = useCoverage()
  const datasets = useMemo(
    () =>
      (coverage.data?.datasets ?? []).map((entry) => ({
        id: entry.dataset,
        label: entry.dataset.replace(/[_-]/g, ' ')
      })),
    [coverage.data]
  )

  const menus = buildMenus({ theme: theme.preference, layout, arrangeable, datasets })

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

  const runMenu = (action: MenuAction): void => {
    if (action === 'theme-light') theme.setPreference('light')
    else if (action === 'theme-dark') theme.setPreference('dark')
    else if (action === 'theme-system') theme.setPreference('system')
    else if (action === 'preset-save') onSavePreset?.()
    else if (action === 'manage-sources') void window.beacon?.data.openSettingsWindow()
    else if (action === 'layout-reset') {
      // Both halves, or it is not a reset: a single pane still holding six
      // tabs is the arrangement you were trying to get out of.
      setLayout(page, SINGLE_PANE.id)
      resetPage(page)
    } else if (action.startsWith('layout-')) setLayout(page, action.slice('layout-'.length))
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
              // The settings window, not Data Coverage (BU-145). Coverage was
              // the nearest true answer when nothing else existed; the store
              // location and the synthetic-data choice live here.
              void window.beacon?.data.openSettingsWindow()
              onManageSources?.()
              close()
            }}
          />
        </span>

        <button
          type="button"
          className="menu-bar-icon"
          aria-label="AI assistant"
          onClick={onToggleAssistant}
        >
          <AiAgentsIcon size={30} />
        </button>
        <span className="menu-bar-rule" />

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
    </header>
  )
}
