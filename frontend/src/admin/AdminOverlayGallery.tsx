import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded'
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded'
import StyleRoundedIcon from '@mui/icons-material/StyleRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  IconButton,
  Portal,
  Stack,
  Typography,
} from '@mui/material'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthDialog } from '../components/AuthDialog'
import { BoardTileDialog } from '../components/BoardTileDialog'
import { GameAuctionDialog } from '../components/GameAuctionDialog'
import { GameCardChoiceDialog } from '../components/GameCardChoiceDialog'
import { GameCardDrawDialog } from '../components/GameCardDrawDialog'
import { GameCreationDialog } from '../components/GameCreationDialog'
import { GameFinishedDialog } from '../components/GameFinishedDialog'
import { TokenCustomizationDialog } from '../components/TokenCustomizationDialog'
import {
  auctionGame,
  cardChoiceGame,
  cardDrawGame,
  finishedGame,
  SHOWCASE_GAME,
  SHOWCASE_PACK,
  SHOWCASE_TOKEN,
  SHOWCASE_USER,
} from './componentGalleryFixtures'

type OverlaySample =
  | 'auction-ready'
  | 'auction-bidding'
  | 'card-draw'
  | 'card-revealed'
  | 'card-choice'
  | 'card-result'
  | 'property'
  | 'finished'
  | 'token'
  | 'game-setup'
  | 'auth'

const noopCommand = async () => true

export function AdminOverlayGallery({
  filter = 'all',
}: {
  filter?: 'all' | 'auctions' | 'other'
}) {
  const { t } = useTranslation()
  const [sample, setSample] = useState<OverlaySample | null>(null)
  const close = () => setSample(null)

  const allSamples: Array<{
    id: OverlaySample
    icon: ReactNode
    group: 'auction' | 'cards' | 'game' | 'account'
  }> = [
    { id: 'auction-ready', icon: <CasinoRoundedIcon />, group: 'auction' },
    { id: 'auction-bidding', icon: <CasinoRoundedIcon />, group: 'auction' },
    { id: 'card-draw', icon: <StyleRoundedIcon />, group: 'cards' },
    { id: 'card-revealed', icon: <StyleRoundedIcon />, group: 'cards' },
    { id: 'card-choice', icon: <StyleRoundedIcon />, group: 'cards' },
    { id: 'card-result', icon: <StyleRoundedIcon />, group: 'cards' },
    { id: 'property', icon: <HomeWorkRoundedIcon />, group: 'game' },
    { id: 'finished', icon: <EmojiEventsRoundedIcon />, group: 'game' },
    { id: 'token', icon: <PaletteRoundedIcon />, group: 'game' },
    { id: 'game-setup', icon: <TuneRoundedIcon />, group: 'game' },
    { id: 'auth', icon: <AccountCircleRoundedIcon />, group: 'account' },
  ]
  const samples = allSamples.filter((item) => {
    if (filter === 'auctions') return item.group === 'auction'
    if (filter === 'other') return item.group !== 'auction'
    return true
  })

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 1.25,
        }}
      >
        {samples.map((item) => (
          <Card key={item.id} variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Box sx={{ color: 'secondary.main', display: 'grid', placeItems: 'center' }}>
                  {item.icon}
                </Box>
                <Typography fontWeight={850}>
                  {t(`admin.components.overlays.${item.id}.title`)}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {t(`admin.components.overlays.${item.id}.description`)}
              </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 1.5 }}>
              <Chip
                size="small"
                variant="outlined"
                label={t(`admin.components.overlayGroups.${item.group}`)}
              />
              <Button size="small" onClick={() => setSample(item.id)}>
                {item.group === 'auction'
                  ? t('admin.components.openAuction')
                  : t('admin.components.openSample')}
              </Button>
            </CardActions>
          </Card>
        ))}
      </Box>

      {sample && (
        <Portal>
          <IconButton
            color="inherit"
            aria-label={t('admin.components.closeSample')}
            onClick={close}
            sx={{
              position: 'fixed',
              top: 10,
              right: 10,
              zIndex: (theme) => theme.zIndex.modal + 2,
              bgcolor: 'rgba(5,5,12,.84)',
              border: '1px solid rgba(255,255,255,.24)',
              boxShadow: 8,
              '&:hover': { bgcolor: 'rgba(20,18,34,.96)' },
            }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Portal>
      )}

      {sample === 'auction-ready' && (
        <GameAuctionDialog
          game={auctionGame('idle')}
          pack={SHOWCASE_PACK}
          user={SHOWCASE_USER}
          busy={false}
          error={null}
          boardHistory={null}
          motionIntensity="off"
          onCommand={noopCommand}
        />
      )}
      {sample === 'auction-bidding' && (
        <GameAuctionDialog
          game={auctionGame('bidding')}
          pack={SHOWCASE_PACK}
          user={SHOWCASE_USER}
          busy={false}
          error={null}
          boardHistory={null}
          motionIntensity="off"
          onCommand={noopCommand}
        />
      )}
      {sample === 'card-draw' && (
        <GameCardDrawDialog
          game={cardDrawGame(false)}
          pack={SHOWCASE_PACK}
          user={SHOWCASE_USER}
          busy={false}
          error={null}
          motionIntensity="off"
          onCommand={noopCommand}
        />
      )}
      {sample === 'card-revealed' && (
        <GameCardDrawDialog
          game={cardDrawGame(true)}
          pack={SHOWCASE_PACK}
          user={SHOWCASE_USER}
          busy={false}
          error={null}
          motionIntensity="off"
          onCommand={noopCommand}
        />
      )}
      {sample === 'card-choice' && (
        <GameCardChoiceDialog
          game={cardChoiceGame(false)}
          pack={SHOWCASE_PACK}
          user={SHOWCASE_USER}
          busy={false}
          error={null}
          motionIntensity="off"
          onCommand={noopCommand}
        />
      )}
      {sample === 'card-result' && (
        <GameCardChoiceDialog
          game={cardChoiceGame(true)}
          pack={SHOWCASE_PACK}
          user={SHOWCASE_USER}
          busy={false}
          error={null}
          motionIntensity="off"
          onCommand={noopCommand}
        />
      )}
      {sample === 'property' && (
        <BoardTileDialog
          tile={SHOWCASE_PACK.board.tiles.find((tile) => tile.id === 'property_33') ?? null}
          pack={SHOWCASE_PACK}
          game={SHOWCASE_GAME}
          currentUserId={SHOWCASE_USER.id}
          onClose={close}
          onSelectTile={() => undefined}
          onCommand={noopCommand}
        />
      )}
      {sample === 'finished' && (
        <GameFinishedDialog
          open
          game={finishedGame()}
          currentUserId={SHOWCASE_USER.id}
          busy={false}
          motionIntensity="off"
          onClose={close}
          onExit={close}
        />
      )}
      {sample === 'token' && (
        <TokenCustomizationDialog
          open
          value={SHOWCASE_TOKEN}
          playerNumber={1}
          onClose={close}
          onSave={close}
        />
      )}
      {sample === 'game-setup' && (
        <GameCreationDialog
          open
          pack={SHOWCASE_PACK}
          onClose={close}
          onConfirm={close}
        />
      )}
      {sample === 'auth' && (
        <AuthDialog
          open
          mode="login"
          busy={false}
          error={null}
          onClose={close}
          onModeChange={() => undefined}
          onSubmit={async () => undefined}
        />
      )}
    </>
  )
}
