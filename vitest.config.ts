import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  css: { transformer: 'lightningcss' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
  },
})
