import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DEFAULT_GAME_COLOR_THEME,
  GAME_COLOR_THEMES,
  type GameColorThemeDefinition,
} from '../theme'
import type { GameColorThemeId } from '../types'

interface Props {
  value: GameColorThemeId
  onChange: (themeId: GameColorThemeId) => void
}

export function ColorThemeControl({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip
        title={t('colorTheme.current', {
          theme: t(`colorTheme.options.${value}.name`),
        })}
      >
        <IconButton
          size="small"
          color="secondary"
          aria-label={t('colorTheme.open')}
          onClick={() => setOpen(true)}
        >
          <PaletteRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
        aria-labelledby="color-theme-title"
      >
        <DialogTitle id="color-theme-title">
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <PaletteRoundedIcon color="secondary" />
              <Typography component="span" variant="h6" fontWeight={850}>
                {t('colorTheme.title')}
              </Typography>
            </Stack>
            <IconButton aria-label={t('close')} onClick={() => setOpen(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('colorTheme.description')}
          </Typography>
          <Stack spacing={2.25}>
            <ThemeOptionsSection
              title={t('colorTheme.groups.dark')}
              definitions={GAME_COLOR_THEMES.filter(
                (definition) => definition.mode !== 'light',
              )}
              value={value}
              onChange={onChange}
            />
            <ThemeOptionsSection
              title={t('colorTheme.groups.light')}
              definitions={GAME_COLOR_THEMES.filter(
                (definition) => definition.mode === 'light',
              )}
              value={value}
              onChange={onChange}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" mt={2}>
            {t('colorTheme.gameplayColorsNote')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            color="inherit"
            startIcon={<RestartAltRoundedIcon />}
            disabled={value === DEFAULT_GAME_COLOR_THEME}
            onClick={() => onChange(DEFAULT_GAME_COLOR_THEME)}
          >
            {t('colorTheme.restoreDefault')}
          </Button>
          <Button onClick={() => setOpen(false)}>{t('done')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function ThemeOptionsSection({
  title,
  definitions,
  value,
  onChange,
}: {
  title: string
  definitions: readonly GameColorThemeDefinition[]
  value: GameColorThemeId
  onChange: (themeId: GameColorThemeId) => void
}) {
  return (
    <Box component="section" aria-label={title}>
      <Typography
        variant="overline"
        color="text.secondary"
        fontWeight={850}
        display="block"
        mb={0.75}
      >
        {title}
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 1.25,
        }}
      >
        {definitions.map((definition) => (
          <ThemeOption
            key={definition.id}
            definition={definition}
            selected={value === definition.id}
            onSelect={() => onChange(definition.id)}
          />
        ))}
      </Box>
    </Box>
  )
}

function ThemeOption({
  definition,
  selected,
  onSelect,
}: {
  definition: GameColorThemeDefinition
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()

  return (
    <ButtonBase
      aria-pressed={selected}
      onClick={onSelect}
      sx={{
        display: 'block',
        width: '100%',
        borderRadius: 2,
        textAlign: 'left',
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        overflow: 'hidden',
        transition: 'transform 120ms ease, border-color 120ms ease',
        '&:hover': { transform: 'translateY(-2px)' },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          height: 88,
          p: 1,
          bgcolor: definition.background,
          backgroundImage: definition.backdrop,
          color: definition.text,
        }}
      >
        <Stack direction="row" spacing={0.45} mb={1}>
          {[definition.primary, definition.secondary, definition.mutedText].map(
            (color) => (
              <Box
                key={color}
                sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }}
              />
            ),
          )}
        </Stack>
        <Box
          sx={{
            height: 56,
            p: 0.8,
            borderRadius: `${Math.max(2, definition.radius - 4)}px`,
            bgcolor: definition.translucentSurface,
            border: `1px solid ${definition.border}`,
            boxShadow: definition.shadow,
          }}
        >
          <Stack direction="row" spacing={0.7} height="100%">
            <Box
              sx={{
                width: '38%',
                borderRadius: 0.75,
                bgcolor: definition.elevatedSurface,
              }}
            />
            <Stack flex={1} spacing={0.55} justifyContent="center">
              <Box sx={{ height: 6, borderRadius: 9, bgcolor: definition.primary }} />
              <Box
                sx={{
                  height: 6,
                  width: '72%',
                  borderRadius: 9,
                  bgcolor: definition.secondary,
                }}
              />
            </Stack>
          </Stack>
        </Box>
      </Box>
      <Stack
        direction="row"
        alignItems="flex-start"
        spacing={1}
        sx={{ p: 1.1, bgcolor: 'background.paper', minHeight: 68 }}
      >
        <Box minWidth={0} flex={1}>
          <Typography variant="subtitle2" fontWeight={850}>
            {t(`colorTheme.options.${definition.id}.name`)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t(`colorTheme.options.${definition.id}.description`)}
          </Typography>
        </Box>
        {selected && <CheckRoundedIcon color="primary" fontSize="small" />}
      </Stack>
    </ButtonBase>
  )
}
