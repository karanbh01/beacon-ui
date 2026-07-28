import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { ChevronIcon } from '../../icons/generated'
import './Button.css'

export type ButtonVariant = 'default' | 'accent'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /**
   * `accent` is the affirmative action — Save, Apply, Run, Price, Export
   * (taxonomy 5). It is an outline, never a filled button.
   */
  variant?: ButtonVariant
  chevron?: boolean
  children: ReactNode
}

/**
 * Figma 388:146. Default carries Inter Regular in text-secondary; accent
 * carries Inter Medium in accent — the weight changes with the variant, which
 * is easy to miss and is why they are separate rules rather than one class.
 */
export function Button({
  variant = 'default',
  chevron = false,
  children,
  className,
  type = 'button',
  ...props
}: ButtonProps): ReactElement {
  const classes = ['btn', `btn-${variant}`, className].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} {...props}>
      <span className="btn-label">{children}</span>
      {chevron && <ChevronIcon size={10} className="btn-chevron" />}
    </button>
  )
}
