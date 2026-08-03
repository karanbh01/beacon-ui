import type { ReactElement } from 'react'
import {
  BlockchainIcon,
  CubeIcon,
  FolderOpenIcon,
  LayersIcon,
  LineChartIcon,
  type IconProps
} from '../../icons/generated'
import { StatusPill } from '@/components/Badge/Badge'
import { CHANGELOG, GUIDES, QUICKSTART, formatHomeDate } from './homeContent'
import { RecentActivity, type Activity } from './RecentActivity'
import './HomeView.css'

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
  onOpenActivity
}: HomeViewProps): ReactElement {
  return (
    <div className="home">
      <header className="home-header">
        <h1 className="home-title type-page-title">Home</h1>
        <p className="home-date">{formatHomeDate(today)}</p>
      </header>

      <div className="home-band">
        <div className="home-main">
          <section className="home-section">
            <h2 className="type-section-label home-label">Quickstart</h2>
            <ul className="home-quickstart">
              {QUICKSTART.map((action) => {
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

          <RecentActivity
            activity={activity}
            {...(onOpenActivity === undefined ? {} : { onOpen: onOpenActivity })}
          />
        </div>

        <section className="home-section home-changelog">
          <h2 className="type-section-label home-label">Changelog</h2>
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="home-changelog-entry">
              <p className="home-changelog-version">
                {entry.version}
                {entry.pill !== undefined && (
                  <StatusPill status={entry.pill.status}>{entry.pill.label}</StatusPill>
                )}
              </p>
              <p className="home-changelog-summary">{entry.summary}</p>
            </div>
          ))}
        </section>
      </div>

      <section className="home-section home-guides">
        <h2 className="type-section-label home-label">Guides</h2>
        <div className="home-guide-cards">
          {GUIDES.map((guide) => (
            <article key={guide.title} className="home-guide-card">
              <p className="home-guide-title">{guide.title}</p>
              <p className="home-guide-subtitle">{guide.subtitle}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
