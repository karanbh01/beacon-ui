import type { ReactElement } from 'react'
import { GUIDES_PAGE, SIDEBAR_PAGES, type SidebarPage } from './pages'
import './Sidebar.css'

export interface SidebarProps {
  activeId?: string
  onSelect?: (id: string) => void
  pages?: readonly SidebarPage[]
  className?: string
}

function SidebarButton({
  page,
  active,
  onSelect
}: {
  page: SidebarPage
  active: boolean
  onSelect?: (id: string) => void
}): ReactElement {
  const { Icon } = page
  return (
    <button
      type="button"
      className={active ? 'sidebar-item sidebar-active' : 'sidebar-item'}
      aria-label={page.label}
      aria-current={active ? 'page' : undefined}
      title={page.label}
      onClick={() => {
        onSelect?.(page.id)
      }}
    >
      <Icon size={31} />
    </button>
  )
}

/** Figma 80:340. 58px wide, 0.5px right rule, 48px slots at 27px spacing. */
export function Sidebar({
  activeId,
  onSelect,
  pages = SIDEBAR_PAGES,
  className
}: SidebarProps): ReactElement {
  const select = onSelect === undefined ? {} : { onSelect }
  return (
    <nav className={['sidebar', className].filter(Boolean).join(' ')} aria-label="Sections">
      <div className="sidebar-sections">
        {pages.map((page) => (
          <SidebarButton key={page.id} page={page} active={page.id === activeId} {...select} />
        ))}
      </div>
      {/* Guides sits at the foot, separated by justify-between, not a rule. */}
      <SidebarButton page={GUIDES_PAGE} active={GUIDES_PAGE.id === activeId} {...select} />
    </nav>
  )
}
