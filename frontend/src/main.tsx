import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { GameThemeProvider } from './GameThemeProvider'
import './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameThemeProvider>
      <App />
    </GameThemeProvider>
  </StrictMode>,
)
