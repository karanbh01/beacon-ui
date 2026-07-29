import type { ReactElement } from 'react'
import { Tab } from '../components/Tab/Tab'
import { TabBar } from '../components/Tab/TabBar'
import { resolveSubject, tabsForPage } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { chipFor } from './chips'
import { MissingView } from './MissingView'
import { getView } from './viewRegistry'
import './PaneHost.css'

export interface PaneHostProps {
  page: string
  onNewTab?: () => void
}

/**
 * Renders one page's tab strip and its active view.
 *
 * Per-page tab sets and the active tab both live in the BU-16 store, so
 * switching pages restores what was open there — the host holds no state of
 * its own beyond what it reads.
 */
export function PaneHost({ page, onNewTab }: PaneHostProps): ReactElement {
  const state = useWorkspace()
  const tabs = tabsForPage(state, page)
  const activeId = state.activeByPage[page]
  const active = tabs.find((tab) => tab.id === activeId)
  const View = active === undefined ? undefined : (getView(active.viewKind) ?? MissingView)

  return (
    <div className="pane-host">
      <TabBar
        activeIndex={tabs.findIndex((tab) => tab.id === activeId)}
        {...(onNewTab === undefined ? {} : { onNewTab })}
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
          <p className="pane-empty type-11">No tabs open on this page.</p>
        ) : (
          <View tab={active} subject={resolveSubject(state, active)} />
        )}
      </div>
    </div>
  )
}
