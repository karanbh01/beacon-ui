import { useId } from 'react'
import type { ReactElement } from 'react'
import './Checkbox.css'

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/**
 * NOT measured from Figma — no checkbox component exists in the file yet, and
 * the Reports sections checklist that needs one (BU-32) is not drawn as a
 * component either. Built from the established grammar instead: accent
 * outline rather than an accent fill, matching the affirmative-button rule
 * (taxonomy 5), with the box sized to the 13px control text.
 *
 * Revisit when the Reports frames are componentised.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  className
}: CheckboxProps): ReactElement {
  const id = useId()
  return (
    <div className={['checkbox', className].filter(Boolean).join(' ')}>
      <input
        id={id}
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
      />
      <label htmlFor={id} className="checkbox-label">
        {label}
      </label>
    </div>
  )
}
