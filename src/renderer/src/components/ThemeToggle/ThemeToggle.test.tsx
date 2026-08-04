import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SpinIcon } from './SpinIcon'
import { ThemeToggle } from './ThemeToggle'

describe('ThemeToggle', () => {
  it('is a switch that says which mode is on screen', () => {
    render(<ThemeToggle mode="dark" onChange={vi.fn()} />)

    const toggle = screen.getByRole('switch', { name: 'Dark mode' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('emits the other mode, not a toggle signal', async () => {
    // The caller writes a preference, so it needs to be told which one — a
    // bare onToggle would make every caller re-derive it.
    const onChange = vi.fn()
    render(<ThemeToggle mode="light" onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith('dark')
  })

  it('flips back from dark', async () => {
    const onChange = vi.fn()
    render(<ThemeToggle mode="dark" onChange={onChange} />)

    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith('light')
  })

  it('is reachable and operable from the keyboard', async () => {
    const onChange = vi.fn()
    render(<ThemeToggle mode="light" onChange={onChange} />)

    await userEvent.tab()
    expect(screen.getByRole('switch')).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenCalledWith('dark')
  })
})

describe('SpinIcon', () => {
  it('drives the morph from its own prop, not the document theme', () => {
    // This is the difference from the toggles.dev original, which keys off a
    // `dark:` variant. The knob has to animate from where it is mid-flip,
    // before anything has been committed to the root element.
    const { container, rerender } = render(<SpinIcon dark={false} />)
    expect(container.querySelector('.spin-icon')).toHaveAttribute('data-dark', 'false')

    rerender(<SpinIcon dark />)
    expect(container.querySelector('.spin-icon')).toHaveAttribute('data-dark', 'true')
  })

  it('draws the sun as a disc and eight rays', () => {
    const { container } = render(<SpinIcon dark={false} />)

    expect(container.querySelectorAll('.spin-icon-ray')).toHaveLength(8)
    expect(container.querySelector('.spin-icon-disc')).not.toBeNull()
  })

  it('notches the clip path to make the moon', () => {
    const sun = render(<SpinIcon dark={false} />).container.querySelector('.spin-icon-clip')
    const moon = render(<SpinIcon dark />).container.querySelector('.spin-icon-clip')

    expect(sun?.getAttribute('d')).not.toBe(moon?.getAttribute('d'))
  })

  it('gives each instance its own clip id', () => {
    // A duplicate id would silently apply one icon's clip to both, so two
    // toggles on a page would share a moon.
    const { container } = render(
      <>
        <SpinIcon dark={false} />
        <SpinIcon dark />
      </>
    )

    const ids = [...container.querySelectorAll('clipPath')].map((node) => node.id)
    expect(new Set(ids).size).toBe(2)
  })
})
