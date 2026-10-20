import { useState, type ReactElement } from 'react'
import { parseValue, type ParameterSpec } from '../index-definition/ruleCatalogue'
import { StrategyParamField } from './params/StrategyParamField'

/** A value as a field shows it; unset shows the catalogue's default. */
function display(param: ParameterSpec, value: unknown): string {
  const shown = value === undefined ? param.default : value
  if (shown === null || shown === undefined) return ''
  return typeof shown === 'string' ? shown : JSON.stringify(shown)
}

/**
 * A catalogue parameter bound to a value in the document.
 *
 * The text is held here, not derived from the document, because a number
 * being typed passes through states that parse to something else: "0."
 * parses to 0, and a field redrawn from the document would delete the
 * point under the cursor. The document is followed again whenever the text
 * no longer says what it holds — a revert, or another strategy loaded.
 */
export function BoundField({
  param,
  value,
  onChange
}: {
  param: ParameterSpec
  value: unknown
  onChange: (next: unknown) => void
}): ReactElement {
  const [text, setText] = useState(() => display(param, value))
  const agrees =
    JSON.stringify(parseValue(param, text)) === JSON.stringify(value ?? null) ||
    (value === undefined && text === display(param, undefined))
  return (
    <StrategyParamField
      param={param}
      value={agrees ? text : display(param, value)}
      onChange={(raw) => {
        setText(raw)
        onChange(parseValue(param, raw))
      }}
    />
  )
}

/** The parameters with one changed; a cleared one is left for the engine's default. */
function withParam(
  params: Record<string, unknown> | undefined,
  name: string,
  value: unknown
): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(params ?? {}).filter(([key]) => key !== name))
  return value === null ? rest : { ...rest, [name]: value }
}

/**
 * A group of settings that travel as one object, such as the execution
 * limits (`execution.participation`, `execution.days`…): all blank is no
 * object at all, which is how the engine reads "none".
 */
export function GroupFields({
  params,
  group,
  value,
  onChange
}: {
  params: readonly ParameterSpec[]
  group: string
  value: Record<string, unknown> | null | undefined
  onChange: (next: Record<string, unknown> | null) => void
}): ReactElement {
  const members = params.filter((param) => param.name.startsWith(`${group}.`))
  return (
    <>
      {members.map((param) => {
        const name = param.name.slice(group.length + 1)
        return (
          <BoundField
            key={param.name}
            param={param}
            value={value?.[name]}
            onChange={(next) => {
              const merged = withParam(value ?? undefined, name, next)
              onChange(Object.keys(merged).length === 0 ? null : merged)
            }}
          />
        )
      })}
    </>
  )
}
