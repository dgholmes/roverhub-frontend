import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Listen on every interface so the console can be opened from a phone or a
    // second laptop on the same LAN, not just this machine. The service URLs
    // follow the host the page was served from -- see
    // src/lib/realtime/serviceHost.ts -- so no rebuild or .env edit is needed
    // when the dev machine's DHCP address changes.
    host: true,
    port: 5175,
  },
})
