import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const renderer = resolve(__dirname, 'src/renderer/src')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@/components': resolve(renderer, 'components'),
      '@/views': resolve(renderer, 'views'),
      '@/api': resolve(renderer, 'api'),
      '@/state': resolve(renderer, 'state'),
      '@/tokens': resolve(renderer, 'tokens')
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/test/**', 'src/renderer/src/main.tsx']
    }
  }
})
