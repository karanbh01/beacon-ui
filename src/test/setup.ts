import '@testing-library/jest-dom/vitest'

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
