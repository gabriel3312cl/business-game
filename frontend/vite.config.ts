import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 43173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:48010',
      '/socket.io': {
        target: 'ws://127.0.0.1:48010',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          mui: [
            '@emotion/react',
            '@emotion/styled',
            '@mui/icons-material',
            '@mui/material',
          ],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
