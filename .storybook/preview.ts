import type { Preview } from '@storybook/react'
import '../src/renderer/src/tokens/tokens.css'
import '../src/renderer/src/tokens/type.css'
import './preview.css'

/**
 * The toolbar theme switch writes `data-theme` on <html>, exactly as the app
 * does. Stories therefore prove the same thing BU-4 proves: components carry
 * no theme knowledge, the root attribute does all the work.
 */
const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' }
        ],
        dynamicTitle: true
      }
    }
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as string
      document.documentElement.dataset.theme = theme
      return Story()
    }
  ],
  parameters: {
    controls: { matchers: { color: /(background|color)$/i } },
    backgrounds: { disable: true }
  }
}

export default preview
