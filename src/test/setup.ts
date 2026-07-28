import '@testing-library/jest-dom/vitest'

/**
 * jsdom does not implement matchMedia, and anything touching the theme calls
 * it. Defaults to light; tests that care about OS preference stub their own
 * controllable version over the top.
 */
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
