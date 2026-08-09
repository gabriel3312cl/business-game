import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  TokenAppearanceSettings,
  TokenFillMode,
  TokenShape,
} from '../types'
import { AssetGlyph } from './AssetVisual'
import {
  TOKEN_COLORS,
  TOKEN_EMOJIS,
  TOKEN_GRADIENTS,
  TOKEN_ICONS,
  TOKEN_PATTERNS,
  TOKEN_SHAPES,
  tokenFillStyle,
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
  const iconPreview =
    draft.icon === 'emoji' ? (
      draft.emoji
    ) : selectedIcon?.assetPath ? (
      <AssetGlyph path={selectedIcon.assetPath} size="68%" />
    ) : (
      playerNumber
    )

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
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
                ...tokenFillStyle(draft),
                color: '#090711',
                border: '3px solid #fff',
                boxShadow: `0 0 0 3px #b8ff3d, 0 10px 30px ${draft.color}66`,
                fontSize: 28,
                fontWeight: 900,
                ...tokenShapeStyle(draft.shape),
              }}
            >
              {iconPreview}
            </Box>
            <Typography variant="caption" color="text.secondary">
              {t('token.preview')}
            </Typography>
          </Stack>

          <Box>
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              {t('token.fill')}
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={draft.fill}
              onChange={(_, fill: TokenFillMode | null) => {
                if (fill) setDraft((current) => ({ ...current, fill }))
              }}
            >
              {(['solid', 'gradient', 'pattern'] as TokenFillMode[]).map(
                (fill) => (
                  <ToggleButton key={fill} value={fill}>
                    {t(`token.fills.${fill}`)}
                  </ToggleButton>
                ),
              )}
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              {t(draft.fill === 'solid' ? 'token.color' : 'token.primaryColor')}
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
                    width: 34,
                    height: 34,
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
                sx={{ width: 38, height: 38, p: 0.25, cursor: 'pointer' }}
              />
            </Stack>
          </Box>

          {draft.fill !== 'solid' && (
            <Box>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                {t('token.secondaryColor')}
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
                {TOKEN_COLORS.map((color) => (
                  <Box
                    key={color}
                    component="button"
                    type="button"
                    aria-label={t('token.selectSecondaryColor', { color })}
                    aria-pressed={draft.secondary_color === color}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        secondary_color: color,
                      }))
                    }
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      bgcolor: color,
                      border:
                        draft.secondary_color === color
                          ? '3px solid #fff'
                          : '1px solid rgba(255,255,255,.5)',
                      boxShadow:
                        draft.secondary_color === color
                          ? `0 0 0 2px ${color}`
                          : 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
                <Box
                  component="input"
                  type="color"
                  value={draft.secondary_color}
                  aria-label={t('token.customSecondaryColor')}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      secondary_color: event.target.value,
                    }))
                  }
                  sx={{ width: 38, height: 38, p: 0.25, cursor: 'pointer' }}
                />
              </Stack>
            </Box>
          )}

          {draft.fill === 'gradient' && (
            <Box>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                {t('token.gradientPresets')}
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
                {TOKEN_GRADIENTS.map((gradient) => (
                  <Box
                    key={`${gradient.color}-${gradient.secondaryColor}`}
                    component="button"
                    type="button"
                    aria-label={t('token.selectGradient')}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        color: gradient.color,
                        secondary_color: gradient.secondaryColor,
                        gradient_angle: gradient.angle,
                      }))
                    }
                    sx={{
                      width: 74,
                      height: 42,
                      borderRadius: 2,
                      background: `linear-gradient(${gradient.angle}deg, ${gradient.color}, ${gradient.secondaryColor})`,
                      border: '1px solid rgba(255,255,255,.65)',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </Stack>
              <Typography fontWeight={700} sx={{ mt: 2 }}>
                {t('token.gradientAngle', { angle: draft.gradient_angle })}
              </Typography>
              <Slider
                value={draft.gradient_angle}
                min={0}
                max={315}
                step={45}
                marks
                valueLabelDisplay="auto"
                aria-label={t('token.gradientAngleLabel')}
                onChange={(_, angle) =>
                  setDraft((current) => ({
                    ...current,
                    gradient_angle: angle as number,
                  }))
                }
              />
            </Box>
          )}

          {draft.fill === 'pattern' && (
            <Box>
              <Typography fontWeight={800} sx={{ mb: 1 }}>
                {t('token.pattern')}
              </Typography>
              <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
                {TOKEN_PATTERNS.map((pattern) => (
                  <Box
                    key={pattern}
                    component="button"
                    type="button"
                    aria-pressed={draft.pattern === pattern}
                    onClick={() =>
                      setDraft((current) => ({ ...current, pattern }))
                    }
                    sx={{
                      width: 108,
                      height: 54,
                      borderRadius: 2,
                      ...tokenFillStyle({ ...draft, fill: 'pattern', pattern }),
                      border:
                        draft.pattern === pattern
                          ? '3px solid #fff'
                          : '1px solid rgba(255,255,255,.5)',
                      color: '#090711',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    <Box
                      component="span"
                      sx={{ bgcolor: 'rgba(255,255,255,.72)', px: 0.75, borderRadius: 1 }}
                    >
                      {t(`token.patterns.${pattern}`)}
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          <Box>
            <Typography fontWeight={800} sx={{ mb: 1 }}>
              {t('token.shape')}
            </Typography>
            <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
              {TOKEN_SHAPES.map((shape: TokenShape) => (
                <ToggleButton
                  key={shape}
                  value={shape}
                  selected={draft.shape === shape}
                  onClick={() => setDraft((current) => ({ ...current, shape }))}
                  sx={{ flex: '1 1 140px' }}
                >
                  {t(`token.shapes.${shape}`)}
                </ToggleButton>
              ))}
            </Stack>
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
                  {option.id === 'emoji' ? (
                    <Typography fontSize={28}>{draft.emoji ?? '😀'}</Typography>
                  ) : option.assetPath ? (
                    <AssetGlyph path={option.assetPath} size={30} />
                  ) : (
                    playerNumber
                  )}
                </ToggleButton>
              ))}
            </Stack>
            {draft.icon === 'emoji' && (
              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <Typography fontWeight={750}>{t('token.emojiPresets')}</Typography>
                <Stack direction="row" useFlexGap flexWrap="wrap" gap={0.75}>
                  {TOKEN_EMOJIS.map((emoji) => (
                    <ToggleButton
                      key={emoji}
                      value={emoji}
                      selected={draft.emoji === emoji}
                      aria-label={t('token.selectEmoji', { emoji })}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          icon: 'emoji',
                          emoji,
                        }))
                      }
                      sx={{ width: 48, height: 44, fontSize: 24 }}
                    >
                      {emoji}
                    </ToggleButton>
                  ))}
                </Stack>
                <TextField
                  value={draft.emoji ?? ''}
                  label={t('token.customEmoji')}
                  placeholder="🫣"
                  helperText={t('token.emojiKeyboardHelp')}
                  slotProps={{ htmlInput: { maxLength: 16 } }}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      icon: 'emoji',
                      emoji: event.target.value || null,
                    }))
                  }
                />
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={saving} onClick={onClose} color="inherit">
          {t('cancel')}
        </Button>
        <Button
          disabled={saving || (draft.icon === 'emoji' && !draft.emoji?.trim())}
          onClick={() => onSave(draft)}
          variant="contained"
        >
          {t('token.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
