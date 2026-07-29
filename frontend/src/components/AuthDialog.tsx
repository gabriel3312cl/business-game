import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export type AuthMode = 'login' | 'register'

interface AuthDialogProps {
  open: boolean
  mode: AuthMode
  busy: boolean
  error: string | null
  onClose: () => void
  onModeChange: (mode: AuthMode) => void
  onSubmit: (data: {
    email: string
    password: string
    displayName: string
  }) => Promise<void>
}

export function AuthDialog({
  open,
  mode,
  busy,
  error,
  onClose,
  onModeChange,
  onSubmit,
}: AuthDialogProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    if (!open) {
      setPassword('')
    }
  }, [open])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onSubmit({ email: email.trim(), password, displayName: displayName.trim() })
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={(event) => void submit(event)}>
        <DialogTitle>{t('account')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={mode}
              onChange={(_, value: AuthMode | null) => {
                if (value) onModeChange(value)
              }}
            >
              <ToggleButton value="login">{t('login')}</ToggleButton>
              <ToggleButton value="register">{t('register')}</ToggleButton>
            </ToggleButtonGroup>
            {error && <Alert severity="error">{error}</Alert>}
            {mode === 'register' && (
              <TextField
                autoFocus
                required
                label={t('displayName')}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                inputProps={{ minLength: 2, maxLength: 40 }}
              />
            )}
            <TextField
              autoFocus={mode === 'login'}
              required
              type="email"
              label={t('email')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              required
              type="password"
              label={t('password')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              inputProps={{ minLength: 10, maxLength: 128 }}
              helperText={mode === 'register' ? t('passwordHelp') : undefined}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {mode === 'login' ? t('login') : t('register')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
