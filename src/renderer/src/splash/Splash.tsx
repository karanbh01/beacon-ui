import { useEffect, useState, type ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { GithubIcon } from '../icons/generated'
import { useEngine } from '../state/engine'
import { useTheme } from '../state/theme'
import { useUpdate } from '../state/update'
import { WindowControls } from '../shell/WindowControls'
import { splashProgress } from './splashProgress'
import './Splash.css'

/** The frame's own text (36:1139), which is the only place the app says this. */
const LICENCE =
  'Beacon is built on py-beacon, released under the MIT License. This software is provided "as is", ' +
  'without warranty of any kind, express or implied, including but not limited to the warranties of ' +
  'merchantability, fitness for a particular purpose and noninfringement. In no event shall the authors ' +
  'be liable for any claim, damages or other liability arising from the use of this software. Beacon is ' +
  'an analytical tool for research and educational purposes only. Nothing produced by this application ' +
  'constitutes investment advice, an offer, or a recommendation to buy or sell any financial instrument. ' +
  'Index calculations, backtest results, and derivative valuations are theoretical, may contain errors, ' +
  'and do not reflect actual trading conditions. Past performance, whether actual or simulated, is not ' +
  'indicative of future results. © 2026 Karan Bhanot. All rights reserved.'

const REPO = 'https://github.com/karanbh01/beacon-ui'

export interface SplashProps {
  /** Passed in tests; the window reads it from the bridge itself. */
  version?: string
}

/**
 * Figma 0:1 — frames 2:2 (light) and 4:8 (dark), 573x883.
 *
 * A real frameless window rather than a borderless image: the frame draws a
 * 42px title bar with a rule and the window controls, so it can be moved and
 * closed like anything else. Someone whose engine will not start must be able
 * to shut this without reaching for the task manager.
 *
 * The bar tracks the engine's actual startup — see splashProgress. Main
 * closes this window and shows the app when it reports ready.
 */
export function Splash({ version }: SplashProps): ReactElement {
  const [ownVersion, setOwnVersion] = useState<string | undefined>(version)
  const engine = useEngine()
  const update = useUpdate()
  const progress = splashProgress(engine)

  // Follows the OS the same way the app does; without this the splash would
  // flash the wrong palette before the window it precedes.
  useTheme()

  useEffect(() => {
    if (version !== undefined) return
    // Never let this escape: a failed bridge call here would tear down the
    // splash and leave the user watching nothing at all.
    void window.beacon
      ?.appInfo()
      .then((info) => {
        setOwnVersion(info.version)
      })
      .catch(() => undefined)
  }, [version])

  /*
   * No automatic hand-over (BU-111).
   *
   * The splash used to call `splashDone` the instant the engine reported
   * ready, so the app appeared whenever startup happened to finish — which is
   * also the moment someone might be part-way through changing where the data
   * comes from. Start is now pressed.
   */
  const start = (): void => {
    void window.beacon?.window.splashDone()
  }

  return (
    <div className="splash">
      <header className="splash-bar">
        <WindowControls />
      </header>

      {/* The wordmark, not the beta mark: a background-image so the light and
          dark exports swap on `data-theme` without a flash of the wrong one. */}
      <div className="splash-logo" role="img" aria-label="Beacon" />

      <div
        className="splash-progress"
        role="progressbar"
        aria-valuenow={Math.round(progress.fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Startup"
      >
        <div className="splash-progress-track">
          <div
            className={`splash-progress-fill${progress.failed ? ' splash-progress-failed' : ''}`}
            style={{ width: `${String(progress.fraction * 100)}%` }}
          />
        </div>
        <p
          className={`splash-progress-label${progress.failed ? ' splash-progress-label-failed' : ''}`}
        >
          {progress.label}
        </p>
      </div>

      <div className="splash-actions">
        <Button variant="accent" onClick={start} disabled={!progress.ready}>
          Start
        </Button>
        <Button
          onClick={() => {
            void window.beacon?.data.openSettingsWindow()
          }}
        >
          Data settings…
        </Button>
      </div>

      <div className="splash-rule" />

      <p className="splash-licence">{LICENCE}</p>

      <footer className="splash-footer">
        <span className="splash-version">version {ownVersion ?? '—'}</span>
        {update.status === 'available' && <span className="splash-update">update</span>}
        {/*
          A button, not an anchor. An `<a href>` navigated the splash itself
          to GitHub — a frameless window with no back — because
          `setWindowOpenHandler` only sees window.open, not a same-window
          navigation (BU-112).
        */}
        <button
          type="button"
          className="splash-github"
          aria-label="Repository"
          onClick={() => {
            void window.beacon?.shell.openExternal(REPO)
          }}
        >
          <GithubIcon size={24} />
        </button>
      </footer>
    </div>
  )
}
