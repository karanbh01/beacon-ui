import type { ReactElement } from 'react'
import {
  AiAgentsIcon,
  ChevronIcon,
  DataSourcesIcon,
  LogoBetaIcon,
  WindowFormatIcon
} from '../icons/generated'
import { MENUS } from './pages'
import { WindowControls } from './WindowControls'
import './MenuBar.css'

export interface MenuBarProps {
  onSearch?: (query: string) => void
  onToggleAssistant?: () => void
  onOpenDataSources?: () => void
  onOpenLayout?: () => void
  /** process.platform, so macOS can leave room for its traffic lights. */
  platform?: string
  className?: string
}

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
  onOpenDataSources,
  onOpenLayout,
  platform,
  className
}: MenuBarProps): ReactElement {
  const classes = ['menu-bar', platform === 'darwin' && 'menu-bar-mac', className]
    .filter(Boolean)
    .join(' ')

  return (
    <header className={classes}>
      <div className="menu-bar-logo">
        <LogoBetaIcon size={47} aria-label="Beacon" />
      </div>

      <nav className="menu-bar-menus" aria-label="Application menu">
        {MENUS.map((menu) => (
          <button key={menu} type="button" className="menu-bar-menu">
            {menu}
          </button>
        ))}
      </nav>

      <div className="menu-bar-search">
        <input
          type="search"
          aria-label="Search"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSearch?.(event.currentTarget.value)
          }}
        />
        {/* Inside the field, per 81:2 — the divider and arrow sit within the
            field's own box, not out in the icon cluster. */}
        <span className="menu-bar-search-divider" aria-hidden="true" />
        <button type="button" className="menu-bar-search-chevron" aria-label="Search options">
          <ChevronIcon size={24} />
        </button>
      </div>

      <div className="menu-bar-cluster">
        <button
          type="button"
          className="menu-bar-icon"
          aria-label="Data sources"
          onClick={onOpenDataSources}
        >
          <DataSourcesIcon size={23} />
        </button>
        <button
          type="button"
          className="menu-bar-icon"
          aria-label="AI assistant"
          onClick={onToggleAssistant}
        >
          <AiAgentsIcon size={30} />
        </button>
        <span className="menu-bar-rule" />
        <button type="button" className="menu-bar-icon" aria-label="Layout" onClick={onOpenLayout}>
          <WindowFormatIcon size={22} />
        </button>
        <span className="menu-bar-rule" />
        <WindowControls />
      </div>
    </header>
  )
}
