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
}

/**
 * Sidebar sections, Figma 80:340.
 *
 * The sidebar carries glyphs only — nothing in the file names these pages —
 * so every mapping below was verified by screenshotting the Sidebar instance
 * inside a known frame and seeing which slot carries the active wash:
 *
 *   1  grid         Data Explorer      234:4404
 *   2  line-chart   Beacon View        234:8574
 *   3  cube         Optimiser          234:7184
 *   4  layers       Strategy Builder   89:734
 *   5  blockchain   Derivatives        234:9686
 *   6  folder-open  Reports            234:10798
 *
 * Slots 3 and 5 are NOT what iconography suggests: a 3D cube reads as a
 * structured product and a node graph reads as an optimisation network, so
 * the obvious guess swaps them. It was wrong until checked.
 *
 * Home is not a sidebar page. Its frame (89:558) highlights no slot at all,
 * so it is reached another way — most likely the logo.
 */
export const SIDEBAR_PAGES: readonly SidebarPage[] = [
  { id: 'data-explorer', label: 'Data Explorer', Icon: GridIcon },
  { id: 'beacon-view', label: 'Beacon View', Icon: LineChartIcon },
  { id: 'optimiser', label: 'Optimiser', Icon: CubeIcon },
  { id: 'strategy-builder', label: 'Strategy Builder', Icon: LayersIcon },
  { id: 'derivatives', label: 'Derivatives', Icon: BlockchainIcon },
  { id: 'reports', label: 'Reports', Icon: FolderOpenIcon }
]

export const GUIDES_PAGE: SidebarPage = { id: 'guides', label: 'Guides', Icon: OpenBookIcon }

export const HOME_PAGE_ID = 'home'

/**
 * Two letters per page, for preset codes (BU-120).
 *
 * A table rather than initials of the label: Data Explorer and Derivatives
 * both start "De", and a code that cannot be read back to one page is worse
 * than no code. Fixed for the same reason a slug is — a code someone has
 * written down must not change because a label was reworded.
 */
const PAGE_CODES: Record<string, string> = {
  home: 'HM',
  'data-explorer': 'DE',
  'beacon-view': 'BV',
  optimiser: 'OP',
  'strategy-builder': 'SB',
  derivatives: 'DV',
  reports: 'RP',
  guides: 'GD'
}

export function pageCode(id: string): string {
  return PAGE_CODES[id] ?? id.slice(0, 2).toUpperCase()
}

/** A page's name as the sidebar says it. Falls back to the id, which is readable. */
export function pageLabel(id: string): string {
  if (id === HOME_PAGE_ID) return 'Home'
  if (id === GUIDES_PAGE.id) return GUIDES_PAGE.label
  return SIDEBAR_PAGES.find((page) => page.id === id)?.label ?? id
}

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
