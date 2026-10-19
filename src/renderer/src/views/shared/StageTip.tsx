import type { ReactElement } from 'react'

/**
 * A stage of a strategy's workflow as the engine describes it: its name,
 * kind and type, a sentence on what it does and its settings (py-beacon
 * 0.9.3). The last three are optional, so a stage from an engine that does
 * not send them still says what it can.
 */
export interface StageDetail {
  label: string
  kind?: string | null
  type?: string | null
  description?: string | null
  params?: readonly { label: string; value: string }[] | null
  remaining?: number | null
  /** How many names came into the stage: the stage before's count. */
  before?: number | null
}

const KINDS: Readonly<Record<string, string>> = {
  universe: 'Universe',
  index_rule: 'Index rule',
  index_cap: 'Index cap',
  strategy: 'Strategy',
  implementation_screen: 'Implementation screen',
  cash_buffer: 'Cash buffer',
  implementation_cap: 'Implementation cap'
}

/** What a rule or screen is and does, for the popup on its column's name. */
export function StageTip({ stage }: { stage: StageDetail }): ReactElement {
  const kind = stage.kind == null ? undefined : (KINDS[stage.kind] ?? stage.kind)
  const of = [kind, stage.type].filter((part) => part != null && part !== '').join(' · ')

  return (
    <>
      <div className="header-tip-title">{stage.label}</div>
      {of !== '' && <div className="header-tip-kind">{of}</div>}
      {stage.description != null && stage.description !== '' && (
        <p className="header-tip-text">{stage.description}</p>
      )}
      {stage.params != null && stage.params.length > 0 && (
        <dl className="header-tip-params">
          {stage.params.map((param) => (
            <Param key={param.label} label={param.label} value={param.value} />
          ))}
        </dl>
      )}
      {stage.remaining != null && (
        <p className="header-tip-text">{passedAndDropped(stage.remaining, stage.before)}</p>
      )}
    </>
  )
}

/** "11 passed, 2 dropped" (Karan, 2026-10-19): what the stage let through, and what it took out. */
function passedAndDropped(remaining: number, before?: number | null): string {
  const passed = `${remaining.toLocaleString('en-US')} passed`
  if (before == null || before < remaining) return passed
  return `${passed}, ${(before - remaining).toLocaleString('en-US')} dropped`
}

function Param({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}
