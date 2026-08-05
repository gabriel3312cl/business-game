import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import BoltRoundedIcon from '@mui/icons-material/BoltRounded'
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded'
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded'
import FlagRoundedIcon from '@mui/icons-material/FlagRounded'
import FlightRoundedIcon from '@mui/icons-material/FlightRounded'
import GavelRoundedIcon from '@mui/icons-material/GavelRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import LocalPoliceRoundedIcon from '@mui/icons-material/LocalPoliceRounded'
import PaidRoundedIcon from '@mui/icons-material/PaidRounded'
import QuestionMarkRoundedIcon from '@mui/icons-material/QuestionMarkRounded'
import RedeemRoundedIcon from '@mui/icons-material/RedeemRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded'
import TrainRoundedIcon from '@mui/icons-material/TrainRounded'
import WeekendRoundedIcon from '@mui/icons-material/WeekendRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import type {
  TileIcon,
  TileIconBackground,
  TileKind,
} from '../types'

export const tileIconOptions: Array<{ value: TileIcon; label: string }> = [
  { value: 'flag', label: 'Bandera' },
  { value: 'bank', label: 'Edificio' },
  { value: 'gavel', label: 'Martillo' },
  { value: 'question', label: 'Pregunta' },
  { value: 'police', label: 'Policía' },
  { value: 'weekend', label: 'Descanso' },
  { value: 'train', label: 'Tren' },
  { value: 'bolt', label: 'Energía' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'star', label: 'Estrella' },
  { value: 'money', label: 'Dinero' },
  { value: 'home', label: 'Casa' },
  { value: 'store', label: 'Tienda' },
  { value: 'gift', label: 'Regalo' },
  { value: 'car', label: 'Auto' },
  { value: 'plane', label: 'Avión' },
]

export const tileIconBackgroundOptions: Array<{
  value: TileIconBackground
  label: string
}> = [
  { value: 'circle', label: 'Circular' },
  { value: 'rounded', label: 'Cuadrado redondeado' },
  { value: 'square', label: 'Cuadrado' },
  { value: 'none', label: 'Sin fondo' },
]

const icons: Record<TileIcon, SvgIconComponent> = {
  flag: FlagRoundedIcon,
  bank: AccountBalanceRoundedIcon,
  gavel: GavelRoundedIcon,
  question: QuestionMarkRoundedIcon,
  police: LocalPoliceRoundedIcon,
  weekend: WeekendRoundedIcon,
  train: TrainRoundedIcon,
  bolt: BoltRoundedIcon,
  ticket: ConfirmationNumberRoundedIcon,
  star: StarRoundedIcon,
  money: PaidRoundedIcon,
  home: HomeRoundedIcon,
  store: StorefrontRoundedIcon,
  gift: RedeemRoundedIcon,
  car: DirectionsCarRoundedIcon,
  plane: FlightRoundedIcon,
}

const defaultIcons: Record<TileKind, TileIcon> = {
  start: 'flag',
  property: 'bank',
  tax: 'gavel',
  card: 'question',
  jail: 'police',
  go_to_jail: 'police',
  free: 'weekend',
  transport: 'train',
  utility: 'bolt',
}

export function defaultTileIcon(kind: TileKind): TileIcon {
  return defaultIcons[kind]
}

export function defaultTileColor(kind: TileKind): string {
  const colors: Record<TileKind, string> = {
    start: '#b8ff3d',
    property: '#9d8cff',
    tax: '#ff8b5c',
    card: '#ff6ea8',
    jail: '#d4d1de',
    go_to_jail: '#ff6b6b',
    free: '#55d6be',
    transport: '#70b7ff',
    utility: '#41d9ff',
  }
  return colors[kind]
}

export function tileIconComponent(
  kind: TileKind,
  icon?: TileIcon,
): SvgIconComponent {
  return icons[icon ?? defaultTileIcon(kind)]
}

export function tileIconBackgroundStyle(
  background: TileIconBackground | undefined,
  accent: string,
) {
  const selected = background ?? 'circle'
  const withoutBackground = selected === 'none'
  return {
    borderRadius:
      selected === 'circle' ? '50%' : selected === 'rounded' ? '24%' : 0,
    bgcolor: withoutBackground ? 'transparent' : accent,
    color: withoutBackground ? accent : '#100d1d',
    border: withoutBackground ? 0 : '1px solid rgba(255,255,255,.62)',
    boxShadow: withoutBackground
      ? 'none'
      : `0 3px 12px color-mix(in srgb, ${accent} 58%, transparent)`,
  }
}
