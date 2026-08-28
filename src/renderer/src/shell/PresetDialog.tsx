import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { Field } from '../components/Field/Field'
import { layoutById } from './paneGrid'
import { presetsFor, usePresets } from '../state/presets'
import { pageLabel } from './pages'
import './PresetDialog.css'

export interface PresetDialogProps {
  /** The page whose arrangement is being saved. Presets belong to one. */
  page: string
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
export function PresetDialog({ page, onClose }: PresetDialogProps): ReactElement {
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const saved = usePresets((state) => state.presets)
  const save = usePresets((state) => state.save)
  const forget = usePresets((state) => state.forget)

  const mine = presetsFor(saved, page)
  const trimmed = name.trim()
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
    if (trimmed === '') return
    save(trimmed, page)
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
          <Button variant="accent" disabled={trimmed === ''} onClick={commit}>
            {replacing ? 'Replace' : 'Save'}
          </Button>
        </div>

        {mine.length > 0 && (
          <>
            <div className="preset-rule" />
            <p className="preset-note type-11">
              Saved for this page. Apply one from the View menu — it replaces whatever is open here.
            </p>
            <ul className="preset-list">
              {mine.map((preset) => (
                <li key={preset.id} className="preset-row">
                  <span className="preset-name type-11">{preset.name}</span>
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
