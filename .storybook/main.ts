import { resolve } from 'node:path'
import type { StorybookConfig } from '@storybook/react-vite'

const renderer = resolve(__dirname, '../src/renderer/src')

const config: StorybookConfig = {
  stories: ['../src/renderer/src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-themes'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  core: { disableTelemetry: true },
  // Storybook runs its own Vite config, so the renderer aliases from
  // electron.vite.config.ts have to be restated here or imports break.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      alias: {
        ...viteConfig.resolve?.alias,
        '@shared': resolve(__dirname, '../src/shared'),
        '@/components': resolve(renderer, 'components'),
        '@/views': resolve(renderer, 'views'),
        '@/api': resolve(renderer, 'api'),
        '@/state': resolve(renderer, 'state'),
        '@/tokens': resolve(renderer, 'tokens')
      }
    }
  })
}

export default config
