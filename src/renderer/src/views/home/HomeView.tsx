import { useState, type ReactElement } from 'react'
import { Dialog } from '../../components/Dialog/Dialog'
import {
  BlockchainIcon,
  CubeIcon,
  FolderOpenIcon,
  LayersIcon,
  LineChartIcon,
  type IconProps
} from '../../icons/generated'
import { GUIDES, QUICKSTART, formatHomeDate } from './homeContent'
import { GuideFigure } from './GuideFigure'
import { HomeBanner } from './HomeBanner'
import { ReleaseList, type ReleaseListProps } from './ReleaseList'
import { RecentActivity, type Activity } from './RecentActivity'
import './HomeView.css'
import { pageShips } from '../../shell/release'

const GLYPHS: Record<string, (props: IconProps) => ReactElement> = {
  layers: LayersIcon,
  'line-chart': LineChartIcon,
  cube: CubeIcon,
  'folder-open': FolderOpenIcon,
  blockchain: BlockchainIcon
}

export interface HomeViewProps {
  /** Passed in rather than read off the clock, so this renders on a fixed day. */
  today: Date
  activity: readonly Activity[]
  onQuickstart: (page: string, tab: string) => void
  onOpenActivity?: (id: string) => void
  /** The app's and the engine's versions, for the changelog's `current`. */
  running?: ReleaseListProps['running']
  /** The running engine's own releases, once it answers (BU-221). */
  engineChangelog?: ReleaseListProps['engine']
}

/**
 * Figma 7:113 (frames 2:3 light, 4:8 dark).
 *
 * Home is NOT a sidebar page: measured against the frame, its Sidebar
 * instance highlights no slot at all, where every workspace page's does. It
 * is reached from the logo instead, which is the only control present in
 * every frame and unaccounted for. The brief said otherwise; the frame won.
 */
export function HomeView({
  today,
  activity,
  onQuickstart,
  onOpenActivity,
  running,
  engineChangelog
}: HomeViewProps): ReactElement {
  const [changelogOpen, setChangelogOpen] = useState(false)

  return (
    <div className="home">
      <HomeBanner date={formatHomeDate(today)} />

      {/*
       * Recent Activity on the left; Quickstart above a short Changelog on
       * the right (Karan, 2026-10-19), the whole changelog in a pop-up.
       */}
      <div className="home-band">
        <div className="home-main">
          <RecentActivity
            activity={activity}
            {...(onOpenActivity === undefined ? {} : { onOpen: onOpenActivity })}
          />
        </div>

        <div className="home-side">
          <Quickstart onQuickstart={onQuickstart} />
          <section className="home-section home-changelog">
            <h2 className="type-section-label home-label">Changelog</h2>
            <ReleaseList
              running={running ?? {}}
              engine={engineChangelog}
              fit
              footer={
                <button
                  type="button"
                  className="home-changelog-more"
                  onClick={() => {
                    setChangelogOpen(true)
                  }}
                >
                  Full changelog
                </button>
              }
            />
          </section>
        </div>
      </div>

      {changelogOpen && (
        <Dialog
          title="Changelog"
          width={640}
          onClose={() => {
            setChangelogOpen(false)
          }}
        >
          <ReleaseList running={running ?? {}} engine={engineChangelog} />
        </Dialog>
      )}

      <section className="home-section home-guides">
        <h2 className="type-section-label home-label">Guides</h2>
        <div className="home-guide-cards">
          {GUIDES.map((guide) => (
            <article key={guide.title} className="home-guide-card">
              <p className="home-guide-title">{guide.title}</p>
              <p className="home-guide-subtitle">{guide.subtitle}</p>
              <GuideFigure kind={guide.figure} />
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function Quickstart({
  onQuickstart
}: {
  onQuickstart: (page: string, tab: string) => void
}): ReactElement {
  return (
    <section className="home-section">
      <h2 className="type-section-label home-label">Quickstart</h2>
      <ul className="home-quickstart">
        {QUICKSTART.filter((action) => pageShips(action.page)).map((action) => {
          const Glyph = GLYPHS[action.icon]
          return (
            <li key={action.id}>
              <button
                type="button"
                className="home-quickstart-item"
                onClick={() => {
                  onQuickstart(action.page, action.tab)
                }}
              >
                {Glyph !== undefined && <Glyph size={16} aria-hidden="true" />}
                <span>{action.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
