import { RAW } from '../tokens/tokens'

/**
 * The risk heatmap colormap.
 *
 * Mode-independent by approval (taxonomy 9): a correlation of 0.8 must be the
 * same colour in both themes, because the colour IS the measurement. Every
 * other surface in the app flips with `data-theme`; this one deliberately
 * does not, which is why the three stops live in `RAW` rather than in the
 * token set.
 */
const STOPS: readonly [number, string][] = [
  [0, RAW.heatmapLow],
  [0.5, RAW.heatmapMid],
  [1, RAW.heatmapHigh]
]

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number
  ]
}

/**
 * A 0–1 position on the colormap, as `rgb()`.
 *
 * Interpolated in raw RGB rather than a perceptual space on purpose: the
 * three stops were chosen as sRGB values and approved as such, so converting
 * through Lab would render approved endpoints as something else.
 */
export function heatColor(position: number): string {
  const t = Math.max(0, Math.min(1, position))

  for (let i = 1; i < STOPS.length; i++) {
    const [upperStop, upperHex] = STOPS[i] ?? [1, RAW.heatmapHigh]
    if (t > upperStop) continue

    const [lowerStop, lowerHex] = STOPS[i - 1] ?? [0, RAW.heatmapLow]
    const span = upperStop - lowerStop
    const local = span === 0 ? 0 : (t - lowerStop) / span
    const from = channels(lowerHex)
    const to = channels(upperHex)
    const mixed = from.map((value, channel) =>
      Math.round(value + ((to[channel] ?? value) - value) * local)
    )
    return `rgb(${mixed.join(', ')})`
  }

  return RAW.heatmapHigh
}

/**
 * Where a correlation sits on the map.
 *
 * Correlations run −1 to 1, so the scale is centred: 0 lands on the middle
 * stop and a perfect negative correlation is as far from neutral as a perfect
 * positive one. Mapping 0–1 instead would paint every uncorrelated pair with
 * the "low" colour, which reads as reassuring when it is not.
 */
export function correlationPosition(correlation: number): number {
  return (Math.max(-1, Math.min(1, correlation)) + 1) / 2
}

/** Dark cells need light text; the mid-tone is the crossover. */
export function heatTextColor(position: number): string {
  return position > 0.35 && position < 0.75 ? RAW.paperInk : '#ffffff'
}
