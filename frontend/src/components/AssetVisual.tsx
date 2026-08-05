import { Box } from '@mui/material'
import type { TileIcon, TileKind } from '../types'
import { tileIconComponent } from './tilePresentation'

export function AssetGlyph({
  path,
  size = '70%',
}: {
  path: string
  size?: string | number
}) {
  return (
    <Box
      component="span"
      sx={{
        display: 'block',
        width: size,
        height: size,
        bgcolor: 'currentColor',
        WebkitMask: `url("${path}") center / contain no-repeat`,
        mask: `url("${path}") center / contain no-repeat`,
      }}
    />
  )
}

export function TileVisual({
  kind,
  icon,
  assetPath,
}: {
  kind: TileKind
  icon?: TileIcon
  assetPath?: string
}) {
  if (assetPath) return <AssetGlyph path={assetPath} />
  const Icon = tileIconComponent(kind, icon)
  return <Icon fontSize="small" />
}
