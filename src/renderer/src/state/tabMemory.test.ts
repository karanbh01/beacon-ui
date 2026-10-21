import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTabMemory, useTabState } from './tabMemory'
import { useWorkspace } from './tabs.store'
import type { Tab } from './tabs.types'

describe('a tab’s form state (0.2.1)', () => {
  it('outlives the view that set it, as a tab switch unmounts it', () => {
    const first = renderHook(() => useTabState('tab-a', 'draft', 'empty'))
    act(() => {
      first.result.current[1]('half filled')
    })
    first.unmount()

    const again = renderHook(() => useTabState('tab-a', 'draft', 'empty'))
    expect(again.result.current[0]).toBe('half filled')
  })

  it('is its own per tab and per key', () => {
    const a = renderHook(() => useTabState('tab-a', 'draft', 0))
    act(() => {
      a.result.current[1](5)
    })
    expect(renderHook(() => useTabState('tab-b', 'draft', 0)).result.current[0]).toBe(0)
    expect(renderHook(() => useTabState('tab-a', 'other', 0)).result.current[0]).toBe(0)
  })

  it('applies an update to the latest value, not the one rendered', () => {
    const { result } = renderHook(() => useTabState('tab-a', 'count', 0))
    act(() => {
      result.current[1]((n) => n + 1)
      result.current[1]((n) => n + 1)
    })
    expect(result.current[0]).toBe(2)
  })

  it('is forgotten when its tab leaves the workspace', () => {
    const open = { id: 'tab-a', page: 'beacon-view', viewKind: 'backtest', title: 'Backtest' }
    act(() => {
      useWorkspace.setState({ tabs: [open as Tab] })
    })
    const { result } = renderHook(() => useTabState('tab-a', 'draft', 'empty'))
    act(() => {
      result.current[1]('half filled')
    })

    act(() => {
      useWorkspace.setState({ tabs: [] })
    })
    expect(Object.keys(useTabMemory.getState().values)).toHaveLength(0)
  })
})
