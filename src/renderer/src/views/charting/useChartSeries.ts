import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { keys } from '../../api/keys'
import { useBeacon } from '../../api/queryClient'
import { rebase100, toPoints, type Point } from '../../charts/transform'

/**
 * py-beacon accepts `native`, `weekly` or `monthly`.
 *
 * Figma labels the first "Daily" (283:10932) because the loaded market data
 * is daily — but the parameter means "whatever the source's own frequency
 * is", so the label and the value deliberately differ.
 */
export type Interval = 'native' | 'weekly' | 'monthly'

export const INTERVALS: readonly { value: Interval; label: string }[] = [
  { value: 'native', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' }
]

export interface ChartSeries {
  label: string
  points: Point[]
}

export interface ChartData {
  /** Rebased to 100 whenever more than one instrument is drawn. */
  series: ChartSeries[]
  volume: Point[]
  rebased: boolean
  /** The date every rebased series is 100 at. */
  baseDate: string | undefined
  loading: boolean
  error: unknown
}

export interface ChartRequest {
  subject: string
  compare: readonly string[]
  start: string | undefined
  interval: Interval
  /** Draw the back-adjusted line instead of the traded one (BU-129). */
  adjusted: boolean
}

/**
 * One prices call per drawn instrument.
 *
 * Rebasing happens here rather than in the chart because it is a property of
 * the comparison, not of the drawing: with one instrument the axis should
 * show its real level, and only a second one forces a shared scale.
 */
export function useChartSeries(request: ChartRequest): ChartData {
  const client = useBeacon()
  const identifiers = useMemo(
    () => [request.subject, ...request.compare].filter((id) => id !== ''),
    [request.subject, request.compare]
  )

  const query = useMemo(
    () => ({
      ...(request.start === undefined ? {} : { start: request.start }),
      interval: request.interval,
      ...(request.adjusted ? { adjusted: true } : {})
    }),
    [request.start, request.interval, request.adjusted]
  )

  const results = useQueries({
    queries: identifiers.map((identifier) => ({
      queryKey: keys.data.prices(identifier, query),
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (client === null) throw new Error('No engine')
        return client.data.prices(identifier, query, signal)
      },
      enabled: client !== null
    }))
  })

  // Extracted so the dependency list stays statically checkable: `results` is
  // a new array on every render, and what matters is when its contents moved.
  const stamps = results.map((result) => result.dataUpdatedAt).join()

  return useMemo(() => {
    const rebased = identifiers.length > 1
    /*
     * One line, and which one is a choice (BU-129).
     *
     * This used to read `close` and fall back to an adjusted column when
     * there was none — a silent mixture rather than an answer. Now the
     * request asks for the adjusted column and this reads it, with the
     * traded close as the fallback: an engine that cannot adjust should draw
     * the line it has rather than nothing.
     */
    const columns: [string, ...string[]] = request.adjusted
      ? ['adj close', 'adj_close', 'close']
      : ['close']

    const series = identifiers.map((identifier, index) => {
      const points = toPoints(results[index]?.data?.prices, ...columns)
      return { label: identifier, points: rebased ? rebase100(points) : points }
    })

    return {
      series: series.filter((line) => line.points.length > 0),
      volume: toPoints(results[0]?.data?.prices, 'volume'),
      rebased,
      baseDate: series[0]?.points[0]?.date,
      loading: results.some((result) => result.isPending),
      // The first real failure. One unknown compare symbol must not blank a
      // chart the user is reading, but a dead engine still says so.
      error: results.find((result) => result.isError)?.error
    }
    // `results` is a new array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identifiers, request.adjusted, stamps, results.length])
}
