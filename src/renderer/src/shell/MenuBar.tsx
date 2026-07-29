import type { ReactElement, ReactNode } from 'react'
import {
  AiAgentsIcon,
  ChevronIcon,
  DataSourcesIcon,
  LogoBetaIcon,
  WindowFormatIcon
} from '../icons/generated'
import { MENUS } from './pages'
import './MenuBar.css'

export interface MenuBarProps {
  onSearch?: (query: string) => void
  onToggleAssistant?: () => void
  onOpenDataSources?: () => void
  onOpenLayout?: () => void
  /** Extra controls, e.g. the theme switch while there is no Settings menu. */
  extra?: ReactNode
  className?: string
}

/**
 * Figma 81:2. 62px tall, 0.5px bottom rule, 479px search field.
 *
 * HTML menus for now, per BU-15 — these are buttons that will grow real
 * dropdowns. Native application menus are a separate concern in src/main.
 *
 * Deliberately omits the window minimise/maximise/close controls the Figma
 * bar carries at its right edge. Those assume a frameless window; BU-3 chose
 * a standard frame, so the OS draws them. They arrive with #37.
 */
export function MenuBar({
  onSearch,
  onToggleAssistant,
  onOpenDataSources,
  onOpenLayout,
  extra,
  className
}: MenuBarProps): ReactElement {
  return (
    <header className={['menu-bar', className].filter(Boolean).join(' ')}>
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
      </div>

      <div className="menu-bar-cluster">
        <button type="button" className="menu-bar-icon" aria-label="History">
          <ChevronIcon size={24} />
        </button>
        <span className="menu-bar-rule menu-bar-rule-tall" />
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
        {extra !== undefined && <span className="menu-bar-rule" />}
        {extra}
      </div>
    </header>
  )
}
