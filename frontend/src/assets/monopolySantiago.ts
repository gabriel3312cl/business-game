import manifest from './monopoly-santiago-manifest.json'

interface SantiagoManifestTile {
  pos: number
  nombre: string
  svg: string
}

const tiles = manifest.casillas as SantiagoManifestTile[]
const basePath = '/assets/monopoly-santiago/'

export interface SantiagoAssetOption {
  label: string
  path: string
}

export const santiagoTileAssetOptions: SantiagoAssetOption[] = Array.from(
  new Map(
    tiles.map((tile) => [
      tile.svg,
      { label: tile.nombre, path: `${basePath}${tile.svg}` },
    ]),
  ).values(),
)

export function santiagoTileAssetForPosition(
  position: number,
): string | undefined {
  const tile = tiles.find((candidate) => candidate.pos === position)
  return tile ? `${basePath}${tile.svg}` : undefined
}

export const santiagoTokenAssets: SantiagoAssetOption[] = [
  { label: 'Micro', path: `${basePath}svg-fichas/ficha_micro.svg` },
  { label: 'Colectivo', path: `${basePath}svg-fichas/ficha_colectivo.svg` },
  { label: 'Completo italiano', path: `${basePath}svg-fichas/ficha_completo.svg` },
  { label: 'Terremoto', path: `${basePath}svg-fichas/ficha_terremoto.svg` },
  {
    label: 'Cerro San Cristóbal',
    path: `${basePath}svg-fichas/ficha_sancristobal.svg`,
  },
  { label: 'Gato callejero', path: `${basePath}svg-fichas/ficha_gato.svg` },
]
