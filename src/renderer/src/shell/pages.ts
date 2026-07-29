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
 * Icon order is read from Figma 80:340. The LABELS are my mapping, not the
 * designer's — the sidebar carries glyphs only, so nothing in the file names
 * these pages. BU-17 owns routing and should confirm them.
 *
 * Note the taxonomy lists six sections INCLUDING Derivatives, and the sidebar
 * has exactly six slots plus Guides. Home taking the first slot leaves
 * Derivatives without one. Either Home is not a sidebar page, or Derivatives
 * lives elsewhere — unresolved, and worth settling in BU-17.
 */
export const SIDEBAR_PAGES: readonly SidebarPage[] = [
  { id: 'home', label: 'Home', Icon: GridIcon },
  { id: 'data-explorer', label: 'Data Explorer', Icon: LineChartIcon },
  { id: 'strategy-builder', label: 'Strategy Builder', Icon: CubeIcon },
  { id: 'optimiser', label: 'Optimiser', Icon: LayersIcon },
  { id: 'beacon-view', label: 'Beacon View', Icon: BlockchainIcon },
  { id: 'reports', label: 'Reports', Icon: FolderOpenIcon }
]

export const GUIDES_PAGE: SidebarPage = { id: 'guides', label: 'Guides', Icon: OpenBookIcon }

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
