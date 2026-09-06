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
