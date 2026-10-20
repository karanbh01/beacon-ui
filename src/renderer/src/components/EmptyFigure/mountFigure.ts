import { drawer, plot, sieve } from '@lucasmarkes/hairline'
import { HL, type KitFigure, type KitStage } from './kit/kernel'
import binders from './kit/binders'
import blocks from './kit/blocks'
import calendar from './kit/calendar'
import cardindex from './kit/cardindex'
import level from './kit/level'
import recorder from './kit/recorder'
import ticker from './kit/ticker'

/**
 * The kinds of nothing a view can have, each with its own figure (BU-231).
 *
 * Seven, not one per message: a view waiting for a ticker and another
 * waiting for an instrument are the same absence, and the same figure says
 * so wherever it appears.
 */
export type FigureKind =
  /** Nothing to look up yet: no identifier typed. */
  | 'ticker'
  /** No date chosen. */
  | 'calendar'
  /** The query ran and the range held no data. */
  | 'plot'
  /** There was data, and a filter let none of it through. */
  | 'sieve'
  /** The engine stores none of these. */
  | 'drawer'
  /** A list that holds no names. */
  | 'cardindex'
  /** Asked for by name, and not there. */
  | 'binders'

/**
 * Home's guide cards, one figure each (Karan, 2026-10-20): what the guide
 * teaches, as an object on a desk.
 */
export type GuideFigureKind =
  /** Define an index: its weights as stacks of counters, rebalanced. */
  | 'blocks'
  /** Run a backtest: a chart recorder replaying a fund's history. */
  | 'recorder'
  /** Read tracking metrics: a spirit level, how far a fund leans off its index. */
  | 'level'

export interface MountedFigure {
  destroy(): void
}

/** Drawn for Beacon on Hairline's figure kit; see kit/ for where they came from. */
const KIT: Readonly<
  Record<'ticker' | 'calendar' | 'cardindex' | 'binders' | GuideFigureKind, KitFigure>
> = {
  ticker,
  calendar,
  cardindex,
  binders,
  blocks,
  recorder,
  level
}

/**
 * Hairline's own figures. Plot at full intensity, by Karan's call: its tabs
 * lift twice as high as the default, so the answer reads in a small pane.
 */
const PACKAGE: Readonly<Record<'plot' | 'sieve' | 'drawer', (host: HTMLElement) => MountedFigure>> =
  {
    plot: (host) => plot(host, { intensity: 1 }),
    sieve: (host) => sieve(host),
    drawer: (host) => drawer(host)
  }

let injected = false

/**
 * A kit figure, mounted as the skill's bench mounts it, less the bench: no
 * slider, so the figure gets its middle value, and no caption, which Karan
 * asked to leave out — the message under the figure already says it.
 */
function mountKit(figure: KitFigure, host: HTMLElement): MountedFigure {
  if (!injected) {
    HL.inject(document)
    injected = true
  }
  host.setAttribute('data-hairline', figure.name)
  const svg = HL.mk('svg', { viewBox: '0 0 400 320', 'aria-hidden': 'true' }, host)
  const read: KitStage['read'] = { textContent: null }
  const handle = figure.mount({ stage: host, svg, read }, figure.range[1])
  return {
    destroy: () => {
      handle.destroy()
      svg.remove()
      host.removeAttribute('data-hairline')
    }
  }
}

export function mountFigure(kind: FigureKind | GuideFigureKind, host: HTMLElement): MountedFigure {
  if (kind === 'plot' || kind === 'sieve' || kind === 'drawer') return PACKAGE[kind](host)
  return mountKit(KIT[kind], host)
}
