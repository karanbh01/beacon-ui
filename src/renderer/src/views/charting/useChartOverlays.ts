import { useMemo } from 'react'
import type { ChartEvent } from '../../charts/LevelChart'
import type { Point } from '../../charts/transform'
import { ratioLabel, typeLabel, type CorporateAction } from '../corporate-actions/actions'
import { fieldLabel, fieldsIn, historyRows, type FeatureHistoryRow } from '../features/features'
import { useCorporateActions, useTable } from '../shared/queries'

/** Nothing to draw, as one object rather than a new array every render. */
const NONE: ChartEvent[] = []

/**
 * What each kind looks like on the axis.
 *
 * `kind`, never the type string: py-beacon adds types and a client that
 * matched them would silently stop recognising one (BN-118).
 */
const SHAPES = { cash: 'circle', ratio: 'square', structural: 'arrowUp' } as const

/**
 * A flag's few words: what happened, and how much of it.
 *
 * Shorter than the Corporate Actions table's `describeAction`, which says
 * "per share" — a marker sits under a price line with its neighbours a
 * centimetre away, and the sentence would collide with the next one.
 */
export function eventText(action: CorporateAction): string {
  if (action.kind === 'structural') return typeLabel(action.type)
  if (action.kind === 'ratio') return `${ratioLabel(action.value)} ${typeLabel(action.type)}`
  return `${typeLabel(action.type)} ${action.value.toFixed(2)}`
}

/** Actions inside the drawn window, oldest first, as the chart wants them. */
export function eventsFrom(
  actions: readonly CorporateAction[] | undefined,
  from: string | undefined
): ChartEvent[] {
  if (actions === undefined) return []

  return actions
    .map((action) => ({
      date: action.ex_date.slice(0, 10),
      text: eventText(action),
      shape: SHAPES[action.kind]
    }))
    .filter((event) => from === undefined || event.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** One field's history as a series. Nulls are gaps, so they are dropped. */
export function seriesFrom(
  rows: readonly FeatureHistoryRow[],
  field: string,
  from: string | undefined
): Point[] {
  return rows
    .filter((row) => row.field === field && (from === undefined || row.date >= from))
    .flatMap((row) => (row.value === null ? [] : [{ date: row.date, value: row.value }]))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface OverlayRequest {
  subject: string
  /** The chart's window. An action before it belongs to a chart nobody drew. */
  start: string | undefined
  /** Whether corporate actions are being shown. */
  events: boolean
  /** The feature field on the right axis, or '' for none. */
  field: string
}

export interface ChartOverlays {
  /** Empty when the toggle is off; `hasEvents` says whether it could be on. */
  events: ChartEvent[]
  hasEvents: boolean
  /** Every field this instrument has history for, for the picker. */
  fields: string[]
  overlay: { label: string; points: Point[] } | undefined
}

/**
 * What else is known about the instrument on screen (BU-152).
 *
 * Both are fetched whether or not they are being drawn, because the controls
 * have to say what there is: a toggle for actions that do not exist and a
 * field list for an instrument with no features are two ways of making the
 * user click to find out that the answer is nothing.
 */
export function useChartOverlays(request: OverlayRequest): ChartOverlays {
  const actions = useCorporateActions(request.subject, { start: request.start })
  const history = useTable('features', request.subject)

  const all = useMemo(
    () => eventsFrom(actions.data?.actions, request.start),
    [actions.data, request.start]
  )
  const rows = useMemo(() => historyRows(history.data), [history.data])
  const fields = useMemo(() => fieldsIn(rows), [rows])

  const overlay = useMemo(() => {
    if (request.field === '') return undefined
    const points = seriesFrom(rows, request.field, request.start)
    return points.length === 0 ? undefined : { label: fieldLabel(request.field), points }
  }, [rows, request.field, request.start])

  // Memoised whole: the chart rebuilds its series when these change identity,
  // and a fresh array every render would rebuild it on every render.
  return useMemo(
    () => ({
      events: request.events ? all : NONE,
      hasEvents: all.length > 0,
      fields,
      overlay
    }),
    [all, fields, overlay, request.events]
  )
}
