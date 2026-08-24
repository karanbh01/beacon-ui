import { useRef, useState, type CSSProperties, type DragEvent, type ReactElement } from 'react'
import { Tab } from '../components/Tab/Tab'
import { TabBar } from '../components/Tab/TabBar'
import { carriesTab, paneDropTarget, TAB_MIME, type DropTarget } from '../components/Tab/dragTab'
import { activeTab, resolveSubject, tabsForPage, tabsForPane } from '../state/tabs.logic'
import { useWorkspace } from '../state/tabs.store'
import { chipFor } from './chips'
import { TabLinkMenu } from './TabLinkMenu'
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
  const [drop, setDrop] = useState<DropTarget | undefined>(undefined)
  /**
   * Which tab's link menu is open, and where its chip is (BU-108).
   *
   * Drawn at pane level rather than inside the tab: `.tab-bar` hides
   * overflow-y so it can scroll sideways, which clips anything hanging below
   * a tab. The menu is invisible in there, and no amount of z-index helps.
   */
  const [linking, setLinking] = useState<{ tabId: string; left: number; top: number } | undefined>(
    undefined
  )
  const host = useRef<HTMLDivElement>(null)
  /**
   * How deep into this pane's subtree the drag currently is.
   *
   * `dragleave` also fires on the way INTO a child, which is the classic way
   * a drop affordance ends up flickering. Counting enter against leave is the
   * fix that does not depend on `relatedTarget` — which Chromium supplies and
   * jsdom does not, so a guard built on it would be untestable here.
   */
  const depth = useRef(0)

  const tabs = tabsForPane(state, page, index, paneCount)
  const active = activeTab(state, page, index, paneCount)
  const View = active === undefined ? undefined : (getView(active.viewKind) ?? MissingView)
  const options = newTabOptions(viewsForPage(page), tabsForPage(state, page))

  /** Measured live: tabs move, the strip scrolls, and a drag is not a render. */
  const targetAt = (x: number, y: number): DropTarget => {
    const strip = host.current?.querySelector('.tab-bar-strip')
    const bar = host.current?.querySelector('.tab-bar')?.getBoundingClientRect()
    const rects = [...(strip?.querySelectorAll('.tab') ?? [])].map((node) =>
      node.getBoundingClientRect()
    )

    const target = paneDropTarget(bar, rects, x, y)
    if (target.markerX === undefined || strip === null || strip === undefined) return target
    // The marker is drawn inside the strip, which scrolls.
    return {
      index: target.index,
      markerX: target.markerX - strip.getBoundingClientRect().left + strip.scrollLeft
    }
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!carriesTab([...event.dataTransfer.types])) return
    // Without this the browser refuses the drop and falls back to its default
    // handling, which for a drag it does not recognise is to do nothing.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDrop(targetAt(event.clientX, event.clientY))
  }

  const clear = (): void => {
    depth.current = 0
    setDrop(undefined)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    const id = event.dataTransfer.getData(TAB_MIME)
    clear()
    if (id === '') return
    event.preventDefault()

    const target = targetAt(event.clientX, event.clientY)
    // Landing on the body of the pane a tab already lives in means nothing —
    // there is no position being expressed, so moving it to the end would be
    // the app inventing an instruction. On the strip a reorder IS meaningful.
    const here = tabs.some((tab) => tab.id === id)
    if (here && target.markerX === undefined) return

    state.moveTab(id, index, target.index, paneCount)
  }

  return (
    <div
      className="pane"
      ref={host}
      style={style}
      data-pane={index}
      data-dropping={drop !== undefined}
      onDragEnter={(event) => {
        if (carriesTab([...event.dataTransfer.types])) depth.current += 1
      }}
      onDragOver={onDragOver}
      onDragLeave={() => {
        depth.current -= 1
        if (depth.current <= 0) clear()
      }}
      onDrop={onDrop}
    >
      <TabBar
        activeIndex={tabs.findIndex((tab) => tab.id === active?.id)}
        onNewTab={() => {
          setMenuOpen((open) => !open)
        }}
        {...(drop?.markerX === undefined ? {} : { dropMarkerX: drop.markerX })}
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
          // Both ends of a link wear the chain (BU-108), so a tab needs to
          // know whether anything follows it, not only whether it follows.
          const isSource = state.tabs.some((other) => other.linkSourceId === tab.id)
          const inLink = isSource || tab.archetype === 'linked'
          const chip = chipFor(tab, resolveSubject(state, tab), isSource)
          return (
            <Tab
              key={tab.id}
              label={tab.title}
              active={tab.id === active?.id}
              dirty={tab.dirty}
              dragId={tab.id}
              {...(chip === undefined ? {} : { chip })}
              {...(inLink
                ? {
                    onUnlink: () => {
                      state.unlinkTab(tab.id)
                      setLinking(undefined)
                    }
                  }
                : {})}
              {...(chip === undefined
                ? {}
                : {
                    onChipClick: (anchor: DOMRect) => {
                      if (linking?.tabId === tab.id) {
                        setLinking(undefined)
                        return
                      }
                      const pane = host.current?.getBoundingClientRect()
                      setLinking({
                        tabId: tab.id,
                        left: anchor.left - (pane?.left ?? 0),
                        top: anchor.bottom - (pane?.top ?? 0) + 4
                      })
                    }
                  })}
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

      {/* Outside the strip, which clips: see the note on `linking`. */}
      {linking !== undefined && (
        <TabLinkMenu
          tabId={linking.tabId}
          left={linking.left}
          top={linking.top}
          onClose={() => {
            setLinking(undefined)
          }}
        />
      )}

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
