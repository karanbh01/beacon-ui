import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { forgetAllTabs } from '../renderer/src/state/tabMemory'

/**
 * Tab memory is module state (BU-227), and tests reuse tab ids, so one
 * test's opened definition would otherwise greet the next.
 */
afterEach(() => {
  forgetAllTabs()
})

/**
 * jsdom does not implement matchMedia, and anything touching the theme calls
 * it. Defaults to light; tests that care about OS preference stub their own
 * controllable version over the top.
 */
/**
 * jsdom does not implement scrollIntoView either, and TabBar calls it to keep
 * the active tab visible. Without this, any test that renders a tab strip
 * dies inside an effect.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => undefined
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    media: query,
    matches: false,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false
  })
}

/**
 * jsdom has no ResizeObserver, and the Table uses one to reserve the scroll
 * gutter in its header (BU-131). A stub rather than a polyfill: nothing in
 * jsdom lays anything out, so an observer that never fires reports exactly
 * as much as a real one would.
 */
if (typeof globalThis.ResizeObserver !== 'function') {
  globalThis.ResizeObserver = class {
    observe(): void {
      return undefined
    }

    unobserve(): void {
      return undefined
    }

    disconnect(): void {
      return undefined
    }
  }
}

/**
 * Nor an IntersectionObserver, which the empty-state figures use to sleep
 * their frame loop offscreen (BU-231). Stubbed for the same reason as the
 * ResizeObserver: with no layout, never intersecting is what a real one
 * would report.
 */
if (typeof globalThis.IntersectionObserver !== 'function') {
  globalThis.IntersectionObserver = class {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds: readonly number[] = []

    observe(): void {
      return undefined
    }

    unobserve(): void {
      return undefined
    }

    disconnect(): void {
      return undefined
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
}

/**
 * jsdom has no canvas, and `getContext` returns null (ADR-0002).
 *
 * lightweight-charts asks for one while sizing its price axis, and throws
 * "Value is null" out of an internal resize rather than returning nothing.
 * That happens off the call stack of any test — an autoSize observer or a
 * queued frame — so it lands as an unhandled error and failed the whole run
 * about one time in three (BU-171).
 *
 * The stub measures nothing and draws nothing, which is honest: no test here
 * asserts on a canvas, and a chart that cannot draw is exactly what jsdom is.
 * A test that needs real rendering belongs in the E2E suite, against Chromium.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  /*
   * Every method the chart reaches for, and nothing else.
   *
   * A Proxy rather than a list: the library paints through `fancy-canvas`,
   * which calls whatever the 2D context has, and a stub that answers half of
   * them fails later and less legibly than one that answers none. Reads that
   * must return a value are named; everything else is a no-op function.
   */
  const values: Record<string, unknown> = {
    canvas: undefined,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) })
  }

  const context = new Proxy(values, {
    get: (target, property) => (property in target ? target[property as string] : () => undefined)
  })

  HTMLCanvasElement.prototype.getContext = (() =>
    context) as unknown as HTMLCanvasElement['getContext']
}
