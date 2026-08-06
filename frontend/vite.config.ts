import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const proxyTarget =
    env.BUSINESS_GAME_VITE_PROXY_TARGET ?? 'http://127.0.0.1:48010'

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 43173,
      strictPort: true,
      proxy: {
        '/api': proxyTarget,
        '/socket.io': {
          target: proxyTarget,
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
  }
})
