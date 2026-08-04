import { useEffect } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { PaneHeader } from '../components/PaneHeader/PaneHeader'
import { Tab, type TabChip } from '../components/Tab/Tab'
import { TabBar } from '../components/Tab/TabBar'
import { useWorkspace } from './tabs.store'
import { resolveSubject, tabsForPage } from './tabs.logic'
import type { Tab as TabModel } from './tabs.types'

const meta: Meta = { title: 'Shell/Workspace (BU-16)' }
export default meta
type Story = StoryObj

const PAGE = 'data-explorer'

/** Maps an archetype to its chip. BU-17 will own this for real. */
function chipFor(tab: TabModel, subject: string | undefined): TabChip | undefined {
  if (tab.archetype === 'pinned' && tab.pinnedDoc !== undefined) {
    return { kind: 'pin', target: tab.pinnedDoc }
  }
  if (subject === undefined) return undefined
  if (tab.archetype === 'linked') return { kind: 'query', subject, linked: true }
  if (tab.archetype === 'query') return { kind: 'query', subject }
  return undefined
}

/**
 * BU-16 acceptance: a two-tab demo showing live link-follow and sever.
 *
 * Type in the Prices field and press Enter — Charting's chip follows.
 * Then type in Charting: its chain drops and it becomes independent.
 */
export const LinkFollowAndSever: Story = {
  render: function WorkspaceDemo() {
    const store = useWorkspace()

    useEffect(() => {
      store.reset()
      store.openTab({
        id: 'prices',
        page: PAGE,
        viewKind: 'prices',
        archetype: 'query',
        title: 'Prices',
        subject: 'AAPL'
      })
      store.openTab({
        id: 'charting',
        page: PAGE,
        viewKind: 'charting',
        archetype: 'linked',
        title: 'Charting',
        linkSourceId: 'prices'
      })
      store.selectTab('prices')
      // Intentionally once, on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const tabs = tabsForPage(store, PAGE)
    const activeId = store.activeByPane[PAGE]
    const active = tabs.find((tab) => tab.id === activeId)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <TabBar activeIndex={tabs.findIndex((tab) => tab.id === activeId)}>
          {tabs.map((tab) => {
            const subject = resolveSubject(store, tab)
            const chip = chipFor(tab, subject)
            return (
              <Tab
                key={tab.id}
                label={tab.title}
                active={tab.id === activeId}
                {...(chip === undefined ? {} : { chip })}
                onSelect={() => {
                  store.selectTab(tab.id)
                }}
                onClose={() => {
                  store.closeTab(tab.id)
                }}
              />
            )
          })}
        </TabBar>

        {active !== undefined && (
          <PaneHeader
            kind="query"
            subject={resolveSubject(store, active) ?? ''}
            {...(active.archetype === 'linked' ? { linkedTo: 'Prices' } : {})}
            meta={`${active.title} · ${active.archetype}`}
            onQuery={(next) => {
              store.setSubject(active.id, next)
            }}
            onSever={() => {
              store.severLink(active.id)
            }}
          />
        )}

        <table className="type-11" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {tabs.map((tab) => (
              <tr key={tab.id}>
                <td style={{ padding: '4px 16px 4px 0', color: 'var(--text-muted)' }}>
                  {tab.title}
                </td>
                <td style={{ padding: '4px 16px 4px 0' }}>{tab.archetype}</td>
                <td style={{ padding: '4px 0', color: 'var(--accent)' }}>
                  {resolveSubject(store, tab) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="type-11" style={{ color: 'var(--text-muted)', margin: 0 }}>
          Select Prices, type a ticker, press Enter — Charting follows. Then select Charting and
          type: the chain drops and it becomes an independent query view.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-default"
            onClick={() => {
              store.reopenTab()
            }}
          >
            Reopen closed tab
          </button>
        </div>
      </div>
    )
  }
}
