import { useEffect, type ReactElement } from 'react'
import { Button } from '../components/Button/Button'
import { Field } from '../components/Field/Field'
import { Select } from '../components/Select/Select'
import { useDataPreferences } from '../state/dataPreferences'
import {
  LARGE_UNITS,
  MAX_DECIMALS,
  formatMoney,
  unitAbbreviation,
  type LargeUnit
} from '../views/shared/largeNumbers'
import './DataPreferencesDialog.css'

const UNIT_LABELS: Record<LargeUnit, string> = {
  auto: 'Auto (K, M, B, T by size)',
  thousands: 'Thousands (k)',
  millions: 'Millions (mn)',
  billions: 'Billions (bn)',
  trillions: 'Trillions (tn)'
}

const UNIT_OPTIONS = LARGE_UNITS.map((unit) => ({ value: unit, label: UNIT_LABELS[unit] }))

const DECIMAL_OPTIONS = Array.from({ length: MAX_DECIMALS + 1 }, (_, places) => ({
  value: String(places),
  label: String(places)
}))

/** A market cap to show the choice on, so it is seen before it is applied. */
const EXAMPLE_CAP = 3_164_250_000_000

/**
 * Data → Data Preferences (BU-228).
 *
 * How large numbers read, chosen once for the whole app. Applied as it is
 * changed — every table redraws behind the dialog — so Done only closes it.
 */
export function DataPreferencesDialog({ onClose }: { onClose: () => void }): ReactElement {
  const unit = useDataPreferences((state) => state.unit)
  const decimals = useDataPreferences((state) => state.decimals)
  const setPreferences = useDataPreferences((state) => state.setPreferences)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const abbreviation = unitAbbreviation(unit)
  const example = `${formatMoney(EXAMPLE_CAP, { unit, decimals })}${abbreviation === undefined ? '' : ` ${abbreviation}`}`

  return (
    <div
      className="preferences-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="preferences-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Data preferences"
      >
        <h2 className="preferences-title type-13">Data Preferences</h2>
        <p className="preferences-note type-11">
          How large numbers read, everywhere in the app. Changes apply at once.
        </p>

        <div className="preferences-fields">
          <Field label="Money amounts in" width={240}>
            <Select
              label="Money amounts in"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={(value) => {
                const chosen = LARGE_UNITS.find((candidate) => candidate === value)
                if (chosen !== undefined) setPreferences({ unit: chosen })
              }}
            />
          </Field>
          <Field label="Decimal places" width={120}>
            <Select
              label="Decimal places"
              options={DECIMAL_OPTIONS}
              value={String(decimals)}
              onChange={(value) => {
                setPreferences({ decimals: Number(value) })
              }}
            />
          </Field>
        </div>

        <p className="preferences-example type-11">
          A market cap of 3,164,250,000,000 reads <strong>{example}</strong>.
          {unit !== 'auto' &&
            ' Column headers name the unit; volumes keep their own suffix, at these decimals.'}
          {unit === 'auto' && ' Each value carries its own suffix, volumes included.'}
        </p>

        <div className="preferences-footer">
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
