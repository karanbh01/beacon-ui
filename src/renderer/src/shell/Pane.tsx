import { useState, type CSSProperties, type ReactElement } from 'react'
import { Tab } from '../components/Tab/Tab'
import { TabBar } from '../components/Tab/TabBar'
import { activeTab, resolveSubject, tabsForPage, tabsForPane } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { chipFor } from './chips'
import { MissingView } from './MissingView'
import { NewTabMenu } from './NewTabMenu'
import { newTabOptions, tabForOption } from './newTabOptions'
import { SIDEBAR_PAGES } from './pages'
import { getView, viewsForPage } from './viewRegistry'

export interface PaneProps {
  page: string
  /** Index within the current layout, 0-based. */
  index: number
  paneCount: number
  style?: CSSProperties
}

function pageLabel(page: string): string {
  return SIDEBAR_PAGES.find((entry) => entry.id === page)?.label ?? page
}

/**
 * One pane: its own tab strip, its own `+`, its own active view (BU-55).
 *
 * Each pane is a complete workspace rather than a viewport onto a shared one,
 * which is what the taxonomy's linked-tab grammar wants — a Charting tab
 * beside the Prices tab it follows is the obvious use of a split.
 *
 * The `+` menu is gated on the whole PAGE, not on this pane: a linked view
 * needs a query tab to follow, and one in the pane next door is exactly the
 * arrangement being built.
 */
export function Pane({ page, index, paneCount, style }: PaneProps): ReactElement {
  const state = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)

  const tabs = tabsForPane(state, page, index, paneCount)
  const active = activeTab(state, page, index, paneCount)
  const View = active === undefined ? undefined : (getView(active.viewKind) ?? MissingView)
  const options = newTabOptions(viewsForPage(page), tabsForPage(state, page))

  return (
    <div className="pane" style={style} data-pane={index}>
      <TabBar
        activeIndex={tabs.findIndex((tab) => tab.id === active?.id)}
        onNewTab={() => {
          setMenuOpen((open) => !open)
        }}
        onDropTab={(id, at) => {
          state.moveTab(id, index, at, paneCount)
        }}
        newTabMenu={
          <NewTabMenu
            open={menuOpen}
            onClose={() => {
              setMenuOpen(false)
            }}
            options={options}
            onChoose={(option) => {
              state.openTab({
                ...tabForOption(option, page, tabsForPage(state, page)),
                pane: index
              })
            }}
          />
        }
      >
        {tabs.map((tab) => {
          const chip = chipFor(tab, resolveSubject(state, tab))
          return (
            <Tab
              key={tab.id}
              label={tab.title}
              active={tab.id === active?.id}
              dirty={tab.dirty}
              dragId={tab.id}
              {...(chip === undefined ? {} : { chip })}
              onSelect={() => {
                state.selectTab(tab.id, index)
              }}
              onClose={() => {
                state.closeTab(tab.id, index, paneCount)
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
           * zero. A pane that loses its last tab lands back here rather than
           * collapsing the layout under the user.
           */
          <div className="pane-empty">
            <p className="pane-empty-title type-section-label">{pageLabel(page)}</p>
            <p className="pane-empty-body type-11">
              Nothing open here yet. Use <span className="pane-empty-key">+</span> in the tab strip
              to open a view — {options.length} available on this page.
            </p>
          </div>
        ) : (
          <View tab={active} subject={resolveSubject(state, active)} pane={index} />
        )}
      </div>
    </div>
  )
}
