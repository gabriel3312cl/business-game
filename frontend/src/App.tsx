import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  FormControl,
  MenuItem,
  Select,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activeGameSession, api, ApiError, authToken } from './api'
import { AuthDialog, type AuthMode } from './components/AuthDialog'
import { GameBoard } from './components/GameBoard'
import { GameSessionPanel } from './components/GameSessionPanel'
import type {
  BoardMode,
  ContentPack,
  GameState,
  PackManifest,
  User,
} from './types'

export default function App() {
  const { t, i18n } = useTranslation()
  const [manifests, setManifests] = useState<PackManifest[]>([])
  const [pack, setPack] = useState<ContentPack | null>(null)
  const [selectedMode, setSelectedMode] = useState<BoardMode>('classic')
  const [zoom, setZoom] = useState(1)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [createdGame, setCreatedGame] = useState<GameState | null>(null)
  const [gamePack, setGamePack] = useState<ContentPack | null>(null)
  const [gameError, setGameError] = useState<string | null>(null)
  const [joinGameId, setJoinGameId] = useState('')
  const activeGamePackId = createdGame?.pack_id
  const displayedPack = createdGame && gamePack ? gamePack : pack
  const displayedMode =
    createdGame && gamePack ? gamePack.manifest.board_mode : selectedMode

  const loadManifests = useCallback(async () => {
    setError(false)
    try {
      const available = await api.listPacks()
      setManifests(available)
      const selected =
        available.find((item) => item.board_mode === selectedMode) ?? available[0]
      if (selected) {
        setPack(await api.getPack(selected.id, i18n.language))
      }
    } catch {
      setError(true)
    }
  }, [i18n.language, selectedMode])

  useEffect(() => {
    void loadManifests()
  }, [loadManifests])

  useEffect(() => {
    if (!authToken.get()) return
    let active = true
    const restoreSession = async () => {
      try {
        const currentUser = await api.me()
        if (!active) return
        setUser(currentUser)
        const activeGameId = activeGameSession.get()
        if (!activeGameId) return
        try {
          const restoredGame = await api.getGame(activeGameId)
          if (active) setCreatedGame(restoredGame)
        } catch (requestError: unknown) {
          if (
            requestError instanceof ApiError &&
            [403, 404].includes(requestError.status)
          ) {
            activeGameSession.clear()
          }
        }
      } catch (requestError: unknown) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          authToken.clear()
        }
      }
    }
    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!activeGamePackId) {
      setGamePack(null)
      return
    }
    let active = true
    api
      .getPack(activeGamePackId, i18n.language)
      .then((loadedPack) => {
        if (active) setGamePack(loadedPack)
      })
      .catch(() => {
        if (active) setGameError(t('loadError'))
      })
    return () => {
      active = false
    }
  }, [activeGamePackId, i18n.language, t])

  const selectMode = async (mode: BoardMode) => {
    setSelectedMode(mode)
    const selected = manifests.find((item) => item.board_mode === mode)
    if (selected) {
      setPack(await api.getPack(selected.id, i18n.language))
      setZoom(1)
    }
  }

  const submitAuth = async (data: {
    email: string
    password: string
    displayName: string
  }) => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      if (authMode === 'register') {
        await api.register({
          email: data.email,
          password: data.password,
          display_name: data.displayName,
          locale: i18n.language,
        })
      }
      const token = await api.login(data.email, data.password)
      authToken.set(token.access_token)
      setUser(await api.me())
      const activeGameId = activeGameSession.get()
      if (activeGameId) {
        try {
          setCreatedGame(await api.getGame(activeGameId))
        } catch (requestError: unknown) {
          if (
            requestError instanceof ApiError &&
            [403, 404].includes(requestError.status)
          ) {
            activeGameSession.clear()
          }
        }
      }
      setAuthOpen(false)
    } catch {
      setAuthError(t('authError'))
    } finally {
      setAuthBusy(false)
    }
  }

  const createGame = async () => {
    setCreatedGame(null)
    setGamePack(null)
    setGameError(null)
    if (!user || !pack) {
      setAuthMode('login')
      setAuthError(null)
      setAuthOpen(true)
      setGameError(t('authRequired'))
      return
    }
    try {
      const game = await api.createGame(pack.manifest.id)
      activeGameSession.set(game.id)
      setCreatedGame(game)
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        authToken.clear()
        setUser(null)
        setAuthOpen(true)
      }
      setGameError(t('gameError'))
    }
  }

  const logout = () => {
    authToken.clear()
    activeGameSession.clear()
    setUser(null)
    setCreatedGame(null)
    setGamePack(null)
  }

  const joinGame = async () => {
    setGameError(null)
    if (!user) {
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    try {
      const game = await api.joinGame(joinGameId.trim())
      activeGameSession.set(game.id)
      setCreatedGame(game)
    } catch {
      setGameError(t('joinGameError'))
    }
  }

  const watchGame = async () => {
    setGameError(null)
    if (!user) {
      setAuthMode('login')
      setAuthOpen(true)
      return
    }
    try {
      const game = await api.watchGame(joinGameId.trim())
      activeGameSession.set(game.id)
      setCreatedGame(game)
    } catch {
      setGameError(t('watchGameError'))
    }
  }

  const leaveActiveGame = () => {
    activeGameSession.clear()
    setCreatedGame(null)
    setGamePack(null)
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(11,9,18,.86)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" fontWeight={900}>
              BUSINESS<span style={{ color: '#b8ff3d' }}>GAME</span>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('subtitle')}
            </Typography>
          </Box>
          <FormControl size="small">
            <Select
              value={i18n.language}
              onChange={(event) => void i18n.changeLanguage(event.target.value)}
              aria-label="Language"
            >
              <MenuItem value="es">ES</MenuItem>
              <MenuItem value="en">EN</MenuItem>
            </Select>
          </FormControl>
          {user ? (
            <>
              <Stack direction="row" alignItems="center" spacing={0.7}>
                <AccountCircleRoundedIcon color="secondary" />
                <Typography variant="body2">{user.display_name}</Typography>
              </Stack>
              <Button
                color="inherit"
                startIcon={<LogoutRoundedIcon />}
                onClick={logout}
              >
                {t('logout')}
              </Button>
            </>
          ) : (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<AccountCircleRoundedIcon />}
              onClick={() => {
                setAuthMode('login')
                setAuthError(null)
                setAuthOpen(true)
              }}
            >
              {t('login')}
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Container
        maxWidth={false}
        sx={{ py: 3, px: { xs: 1.5, md: 3 } }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ md: 'center' }}
          sx={{ mb: 2 }}
        >
          <Typography fontWeight={750}>{t('board')}</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={displayedMode}
            disabled={Boolean(createdGame)}
            onChange={(_, mode: BoardMode | null) => {
              if (mode) void selectMode(mode)
            }}
          >
            <ToggleButton value="classic">{t('classic')}</ToggleButton>
            <ToggleButton value="extended">{t('extended')}</ToggleButton>
          </ToggleButtonGroup>
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ minWidth: 210 }}
          >
            <Typography variant="body2" color="text.secondary">
              {t('zoom')}
            </Typography>
            <Slider
              min={0.7}
              max={1.35}
              step={0.05}
              value={zoom}
              onChange={(_, value) => setZoom(value as number)}
              size="small"
            />
          </Stack>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={
              expanded ? (
                <CloseFullscreenRoundedIcon />
              ) : (
                <FullscreenRoundedIcon />
              )
            }
            onClick={() => setExpanded((value) => !value)}
            sx={{
              ml: { md: 'auto !important' },
              display: expanded ? 'none' : 'inline-flex',
            }}
          >
            {expanded ? t('leaveFullscreen') : t('fullscreen')}
          </Button>
        </Stack>

        {user && !createdGame && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              label={t('gameId')}
              value={joinGameId}
              onChange={(event) => setJoinGameId(event.target.value)}
              sx={{ minWidth: 320 }}
            />
            <Button
              variant="outlined"
              disabled={!joinGameId.trim()}
              onClick={() => void joinGame()}
            >
              {t('joinGame')}
            </Button>
            <Button
              color="secondary"
              disabled={!joinGameId.trim()}
              onClick={() => void watchGame()}
            >
              {t('watchGame')}
            </Button>
          </Stack>
        )}
        {createdGame && gamePack && user && (
          <GameSessionPanel
            game={createdGame}
            pack={gamePack}
            user={user}
            onChange={setCreatedGame}
            onLeave={leaveActiveGame}
          />
        )}
        {gameError && (
          <Alert severity="warning" onClose={() => setGameError(null)} sx={{ mb: 2 }}>
            {gameError}
          </Alert>
        )}

        {error ? (
          <Alert
            severity="error"
            action={<Button onClick={() => void loadManifests()}>{t('retry')}</Button>}
          >
            {t('loadError')}
          </Alert>
        ) : displayedPack ? (
          <Box
            sx={{
              position: expanded ? 'fixed' : 'relative',
              inset: expanded ? 0 : 'auto',
              zIndex: expanded ? 1300 : 'auto',
              bgcolor: 'background.default',
              overflow: 'auto',
              p: expanded ? 2 : 0,
              display: 'flex',
              alignItems: expanded ? 'center' : 'flex-start',
              justifyContent: 'center',
              minHeight: expanded ? '100vh' : 0,
            }}
          >
            {expanded && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<CloseFullscreenRoundedIcon />}
                onClick={() => setExpanded(false)}
                sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1 }}
              >
                {t('leaveFullscreen')}
              </Button>
            )}
            <GameBoard
              pack={displayedPack}
              zoom={zoom}
              game={createdGame}
              currentUserId={user?.id}
              onCreateGame={() => void createGame()}
            />
          </Box>
        ) : (
          <Stack alignItems="center" py={10} spacing={2}>
            <CircularProgress />
            <Typography color="text.secondary">{t('loading')}</Typography>
          </Stack>
        )}
      </Container>
      <AuthDialog
        open={authOpen}
        mode={authMode}
        busy={authBusy}
        error={authError}
        onClose={() => {
          setAuthOpen(false)
          setAuthError(null)
        }}
        onModeChange={(mode) => {
          setAuthMode(mode)
          setAuthError(null)
        }}
        onSubmit={submitAuth}
      />
    </Box>
  )
}
