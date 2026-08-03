import { useState, type ReactElement } from 'react'
import { Tab } from '../components/Tab/Tab'
import { TabBar } from '../components/Tab/TabBar'
import { resolveSubject, tabsForPage } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { chipFor } from './chips'
import { MissingView } from './MissingView'
import { NewTabMenu } from './NewTabMenu'
import { newTabOptions, tabForOption } from './newTabOptions'
import { SIDEBAR_PAGES } from './pages'
import { getView, viewsForPage } from './viewRegistry'
import './PaneHost.css'

export interface PaneHostProps {
  page: string
}

function pageLabel(page: string): string {
  return SIDEBAR_PAGES.find((entry) => entry.id === page)?.label ?? page
}

/**
 * Renders one page's tab strip and its active view.
 *
 * Per-page tab sets and the active tab both live in the BU-16 store, so
 * switching pages restores what was open there — the host holds no state of
 * its own beyond whether the new-tab menu is showing.
 */
export function PaneHost({ page }: PaneHostProps): ReactElement {
  const state = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)

  const tabs = tabsForPage(state, page)
  const activeId = state.activeByPage[page]
  const active = tabs.find((tab) => tab.id === activeId)
  const View = active === undefined ? undefined : (getView(active.viewKind) ?? MissingView)
  const options = newTabOptions(viewsForPage(page), tabs)

  return (
    <div className="pane-host">
      <TabBar
        activeIndex={tabs.findIndex((tab) => tab.id === activeId)}
        onNewTab={() => {
          setMenuOpen((open) => !open)
        }}
        newTabMenu={
          <NewTabMenu
            open={menuOpen}
            onClose={() => {
              setMenuOpen(false)
            }}
            options={options}
            onChoose={(option) => {
              state.openTab(tabForOption(option, page, tabs))
            }}
          />
        }
      >
        {tabs.map((tab) => {
          const subject = resolveSubject(state, tab)
          const chip = chipFor(tab, subject)
          return (
            <Tab
              key={tab.id}
              label={tab.title}
              active={tab.id === activeId}
              dirty={tab.dirty}
              {...(chip === undefined ? {} : { chip })}
              onSelect={() => {
                state.selectTab(tab.id)
              }}
              onClose={() => {
                state.closeTab(tab.id)
              }}
            />
          )
        })}
      </TabBar>

      <div className="pane-body">
        {active === undefined || View === undefined ? (
          /*
           * The first thing a new user sees on every page since BU-59 removed
           * the seeded tabs — so it says what the page is for and points at
           * the control that does something, rather than reporting a count of
           * zero.
           */
          <div className="pane-empty">
            <p className="pane-empty-title type-section-label">{pageLabel(page)}</p>
            <p className="pane-empty-body type-11">
              Nothing open here yet. Use <span className="pane-empty-key">+</span> in the tab strip
              to open a view — {options.length} available on this page.
            </p>
          </div>
        ) : (
          <View tab={active} subject={resolveSubject(state, active)} />
        )}
      </div>
    </div>
  )
}
