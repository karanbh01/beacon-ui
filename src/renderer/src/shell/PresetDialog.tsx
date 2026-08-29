import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { Field } from '../components/Field/Field'
import { layoutById } from './paneGrid'
import { normaliseCode, presetsFor, suggestCode, usePresets, type Preset } from '../state/presets'
import { pageLabel } from './pages'
import './PresetDialog.css'

export interface PresetDialogProps {
  /** The page whose arrangement is being saved. Presets belong to one. */
  page: string
  /** What was saved, so the app can confirm it and show the code (BU-120). */
  onSaved?: (preset: Preset) => void
  onClose: () => void
}

/**
 * Name an arrangement, and manage the ones already named (BU-119).
 *
 * Saving is here rather than in the View menu because it needs a name typed;
 * APPLYING stays in the menu, which is where a saved thing is reached from.
 * That split is why this dialog lists what exists without offering to apply
 * it — two routes to the same act, one of them two clicks deeper, is a worse
 * answer than one obvious route.
 */
export function PresetDialog({ page, onSaved, onClose }: PresetDialogProps): ReactElement {
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const saved = usePresets((state) => state.presets)
  const save = usePresets((state) => state.save)
  const forget = usePresets((state) => state.forget)

  const mine = presetsFor(saved, page)
  const trimmed = name.trim()

  /*
   * The code, offered rather than demanded (BU-120).
   *
   * Suggested from the page and the codes already taken, and editable
   * because someone who writes DE100 down for a reason should be able to use
   * it. Empty means "whatever you suggested", so nobody has to think about
   * it to save an arrangement.
   */
  const [code, setCode] = useState('')
  const suggestion = suggestCode(page, saved)
  const wanted = normaliseCode(code) === '' ? suggestion : normaliseCode(code)
  const clash = saved.some(
    (preset) => preset.code === wanted && !(preset.page === page && preset.name === trimmed)
  )
  // Saving over a name replaces it: two rows reading "Research" would be
  // indistinguishable in the menu that offers them.
  const replacing = mine.some((preset) => preset.name === trimmed)

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const commit = (): void => {
    if (trimmed === '' || clash) return
    const stored = save(trimmed, page, wanted)
    if (stored !== undefined) onSaved?.(stored)
    onClose()
  }

  return (
    <div
      className="preset-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="preset-dialog" role="dialog" aria-modal="true" aria-label="Layout presets">
        <h2 className="preset-title type-13">Save this arrangement</h2>
        <p className="preset-note type-11">
          The layout of {pageLabel(page)}, its tabs and what each pane is showing — under a name.
          Nothing about the data is saved: the tabs come back and fetch what is current.
        </p>

        <div className="preset-form">
          <Field label="Preset name" width={240}>
            <input
              className="preset-input"
              ref={input}
              value={name}
              aria-label="Preset name"
              spellCheck={false}
              onChange={(event) => {
                setName(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
              }}
            />
          </Field>
          <Field label="Code" width={90}>
            <input
              className="preset-input"
              value={code}
              aria-label="Code"
              placeholder={suggestion}
              spellCheck={false}
              onChange={(event) => {
                setCode(normaliseCode(event.target.value))
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
              }}
            />
          </Field>
          <Button variant="accent" disabled={trimmed === '' || clash} onClick={commit}>
            {replacing ? 'Replace' : 'Save'}
          </Button>
        </div>

        <p className="preset-note type-11">
          {clash
            ? `${wanted} already belongs to another preset.`
            : `Searching ${wanted} brings this arrangement back from any page.`}
        </p>

        {mine.length > 0 && (
          <>
            <div className="preset-rule" />
            <p className="preset-note type-11">
              Saved for this page. Apply one from Presets in the layout menu, or by searching its
              code — either replaces whatever is open here.
            </p>
            <ul className="preset-list">
              {mine.map((preset) => (
                <li key={preset.id} className="preset-row">
                  <span className="preset-name type-11">{preset.name}</span>
                  <span className="preset-code type-11">{preset.code}</span>
                  <span className="preset-meta type-11">
                    {preset.tabs.length} {preset.tabs.length === 1 ? 'tab' : 'tabs'} ·{' '}
                    {layoutById(preset.layout).label}
                  </span>
                  <button
                    type="button"
                    className="preset-forget type-11"
                    aria-label={`Forget ${preset.name}`}
                    onClick={() => {
                      forget(preset.id)
                    }}
                  >
                    Forget
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="preset-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
