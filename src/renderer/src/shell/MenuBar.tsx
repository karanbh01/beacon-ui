import { useState, type ReactElement } from 'react'
import type { EngineStatus } from '@shared/ipc'
import { AiAgentsIcon, DataSourcesIcon, LogoBetaIcon, WindowFormatIcon } from '../icons/generated'
import { layoutFor, useChrome } from '../state/chrome'
import { ChromeSearch } from './chrome/ChromeSearch'
import { DataSourcesPanel } from './chrome/DataSourcesPanel'
import { LayoutMenu } from './chrome/LayoutMenu'
import { HOME_PAGE_ID, MENUS } from './pages'
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
  onCreateIndex?: (name: string) => void
  /** The logo is how Home is reached — see HomeView. */
  onGoHome?: () => void
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
  onCreateIndex,
  onGoHome,
  page = HOME_PAGE_ID,
  platform,
  className
}: MenuBarProps): ReactElement {
  const [panel, setPanel] = useState<OpenPanel>('none')
  const layout = useChrome((state) => layoutFor(state.layoutByPage, page))
  const setLayout = useChrome((state) => state.setLayout)

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

  return (
    <header className={classes}>
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
        {MENUS.map((menu) => (
          <button key={menu} type="button" className="menu-bar-menu">
            {menu}
          </button>
        ))}
      </nav>

      <ChromeSearch
        {...(onSearch === undefined ? {} : { onSubmit: onSearch })}
        {...(onSelectTab === undefined ? {} : { onSelectTab })}
        {...(onOpenIdentifier === undefined ? {} : { onOpenIdentifier })}
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
            onManage={() => onManageSources?.()}
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
          />
        </span>

        <span className="menu-bar-rule" />
        <WindowControls />
      </div>
    </header>
  )
}
