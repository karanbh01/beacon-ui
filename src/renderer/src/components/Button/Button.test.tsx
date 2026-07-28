import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Export</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('carries the variant class', () => {
    const { rerender } = render(<Button>Export</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-default')

    rerender(<Button variant="accent">Apply</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-accent')
  })

  it('omits the chevron unless asked', () => {
    const { container, rerender } = render(<Button>Export</Button>)
    expect(container.querySelector('svg')).toBeNull()

    rerender(<Button chevron>Export</Button>)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('hides the chevron from assistive tech', () => {
    const { container } = render(<Button chevron>Export</Button>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Export
      </Button>
    )

    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})
