import type { ComponentType } from 'react'
import {
  BlockchainIcon,
  CubeIcon,
  FolderOpenIcon,
  GridIcon,
  LayersIcon,
  LineChartIcon,
  OpenBookIcon,
  type IconProps
} from '../icons/generated'

export interface SidebarPage {
  id: string
  label: string
  Icon: ComponentType<IconProps>
  /** False where the label is inferred rather than read off a Figma frame. */
  confirmed: boolean
}

/**
 * Sidebar sections, Figma 80:340.
 *
 * The sidebar carries glyphs only, so nothing in the file names these pages.
 * Three are CONFIRMED by screenshotting the sidebar inside a known frame and
 * seeing which slot carries the active wash:
 *
 *   slot 1  grid         Data Explorer      (frame 234:4404)
 *   slot 2  line-chart   Beacon View        (frame 234:8574)
 *   slot 4  layers       Strategy Builder   (frame 89:734)
 *
 * Slots 3, 5 and 6 are INFERRED from iconography. They map to Optimiser,
 * Derivatives and Reports in some order, and those are exactly the three
 * Figma pages that have not been shared, so there is no frame to check them
 * against. Confirm before BU-30/31/32 build on them.
 *
 * Also settled here: Home is NOT a sidebar page. Its frame (89:558) shows no
 * active slot at all, so it is reached another way — most likely the logo.
 * An earlier version of this list put Home in slot 1, which is why
 * Derivatives appeared to have nowhere to live.
 */
export const SIDEBAR_PAGES: readonly SidebarPage[] = [
  { id: 'data-explorer', label: 'Data Explorer', Icon: GridIcon, confirmed: true },
  { id: 'beacon-view', label: 'Beacon View', Icon: LineChartIcon, confirmed: true },
  { id: 'derivatives', label: 'Derivatives', Icon: CubeIcon, confirmed: false },
  { id: 'strategy-builder', label: 'Strategy Builder', Icon: LayersIcon, confirmed: true },
  { id: 'optimiser', label: 'Optimiser', Icon: BlockchainIcon, confirmed: false },
  { id: 'reports', label: 'Reports', Icon: FolderOpenIcon, confirmed: false }
]

export const GUIDES_PAGE: SidebarPage = {
  id: 'guides',
  label: 'Guides',
  Icon: OpenBookIcon,
  confirmed: true
}

export const HOME_PAGE_ID = 'home'

/** Menu bar labels, Figma 81:2. */
export const MENUS = [
  'File',
  'Edit',
  'View',
  'Data',
  'Analysis',
  'Asset',
  'Portfolio',
  'Settings',
  'Help'
] as const
