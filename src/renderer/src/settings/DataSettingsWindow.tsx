import { useEffect, useState, type ReactElement } from 'react'
import type { DataSettings } from '@shared/ipc'
import { Button } from '../components/Button/Button'
import { Checkbox } from '../components/Checkbox/Checkbox'
import { Field } from '../components/Field/Field'
import { useTheme } from '../state/theme'
import { WindowControls } from '../shell/WindowControls'
import './DataSettingsWindow.css'

const DEFAULTS: DataSettings = { storePath: '', synthetic: true }

/**
 * Where the engine gets its data (BU-111).
 *
 * Its own window rather than a panel on the splash: the splash is a fixed
 * 573x883 frame read straight from Figma, and growing a settings section into
 * it would mean redrawing that frame.
 *
 * Saving restarts the engine, because these decide what it loads when it
 * spawns — a setting stored without a restart would take effect at some later
 * launch, which is the kind nobody trusts.
 */
export function DataSettingsWindow(): ReactElement {
  const [settings, setSettings] = useState<DataSettings>(DEFAULTS)
  const [saved, setSaved] = useState<DataSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const [problem, setProblem] = useState<string | undefined>(undefined)

  useTheme()

  useEffect(() => {
    void window.beacon?.data
      .settings()
      .then((current) => {
        setSettings(current)
        setSaved(current)
      })
      .catch(() => undefined)
  }, [])

  const dirty = settings.storePath !== saved.storePath || settings.synthetic !== saved.synthetic

  const close = (): void => {
    void window.beacon?.data.closeSettingsWindow()
  }

  /**
   * Replace the store the app generated (BU-116).
   *
   * The same call the Data Coverage view makes, offered here because this is
   * where someone comes when the data looks wrong — and because from the
   * splash it is reachable *before* the app has started, which is when
   * rebuilding costs nothing but time.
   *
   * Main asks for confirmation in the OS dialog and does the deleting: this
   * discards a couple of hundred megabytes, and a div is not the right thing
   * to ask that with. Nothing is invalidated here because there is no query
   * cache in this window; the app's own refreshes when the engine reconnects.
   */
  const regenerate = (): void => {
    setRebuilding(true)
    setProblem(undefined)
    void window.beacon?.engine
      .regenerate()
      .then((result) => {
        if (result.problem !== undefined) setProblem(result.problem)
      })
      .catch((cause: unknown) => {
        setProblem(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => {
        setRebuilding(false)
      })
  }

  const save = (): void => {
    setBusy(true)
    void window.beacon?.data
      .saveSettings(settings)
      .then((stored) => {
        setSaved(stored)
        setSettings(stored)
        close()
      })
      .catch(() => undefined)
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="data-settings">
      <header className="data-settings-bar">
        <span className="data-settings-title type-13">Data settings</span>
        <WindowControls />
      </header>

      <div className="data-settings-body">
        <Field label="Store location" width={440}>
          <input
            className="data-settings-input"
            value={settings.storePath}
            aria-label="Store location"
            placeholder="py-beacon’s own app-data folder"
            spellCheck={false}
            onChange={(event) => {
              setSettings({ ...settings, storePath: event.target.value })
            }}
          />
        </Field>

        <div className="data-settings-row">
          <Button
            onClick={() => {
              void window.beacon?.data.chooseStore().then((chosen) => {
                // Dismissing the dialog is an answer: keep what was there.
                if (chosen.path !== '')
                  setSettings((current) => ({ ...current, storePath: chosen.path }))
              })
            }}
          >
            Browse…
          </Button>
          <Button
            disabled={settings.storePath === ''}
            onClick={() => {
              setSettings({ ...settings, storePath: '' })
            }}
          >
            Use the default
          </Button>
        </div>

        <p className="data-settings-note type-11">
          Empty means py-beacon’s own app-data folder. A location you name here is yours — the app
          generates into it only if it is empty, and never writes over a store it finds.
        </p>

        <Checkbox
          label="Generate synthetic data when there is none"
          checked={settings.synthetic}
          onChange={(checked) => {
            setSettings({ ...settings, synthetic: checked })
          }}
        />

        <p className="data-settings-note type-11">
          Turn this off to run against real data only. The engine will start with nothing to serve
          until a store exists at the location above.
        </p>

        <div className="data-settings-row">
          <Button disabled={saved.storePath !== '' || rebuilding || busy} onClick={regenerate}>
            {rebuilding ? 'Replacing…' : 'Replace the data…'}
          </Button>
        </div>

        <p className="data-settings-note type-11">
          {saved.storePath === ''
            ? 'Deletes the generated store and builds a fresh one at py-beacon’s current defaults — five thousand names, and whatever columns this version produces. A couple of minutes, and the app has no data until it finishes. Your universes, indices and watchlists are kept.'
            : 'Only the app’s own store can be replaced. The location saved above is yours, so nothing here will delete it.'}
        </p>

        {problem !== undefined && <p className="data-settings-problem type-11">{problem}</p>}

        <p className="data-settings-note type-11">
          <strong>BEACON_DATA_PATH</strong> and <strong>BEACON_NO_SYNTHETIC</strong> still win where
          they are set: something that names a store for this run outranks a saved preference.
        </p>
      </div>

      <footer className="data-settings-actions">
        <Button variant="accent" onClick={save} disabled={!dirty || busy}>
          {busy ? 'Restarting…' : 'Save and restart'}
        </Button>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
      </footer>
    </div>
  )
}
