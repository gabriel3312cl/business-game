import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TokenAppearanceSettings, TokenShape } from '../types'
import { AssetGlyph } from './AssetVisual'
import {
  TOKEN_COLORS,
  TOKEN_ICONS,
  tokenShapeStyle,
} from './tokenAppearance'

interface Props {
  open: boolean
  value: TokenAppearanceSettings
  playerNumber: number
  saving?: boolean
  onClose: () => void
  onSave: (value: TokenAppearanceSettings) => void
}

export function TokenCustomizationDialog({
  open,
  value,
  playerNumber,
  saving = false,
  onClose,
  onSave,
}: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  const selectedIcon = TOKEN_ICONS.find((option) => option.id === draft.icon)

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PaletteRoundedIcon color="secondary" />
        {t('token.title')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Stack alignItems="center" spacing={1}>
            <Box
              component="span"
              role="img"
              aria-label={t('token.preview')}
              sx={{
                width: 76,
                height: 76,
                display: 'grid',
                placeItems: 'center',
                bgcolor: draft.color,
                color: '#090711',
                border: '3px solid #fff',
                boxShadow: `0 0 0 3px #b8ff3d, 0 10px 30px ${draft.color}66`,
                fontSize: 28,
                fontWeight: 900,
                ...tokenShapeStyle(draft.shape),
              }}
            >
              {selectedIcon?.assetPath ? (
                <AssetGlyph path={selectedIcon.assetPath} size="68%" />
              ) : (
                playerNumber
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t('token.preview')}
            </Typography>
          </Stack>

          <Box>
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              {t('token.color')}
            </Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
              {TOKEN_COLORS.map((color) => (
                <Box
                  key={color}
                  component="button"
                  type="button"
                  aria-label={t('token.selectColor', { color })}
                  aria-pressed={draft.color === color}
                  onClick={() => setDraft((current) => ({ ...current, color }))}
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    bgcolor: color,
                    border: draft.color === color ? '3px solid #fff' : '1px solid rgba(255,255,255,.5)',
                    boxShadow: draft.color === color ? `0 0 0 2px ${color}` : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <Box
                component="input"
                type="color"
                value={draft.color}
                aria-label={t('token.customColor')}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, color: event.target.value }))
                }
                sx={{ width: 42, height: 42, p: 0.25, cursor: 'pointer' }}
              />
            </Stack>
          </Box>

          <Box>
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              {t('token.shape')}
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={draft.shape}
              onChange={(_, shape: TokenShape | null) => {
                if (shape) setDraft((current) => ({ ...current, shape }))
              }}
            >
              {(['circle', 'rounded', 'diamond'] as TokenShape[]).map((shape) => (
                <ToggleButton key={shape} value={shape}>
                  {t(`token.shapes.${shape}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              {t('token.icon')}
            </Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
              {TOKEN_ICONS.map((option) => (
                <ToggleButton
                  key={option.id}
                  value={option.id}
                  selected={draft.icon === option.id}
                  onClick={() =>
                    setDraft((current) => ({ ...current, icon: option.id }))
                  }
                  aria-label={t(option.labelKey)}
                  sx={{ width: 64, height: 58, color: 'text.primary' }}
                >
                  {option.assetPath ? (
                    <AssetGlyph path={option.assetPath} size={30} />
                  ) : (
                    playerNumber
                  )}
                </ToggleButton>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose} color="inherit">
          {t('cancel')}
        </Button>
        <Button disabled={saving} onClick={() => onSave(draft)} variant="contained">
          {t('token.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
