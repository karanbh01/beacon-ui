import type { Study, SubPanel } from '../../charts/LevelChart'
import { macd, rsi, sma } from '../../charts/indicators'
import type { Point } from '../../charts/transform'

/**
 * What the Indicators control offers, in the order it lists them (BU-157).
 *
 * Labels are the identity: `CheckSelect` chooses strings, and a separate id
 * would mean a lookup table that can disagree with what is on screen. The
 * periods are in the names for the same reason — "MACD" alone leaves the
 * reader to guess 12/26/9, and every package picks its own.
 */
export const INDICATORS = ['MA 20', 'MA 50', 'MA 200', 'MACD', 'RSI'] as const

/** The averages, and the colour each takes. Order is the control's order. */
const AVERAGES = [
  { label: 'MA 20', period: 20, tone: 'second' },
  { label: 'MA 50', period: 50, tone: 'third' },
  { label: 'MA 200', period: 200, tone: 'muted' }
] as const

/**
 * Moving averages, drawn on the price line itself.
 *
 * An average in the same units as its subject belongs on the same scale —
 * that is the whole difference between a study and the feature overlay,
 * which brings an axis of its own.
 *
 * A period longer than the window returns nothing rather than a short line
 * from a partial window: MA 200 over six months is not a 200-day average.
 */
export function studiesFor(chosen: readonly string[], points: readonly Point[]): Study[] {
  return AVERAGES.filter((average) => chosen.includes(average.label)).flatMap((average) => {
    const drawn = sma(points, average.period)
    return drawn.length === 0 ? [] : [{ label: average.label, points: drawn, tone: average.tone }]
  })
}

/**
 * The oscillators, each in a pane of its own.
 *
 * Two shares against the price pane's nine, where volume takes one: volume is
 * context you glance at, and these are read for values, which needs the room.
 */
export function panesFor(chosen: readonly string[], points: readonly Point[]): SubPanel[] {
  const panes: SubPanel[] = []

  if (chosen.includes('MACD')) {
    const study = macd(points)
    if (study.line.length > 0) {
      panes.push({
        label: 'MACD · 12, 26, 9',
        share: 2,
        // Histogram first: series drawn later sit on top, and the bars are
        // the background the two lines are read against.
        series: [
          { points: study.histogram, kind: 'histogram', tone: 'muted' },
          { points: study.line, kind: 'line', tone: 'accent', guides: [0] },
          { points: study.signal, kind: 'line', tone: 'second', badge: false }
        ]
      })
    }
  }

  if (chosen.includes('RSI')) {
    const drawn = rsi(points)
    if (drawn.length > 0) {
      panes.push({
        label: 'RSI · 14',
        share: 2,
        // The bands are the indicator: 70 and 30 are what "overbought" and
        // "oversold" mean, and a line without them is a wiggle out of context.
        series: [{ points: drawn, kind: 'line', tone: 'accent', guides: [30, 70] }]
      })
    }
  }

  return panes
}
