import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#b8ff3d' },
    secondary: { main: '#9d8cff' },
    background: {
      default: '#0b0912',
      paper: '#1b172a',
    },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily:
      'Inter, ui-rounded, "SF Pro Rounded", system-ui, -apple-system, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.04em' },
    button: { fontWeight: 750, textTransform: 'none' },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
  },
})
