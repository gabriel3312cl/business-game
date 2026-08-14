import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Fab,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Radio,
  RadioGroup,
  Rating,
  Select,
  Skeleton,
  Slider,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material'
import { ThemeProvider } from '@mui/material/styles'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dice3D } from '../components/Dice3D'
import { TileVisual } from '../components/AssetVisual'
import {
  createGameTheme,
  DEFAULT_GAME_COLOR_THEME,
  GAME_COLOR_THEMES,
  getGameColorTheme,
} from '../theme'
import type { GameColorThemeId } from '../types'

export function AdminComponentGallery() {
  const { t } = useTranslation()
  const [themeId, setThemeId] = useState<GameColorThemeId>(DEFAULT_GAME_COLOR_THEME)
  const [sampleTab, setSampleTab] = useState('overview')
  const [toggle, setToggle] = useState('classic')
  const [checked, setChecked] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  const [diceSequence, setDiceSequence] = useState(0)
  const previewTheme = useMemo(() => createGameTheme(themeId), [themeId])
  const previewThemeDefinition = getGameColorTheme(themeId)

  return (
    <Stack spacing={2.5}>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, md: 2.5 },
          background:
            'linear-gradient(135deg, var(--game-theme-primary-soft), var(--game-theme-secondary-soft))',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          justifyContent="space-between"
          alignItems={{ md: 'center' }}
          spacing={2}
        >
          <Box>
            <Typography variant="overline" color="secondary" fontWeight={900}>
              {t('admin.components.eyebrow')}
            </Typography>
            <Typography variant="h5" component="h2" fontWeight={900}>
              {t('admin.components.title')}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
              {t('admin.components.description')}
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 240 } }}>
            <InputLabel id="component-gallery-theme-label">
              {t('admin.components.previewTheme')}
            </InputLabel>
            <Select
              labelId="component-gallery-theme-label"
              value={themeId}
              label={t('admin.components.previewTheme')}
              onChange={(event) => setThemeId(event.target.value as GameColorThemeId)}
            >
              {GAME_COLOR_THEMES.map((definition) => (
                <MenuItem key={definition.id} value={definition.id}>
                  {t(`colorTheme.options.${definition.id}.name`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <ThemeProvider theme={previewTheme}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1.5, md: 2.5 },
            bgcolor: 'background.default',
            color: 'text.primary',
            backgroundImage: previewThemeDefinition.backdrop,
          }}
        >
          <Stack spacing={3}>
            <ComponentSection
              title={t('admin.components.sections.foundation')}
              description={t('admin.components.sections.foundationHelp')}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' },
                  gap: 2,
                }}
              >
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h1" sx={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
                    Título H1
                  </Typography>
                  <Typography variant="h4" fontWeight={800}>Título H4</Typography>
                  <Typography variant="h6">Título H6</Typography>
                  <Typography variant="subtitle1" fontWeight={750}>Subtítulo destacado</Typography>
                  <Typography variant="body1">Texto principal para contenido y explicaciones.</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Texto secundario para contexto, metadata y ayuda.
                  </Typography>
                  <Typography variant="caption">Caption · 12:45 · ID 8F2A</Typography>
                </Paper>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 1,
                  }}
                >
                  {[
                    ['primary.main', previewTheme.palette.primary.main],
                    ['secondary.main', previewTheme.palette.secondary.main],
                    ['background.default', previewTheme.palette.background.default],
                    ['background.paper', previewTheme.palette.background.paper],
                    ['text.primary', previewTheme.palette.text.primary],
                    ['text.secondary', previewTheme.palette.text.secondary],
                  ].map(([label, color]) => (
                    <Paper key={label} variant="outlined" sx={{ overflow: 'hidden' }}>
                      <Box sx={{ height: 54, bgcolor: color }} />
                      <Typography variant="caption" display="block" sx={{ p: 1 }}>
                        {label}<br />{color}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.actions')}
              description={t('admin.components.sections.actionsHelp')}
            >
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Button variant="contained">Primaria</Button>
                  <Button variant="contained" color="secondary">Secundaria</Button>
                  <Button variant="outlined">Outlined</Button>
                  <Button variant="text">Texto</Button>
                  <Button variant="contained" startIcon={<AddRoundedIcon />}>Con ícono</Button>
                  <Button variant="contained" disabled>Deshabilitado</Button>
                </Stack>
                <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
                  <ButtonGroup size="small" aria-label="Acciones agrupadas">
                    <Button>Editar</Button>
                    <Button>Duplicar</Button>
                    <Button color="error">Eliminar</Button>
                  </ButtonGroup>
                  <Tooltip title="Más opciones"><IconButton aria-label="Más opciones"><MoreVertRoundedIcon /></IconButton></Tooltip>
                  <IconButton color="error" aria-label="Eliminar"><DeleteRoundedIcon /></IconButton>
                  <Fab size="small" color="primary" aria-label="Agregar"><AddRoundedIcon /></Fab>
                </Stack>
              </Stack>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.forms')}
              description={t('admin.components.sections.formsHelp')}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                  gap: 2,
                }}
              >
                <Stack spacing={2}>
                  <TextField label="Nombre de jugador" defaultValue="Batman" />
                  <TextField label="Con error" defaultValue="valor-inválido" error helperText="Revisa este valor." />
                  <FormControl fullWidth>
                    <InputLabel id="gallery-select-label">Dificultad</InputLabel>
                    <Select labelId="gallery-select-label" defaultValue="standard" label="Dificultad">
                      <MenuItem value="easy">Fácil</MenuItem>
                      <MenuItem value="standard">Estándar</MenuItem>
                      <MenuItem value="pro">Pro</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
                <Stack spacing={1.5}>
                  <FormControlLabel
                    control={<Switch checked={checked} onChange={(_, value) => setChecked(value)} />}
                    label="Economía avanzada"
                  />
                  <FormControlLabel control={<Checkbox defaultChecked />} label="Recordar preferencia" />
                  <FormControl>
                    <FormLabel>Modo de tablero</FormLabel>
                    <RadioGroup row defaultValue="classic">
                      <FormControlLabel value="classic" control={<Radio />} label="Clásico" />
                      <FormControlLabel value="extended" control={<Radio />} label="Extendido" />
                    </RadioGroup>
                  </FormControl>
                  <Box>
                    <Typography variant="body2" gutterBottom>Zoom del tablero</Typography>
                    <Slider defaultValue={70} valueLabelDisplay="auto" />
                  </Box>
                  <Rating defaultValue={4} icon={<FavoriteRoundedIcon fontSize="inherit" />} emptyIcon={<FavoriteRoundedIcon fontSize="inherit" />} />
                </Stack>
              </Box>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.navigation')}
              description={t('admin.components.sections.navigationHelp')}
            >
              <Stack spacing={2}>
                <Tabs value={sampleTab} onChange={(_, value: string) => setSampleTab(value)} variant="scrollable" scrollButtons="auto">
                  <Tab value="overview" label="Resumen" />
                  <Tab value="players" label="Jugadores" />
                  <Tab value="market" label="Mercado" />
                  <Tab value="history" label="Historial" disabled />
                </Tabs>
                <ToggleButtonGroup exclusive size="small" value={toggle} onChange={(_, value) => value && setToggle(value)}>
                  <ToggleButton value="classic">Clásico</ToggleButton>
                  <ToggleButton value="extended">Extendido</ToggleButton>
                  <ToggleButton value="visual">Visual</ToggleButton>
                </ToggleButtonGroup>
                <Pagination count={5} color="primary" />
              </Stack>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.feedback')}
              description={t('admin.components.sections.feedbackHelp')}
            >
              <Stack spacing={1.25}>
                <Alert severity="success">Partida guardada correctamente.</Alert>
                <Alert severity="info">Hay una nueva versión del tablero disponible.</Alert>
                <Alert severity="warning">Tu saldo está cerca del mínimo requerido.</Alert>
                <Alert severity="error">No fue posible completar la acción.</Alert>
                <Stack direction="row" spacing={2} alignItems="center" useFlexGap flexWrap="wrap">
                  <CircularProgress size={30} />
                  <Box sx={{ minWidth: 220, flex: 1 }}><LinearProgress variant="determinate" value={64} /></Box>
                  <Skeleton variant="rounded" width={180} height={42} />
                  <Button variant="outlined" onClick={() => setSnackbarOpen(true)}>Mostrar snackbar</Button>
                </Stack>
              </Stack>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.data')}
              description={t('admin.components.sections.dataHelp')}
            >
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                  <Chip label="En juego" color="success" />
                  <Chip label="Pendiente" color="warning" variant="outlined" />
                  <Chip label="Hipotecada" color="error" />
                  <Chip label="Banco" icon={<AccountBalanceRoundedIcon />} />
                  <Badge badgeContent={4} color="error"><NotificationsRoundedIcon /></Badge>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>GS</Avatar>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                  {[
                    ['Saldo disponible', '$24.500', '+12% esta ronda'],
                    ['Propiedades', '7', '2 grupos completos'],
                    ['Patrimonio', '$81.200', 'Segundo lugar'],
                  ].map(([title, value, detail]) => (
                    <Card key={title} variant="outlined">
                      <CardContent>
                        <Typography variant="overline" color="text.secondary">{title}</Typography>
                        <Typography variant="h4" fontWeight={900}>{value}</Typography>
                        <Typography variant="body2" color="text.secondary">{detail}</Typography>
                      </CardContent>
                      <CardActions><Button size="small">Ver detalle</Button></CardActions>
                    </Card>
                  ))}
                </Box>
              </Stack>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.game')}
              description={t('admin.components.sections.gameHelp')}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                    <Box>
                      <Typography fontWeight={850}>Dados 3D</Typography>
                      <Typography variant="body2" color="text.secondary">Componente real de la partida.</Typography>
                    </Box>
                    <Button size="small" startIcon={<PlayArrowRoundedIcon />} onClick={() => setDiceSequence((value) => value + 1)}>Lanzar</Button>
                  </Stack>
                  <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 150 }}>
                    <Dice3D values={[3, 5]} rollSequence={diceSequence} dieLabel="Dado" motionIntensity="full" />
                  </Box>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography fontWeight={850}>Iconografía de casillas</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Visuales reales usados por el tablero.</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
                    {[
                      ['property', 'Propiedad', <HomeWorkRoundedIcon key="property" />],
                      ['bank', 'Banco', <TileVisual key="bank" kind="property" icon="bank" />],
                      ['tax', 'Impuesto', <TileVisual key="tax" kind="tax" />],
                    ].map(([kind, label, visual]) => (
                      <Paper key={String(kind)} variant="outlined" sx={{ p: 1.5, textAlign: 'center', color: 'primary.main' }}>
                        <Box sx={{ height: 42, display: 'grid', placeItems: 'center' }}>{visual}</Box>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                      </Paper>
                    ))}
                  </Box>
                </Paper>
              </Box>
            </ComponentSection>

            <ComponentSection
              title={t('admin.components.sections.overlays')}
              description={t('admin.components.sections.overlaysHelp')}
            >
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Button variant="contained" onClick={() => setDialogOpen(true)}>Abrir diálogo</Button>
                <Tooltip title="Información contextual" arrow><Button startIcon={<InfoOutlinedIcon />}>Ver tooltip</Button></Tooltip>
              </Stack>
            </ComponentSection>
          </Stack>
        </Paper>

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              Diálogo de confirmación
              <IconButton aria-label="Cerrar" onClick={() => setDialogOpen(false)}><CloseRoundedIcon /></IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent dividers>
            <Typography>Este ejemplo permite revisar título, contenido, divisores y acciones del diálogo.</Typography>
          </DialogContent>
          <DialogActions>
            <Button color="inherit" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="contained" onClick={() => setDialogOpen(false)}>Confirmar</Button>
          </DialogActions>
        </Dialog>
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={4000}
          onClose={() => setSnackbarOpen(false)}
          message="Cambios guardados"
          action={<IconButton size="small" color="inherit" aria-label="Cerrar" onClick={() => setSnackbarOpen(false)}><CloseRoundedIcon fontSize="small" /></IconButton>}
        />
      </ThemeProvider>
    </Stack>
  )
}

function ComponentSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Box component="section">
      <Typography variant="h6" component="h3" fontWeight={900}>{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{description}</Typography>
      {children}
      <Divider sx={{ mt: 3 }} />
    </Box>
  )
}
