import AutoAwesomeMotionRoundedIcon from '@mui/icons-material/AutoAwesomeMotionRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material'
import { useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { VisualEffectsIntensity } from '../types'

interface Props {
  value: VisualEffectsIntensity
  systemReducedMotion: boolean
  onChange: (value: VisualEffectsIntensity) => void
}

const OPTIONS: VisualEffectsIntensity[] = ['full', 'soft', 'off']

export function VisualEffectsControl({
  value,
  systemReducedMotion,
  onChange,
}: Props) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const openMenu = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)
  const closeMenu = () => setAnchor(null)

  return (
    <>
      <Tooltip
        title={
          systemReducedMotion
            ? t('visualEffects.systemReducedMotion')
            : t('visualEffects.current', {
                value: t(`visualEffects.options.${value}`),
              })
        }
      >
        <IconButton
          size="small"
          color={value === 'off' || systemReducedMotion ? 'default' : 'secondary'}
          aria-label={t('visualEffects.open')}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={openMenu}
        >
          <AutoAwesomeMotionRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
        {OPTIONS.map((option) => (
          <MenuItem
            key={option}
            selected={value === option}
            onClick={() => {
              onChange(option)
              closeMenu()
            }}
          >
            <ListItemIcon>
              {value === option ? <CheckRoundedIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText
              primary={t(`visualEffects.options.${option}`)}
              secondary={t(`visualEffects.descriptions.${option}`)}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
