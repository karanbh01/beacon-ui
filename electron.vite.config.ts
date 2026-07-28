import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = resolve('src/shared')
const renderer = resolve('src/renderer/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@shared': shared,
        '@/components': resolve(renderer, 'components'),
        '@/views': resolve(renderer, 'views'),
        '@/api': resolve(renderer, 'api'),
        '@/state': resolve(renderer, 'state'),
        '@/tokens': resolve(renderer, 'tokens')
      }
    },
    plugins: [react()]
  }
})
