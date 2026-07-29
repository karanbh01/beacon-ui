import type { ReactElement, ReactNode } from 'react'
import { Footer, type FooterProps } from './Footer'
import { MenuBar, type MenuBarProps } from './MenuBar'
import { Sidebar, type SidebarProps } from './Sidebar'
import './AppShell.css'

export interface AppShellProps {
  children: ReactNode
  sidebar?: SidebarProps
  menuBar?: MenuBarProps
  footer?: FooterProps
  /** Right rail, 380px when open (BU-18). */
  assistant?: ReactNode
  className?: string
}

/**
 * The three chrome bands plus the pane, at the geometry the Figma frames use:
 * menu bar 62, sidebar 58, footer 32.
 *
 * Those numbers live in AppShell.css rather than as inline styles so BU-17's
 * pane host can position against them without threading props.
 */
export function AppShell({
  children,
  sidebar,
  menuBar,
  footer,
  assistant,
  className
}: AppShellProps): ReactElement {
  return (
    <div className={['app-shell', className].filter(Boolean).join(' ')}>
      <MenuBar {...menuBar} />
      <div className="app-shell-middle">
        <Sidebar {...sidebar} />
        <main className="app-shell-pane">{children}</main>
        {assistant !== undefined && <aside className="app-shell-assistant">{assistant}</aside>}
      </div>
      <Footer {...footer} />
    </div>
  )
}
