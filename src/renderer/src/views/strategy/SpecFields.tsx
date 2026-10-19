import { useState, type ReactElement } from 'react'
import { AddSlot } from '../../components/AddSlot/AddSlot'
import { Button } from '../../components/Button/Button'
import { Field } from '../../components/Field/Field'
import { Select } from '../../components/Select/Select'
import { ParamField } from '../index-definition/ParamField'
import {
  orderedParameters,
  parseValue,
  type ParameterSpec,
  type TypeSpec
} from '../index-definition/ruleCatalogue'
import type { TypedSpec } from './strategyDraft'

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
    <ParamField
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
 * One typed spec — a replication, a signal, a construction — chosen from its
 * catalogue in `/backtest/options`, with its parameters as that catalogue
 * describes them. The same grammar as a rule in Index Definition.
 */
export function SpecEditor({
  label,
  catalogue,
  spec,
  onChange,
  noneLabel
}: {
  label: string
  catalogue: readonly TypeSpec[]
  spec: TypedSpec | null | undefined
  onChange: (next: TypedSpec | null) => void
  /** Offer no spec at all, named for what that means here. */
  noneLabel?: string
}): ReactElement {
  const type = catalogue.find((entry) => entry.name === spec?.type)
  return (
    <div className="strategy-spec">
      <div className="strategy-form-row">
        <Field label={label} width={220}>
          <Select
            label={label}
            options={[
              ...(noneLabel === undefined ? [] : [{ value: '', label: noneLabel }]),
              ...catalogue.map((entry) => ({ value: entry.name, label: entry.label }))
            ]}
            value={spec?.type ?? ''}
            placeholder="Choose…"
            onChange={(next) => {
              // A new type starts from its own defaults: one type's
              // parameters mean nothing to another.
              onChange(next === '' ? null : { type: next, params: {} })
            }}
          />
        </Field>
        {spec != null &&
          orderedParameters(type).map((param) => (
            <BoundField
              key={`${spec.type}.${param.name}`}
              param={param}
              value={spec.params?.[param.name]}
              onChange={(value) => {
                onChange({ ...spec, params: withParam(spec.params, param.name, value) })
              }}
            />
          ))}
      </div>
      {type !== undefined && type.summary !== '' && (
        <p className="strategy-note type-11">{type.summary}</p>
      )}
    </div>
  )
}

/** Several typed specs of one catalogue: screens, caps, constraints. */
export function SpecList({
  label,
  addLabel,
  catalogue,
  specs,
  onChange
}: {
  label: string
  addLabel: string
  catalogue: readonly TypeSpec[]
  specs: readonly TypedSpec[]
  onChange: (next: TypedSpec[]) => void
}): ReactElement {
  return (
    <div className="strategy-list">
      {specs.map((spec, at) => (
        // Keyed by place: a spec has no id of its own, and its type is editable.
        <div key={at} className="strategy-list-row">
          <SpecEditor
            label={label}
            catalogue={catalogue}
            spec={spec}
            onChange={(next) => {
              onChange(
                next === null
                  ? specs.filter((_, index) => index !== at)
                  : specs.map((entry, index) => (index === at ? next : entry))
              )
            }}
          />
          <Button
            onClick={() => {
              onChange(specs.filter((_, index) => index !== at))
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <AddSlot
        label={addLabel}
        {...(catalogue.length === 0 ? { blocked: 'This engine lists none.' } : {})}
        onClick={() => {
          const first = catalogue[0]
          if (first !== undefined) onChange([...specs, { type: first.name, params: {} }])
        }}
      />
    </div>
  )
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
