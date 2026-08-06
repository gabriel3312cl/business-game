import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import CloseFullscreenRoundedIcon from '@mui/icons-material/CloseFullscreenRounded'
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import {
  Alert,
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
  Typography,
} from '@mui/material'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { activeGameSession, api, ApiError, authToken } from './api'
import { GameAdvisorChat } from './advisor/GameAdvisorChat'
import { BoardStudio } from './board-editor/BoardStudio'
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

const ActiveGamesPanel = lazy(() =>
  import('./components/ActiveGamesPanel').then((module) => ({
    default: module.ActiveGamesPanel,
  })),
)

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
  const [activeGames, setActiveGames] = useState<GameState[]>([])
  const [activeGamesLoading, setActiveGamesLoading] = useState(false)
  const [gamePack, setGamePack] = useState<ContentPack | null>(null)
  const [gameError, setGameError] = useState<string | null>(null)
  const [joinGameId, setJoinGameId] = useState('')
  const [boardStudioOpen, setBoardStudioOpen] = useState(false)
  const [customPackNames, setCustomPackNames] = useState<Record<string, string>>(
    {},
  )
  const activeGamePackId = createdGame?.pack_id
  const activeGamePackVersion = createdGame?.pack_version
  const customManifests = manifests.filter((item) => item.board_mode === 'custom')
  const displayedPack = createdGame && gamePack ? gamePack : pack
  const displayedMode =
    createdGame && gamePack ? gamePack.manifest.board_mode : selectedMode
  const applyGameState = useCallback((nextGame: GameState) => {
    setCreatedGame((currentGame) => {
      if (!currentGame || currentGame.id !== nextGame.id) return nextGame
      return gameSequence(nextGame) >= gameSequence(currentGame)
        ? nextGame
        : currentGame
    })
  }, [])

  const refreshActiveGames = useCallback(async () => {
    if (!user) {
      setActiveGames([])
      return
    }
    setActiveGamesLoading(true)
    try {
      setActiveGames(await api.listActiveGames())
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        authToken.clear()
        setUser(null)
        setActiveGames([])
        setAuthOpen(true)
      } else {
        setGameError(t('activeGames.loadError'))
      }
    } finally {
      setActiveGamesLoading(false)
    }
  }, [t, user])

  const resumeGame = useCallback(
    (game: GameState) => {
      activeGameSession.set(game.id)
      setZoom(1)
      applyGameState(game)
    },
    [applyGameState],
  )

  const loadManifests = useCallback(async () => {
    setError(false)
    try {
      const available = await api.listPacks()
      setManifests(available)
      const selected =
        available.find((item) => item.board_mode === selectedMode) ??
        (selectedMode === 'custom' ? undefined : available[0])
      if (selected) {
        setPack(await api.getPack(selected.id, i18n.language, selected.version))
      } else {
        setPack(null)
      }
    } catch {
      setError(true)
    }
  }, [i18n.language, selectedMode])

  useEffect(() => {
    void loadManifests()
  }, [loadManifests])

  useEffect(() => {
    if (selectedMode !== 'custom') return
    const custom = manifests.filter((item) => item.board_mode === 'custom')
    let active = true
    void Promise.all(
      custom.map(async (manifest) => {
        const content = await api.getPack(
          manifest.id,
          i18n.language,
          manifest.version,
        )
        return [
          `${manifest.id}@${manifest.version}`,
          content.messages[content.manifest.name_key] ?? manifest.id,
        ] as const
      }),
    )
      .then((entries) => {
        if (active) setCustomPackNames(Object.fromEntries(entries))
      })
      .catch(() => {
        if (active) setCustomPackNames({})
      })
    return () => {
      active = false
    }
  }, [i18n.language, manifests, selectedMode])

  useEffect(() => {
    let active = true
    const restoreSession = async () => {
      try {
        const currentUser = await api.me()
        if (!active) return
        setUser(currentUser)
        const activeGameId = activeGameSession.get()
        const activeGames = await api.listActiveGames()
        if (!active) return
        setActiveGames(activeGames)
        const restoredGame = activeGameId
          ? activeGames.find((game) => game.id === activeGameId)
          : undefined
        if (restoredGame) {
          resumeGame(restoredGame)
        } else if (activeGameId) {
          activeGameSession.clear()
        }
      } catch (requestError: unknown) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          authToken.clear()
          if (active) setUser(null)
        }
      }
    }
    void restoreSession()
    return () => {
      active = false
    }
  }, [resumeGame])

  useEffect(() => {
    if (!activeGamePackId) {
      setGamePack(null)
      return
    }
    let active = true
    api
      .getPack(activeGamePackId, i18n.language, activeGamePackVersion)
      .then((loadedPack) => {
        if (active) setGamePack(loadedPack)
      })
      .catch(() => {
        if (active) setGameError(t('loadError'))
      })
    return () => {
      active = false
    }
  }, [activeGamePackId, activeGamePackVersion, i18n.language, t])

  const selectMode = async (mode: BoardMode) => {
    setSelectedMode(mode)
    setPack(null)
    const selected = manifests.find((item) => item.board_mode === mode)
    if (selected) {
      setPack(await api.getPack(selected.id, i18n.language, selected.version))
      setZoom(1)
    } else {
      setPack(null)
    }
  }

  const selectManifest = async (manifest: PackManifest) => {
    setSelectedMode(manifest.board_mode)
    setPack(null)
    setPack(await api.getPack(manifest.id, i18n.language, manifest.version))
    setZoom(1)
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
      authToken.set(token.access_token, token.user_id)
      const currentUser = await api.me()
      setUser(currentUser)
      const activeGameId = activeGameSession.get()
      const activeGames = await api.listActiveGames()
      setActiveGames(activeGames)
      const restoredGame = activeGameId
        ? activeGames.find((game) => game.id === activeGameId)
        : undefined
      if (restoredGame) {
        resumeGame(restoredGame)
      } else if (activeGameId) {
        activeGameSession.clear()
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
      const game = await api.createGame(pack.manifest.id, pack.manifest.version)
      activeGameSession.set(game.id)
      setZoom(1)
      applyGameState(game)
    } catch (requestError: unknown) {
      if (requestError instanceof ApiError && requestError.status === 401) {
        authToken.clear()
        setUser(null)
        setAuthOpen(true)
      }
      setGameError(t('gameError'))
    }
  }

  const logout = async () => {
    try {
      await api.logout()
    } finally {
      authToken.clear()
      activeGameSession.clear()
      setUser(null)
      setActiveGames([])
      setCreatedGame(null)
      setGamePack(null)
      setBoardStudioOpen(false)
    }
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
      setZoom(1)
      applyGameState(game)
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
      setZoom(1)
      applyGameState(game)
    } catch {
      setGameError(t('watchGameError'))
    }
  }

  const leaveActiveGame = () => {
    const leavingGameId = createdGame?.id
    activeGameSession.clear()
    setCreatedGame(null)
    setGamePack(null)
    if (leavingGameId) {
      setActiveGames((games) => games.filter((game) => game.id !== leavingGameId))
    }
    void refreshActiveGames()
  }

  const returnToMenu = () => {
    activeGameSession.clear()
    setCreatedGame(null)
    setGamePack(null)
    void refreshActiveGames()
  }

  const handleSessionExpired = useCallback(() => {
    authToken.clear()
    setUser(null)
    setActiveGames([])
    setCreatedGame(null)
    setGamePack(null)
    setAuthMode('login')
    setAuthError(null)
    setAuthOpen(true)
  }, [])

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        height: { xs: createdGame ? '100dvh' : 'auto', md: '100dvh' },
        overflow: { xs: createdGame ? 'hidden' : 'visible', md: 'hidden' },
        bgcolor: 'background.default',
      }}
    >
      <Container
        maxWidth={false}
        disableGutters={Boolean(createdGame)}
        sx={
          createdGame
            ? { height: '100dvh', overflow: 'hidden' }
            : {
                py: 3,
                px: { xs: 1.5, md: 3 },
                height: { md: '100dvh' },
                overflow: { md: 'hidden' },
                display: { md: 'flex' },
                flexDirection: 'column',
              }
        }
      >
        {!createdGame && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 2 }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={900}>
                BUSINESS<span style={{ color: '#b8ff3d' }}>GAME</span>
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: { xs: 'none', sm: 'block' } }}
              >
                {t('subtitle')}
              </Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <FormControl size="small">
                <Select
                  value={i18n.language}
                  onChange={(event) =>
                    void i18n.changeLanguage(event.target.value)
                  }
                  aria-label="Language"
                >
                  <MenuItem value="es">ES</MenuItem>
                  <MenuItem value="en">EN</MenuItem>
                </Select>
              </FormControl>
              {user && (
                <Button
                  variant={boardStudioOpen ? 'contained' : 'outlined'}
                  color="secondary"
                  startIcon={<DashboardCustomizeRoundedIcon />}
                  onClick={() => setBoardStudioOpen(true)}
                  sx={{
                    minWidth: { xs: 40, sm: 'auto' },
                    px: { xs: 1, sm: 2 },
                    '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
                  }}
                  aria-label={t('boardStudio')}
                >
                  <Box
                    component="span"
                    sx={{ display: { xs: 'none', sm: 'inline' } }}
                  >
                    {t('createBoard')}
                  </Box>
                </Button>
              )}
              {user ? (
                <>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.7}
                    sx={{ display: { xs: 'none', sm: 'flex' } }}
                  >
                    <AccountCircleRoundedIcon color="secondary" />
                    <Typography variant="body2">{user.display_name}</Typography>
                  </Stack>
                  <Button
                    color="inherit"
                    startIcon={<LogoutRoundedIcon />}
                    onClick={() => void logout()}
                    sx={{
                      minWidth: { xs: 40, sm: 'auto' },
                      px: { xs: 1, sm: 2 },
                      '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
                    }}
                    aria-label={t('logout')}
                  >
                    <Box
                      component="span"
                      sx={{ display: { xs: 'none', sm: 'inline' } }}
                    >
                      {t('logout')}
                    </Box>
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
            </Stack>
          </Stack>
        )}

        {!createdGame && !boardStudioOpen && (
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
              onChange={(_, mode: BoardMode | null) => {
                if (mode) void selectMode(mode)
              }}
            >
              <ToggleButton value="classic">{t('classic')}</ToggleButton>
              <ToggleButton value="extended">{t('extended')}</ToggleButton>
              <ToggleButton value="custom" disabled={customManifests.length === 0}>
                {t('custom')}
              </ToggleButton>
            </ToggleButtonGroup>
            {displayedMode === 'custom' && customManifests.length > 0 && (
              <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 230 } }}>
                <Select
                  aria-label={t('customBoard')}
                  value={
                    pack
                      ? `${pack.manifest.id}@${pack.manifest.version}`
                      : `${customManifests[0].id}@${customManifests[0].version}`
                  }
                  onChange={(event) => {
                    const selected = customManifests.find(
                      (item) => `${item.id}@${item.version}` === event.target.value,
                    )
                    if (selected) void selectManifest(selected)
                  }}
                >
                  {customManifests.map((item) => (
                    <MenuItem
                      key={`${item.id}@${item.version}`}
                      value={`${item.id}@${item.version}`}
                    >
                      {customPackNames[`${item.id}@${item.version}`] ?? item.id} · v
                      {item.version}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
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
        )}

        {user && !createdGame && !boardStudioOpen && (
          <>
            <Suspense
              fallback={
                <Stack alignItems="center" sx={{ mb: 2 }}>
                  <CircularProgress size={24} />
                </Stack>
              }
            >
              <ActiveGamesPanel
                games={activeGames}
                user={user}
                loading={activeGamesLoading}
                onResume={resumeGame}
                onRefresh={() => void refreshActiveGames()}
              />
            </Suspense>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
              <TextField
                size="small"
                label={t('gameId')}
                value={joinGameId}
                onChange={(event) => setJoinGameId(event.target.value)}
                sx={{ width: { xs: '100%', sm: 320 } }}
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
          </>
        )}
        {createdGame && gamePack && user && (
          <>
            <GameSessionPanel
              game={createdGame}
              pack={gamePack}
              user={user}
              zoom={zoom}
              onChange={applyGameState}
              onBackToMenu={returnToMenu}
              onLeave={leaveActiveGame}
              onLogout={() => void logout()}
              onSessionExpired={handleSessionExpired}
            />
            <GameAdvisorChat
              key={createdGame.id}
              game={createdGame}
              pack={gamePack}
              user={user}
            />
          </>
        )}
        {gameError && (
          <Alert
            severity="warning"
            onClose={() => setGameError(null)}
            sx={
              createdGame
                ? {
                    position: 'fixed',
                    top: 12,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1500,
                    width: 'min(92vw, 620px)',
                  }
                : { mb: 2 }
            }
          >
            {gameError}
          </Alert>
        )}

        {boardStudioOpen && user ? (
          <BoardStudio
            locale={i18n.language}
            onClose={() => setBoardStudioOpen(false)}
            onPublished={() => void loadManifests()}
          />
        ) : error ? (
          <Alert
            severity="error"
            action={<Button onClick={() => void loadManifests()}>{t('retry')}</Button>}
          >
            {t('loadError')}
          </Alert>
        ) : createdGame ? (
          !gamePack ? (
            <Stack alignItems="center" py={10} spacing={2}>
              <CircularProgress />
              <Typography color="text.secondary">{t('loading')}</Typography>
            </Stack>
          ) : null
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
              flex: { md: 1 },
              height: { md: expanded ? '100vh' : 'auto' },
              minWidth: 0,
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
              fitAvailableHeight={!expanded}
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

function gameSequence(game: GameState): number {
  return game.events.at(-1)?.sequence ?? 0
}
