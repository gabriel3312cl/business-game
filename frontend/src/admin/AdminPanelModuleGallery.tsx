import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AdvancedEconomyPanel } from '../components/AdvancedEconomyPanel'
import { BankPanel } from '../components/BankPanel'
import { BotManagementPanel } from '../components/BotManagementPanel'
import { DebtAccountsPanel } from '../components/DebtAccountsPanel'
import { EconomicPulsePanel } from '../components/EconomicPulsePanel'
import { GameActivityFeed } from '../components/GameActivityFeed'
import { GamePlayersPanel } from '../components/GamePlayersPanel'
import { GameTradePanel } from '../components/GameTradePanel'
import { LobbySettingsPanel } from '../components/LobbySettingsPanel'
import { MarketPanel } from '../components/MarketPanel'
import { PlayerStatusSummary } from '../components/PlayerStatusSummary'
import { PropertyManagementPanel } from '../components/PropertyManagementPanel'
import type { PlayerSortOption, PropertyFilter } from '../types'
import {
  SHOWCASE_GAME,
  SHOWCASE_PACK,
  SHOWCASE_TOKEN,
  SHOWCASE_USER,
} from './componentGalleryFixtures'

const noopCommand = async () => true

export function AdminPanelModuleGallery() {
  const { t } = useTranslation()
  const [playerSort, setPlayerSort] = useState<PlayerSortOption>('turnOrder')
  const [propertyFilter, setPropertyFilter] = useState<PropertyFilter>('all')

  return (
    <Stack spacing={2.5}>
      <ModuleGrid>
        <PanelSample name={t('admin.components.modules.players')}>
          <GamePlayersPanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            user={SHOWCASE_USER}
            currentUserTokenAppearance={SHOWCASE_TOKEN}
            sortOption={playerSort}
            motionIntensity="off"
            onSortOptionChange={setPlayerSort}
          />
        </PanelSample>
        <PanelSample name={t('admin.components.modules.playerStatus')}>
          <PlayerStatusSummary
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            playerId={SHOWCASE_USER.id}
          />
        </PanelSample>
      </ModuleGrid>

      <ModuleGrid>
        <PanelSample name={t('admin.components.modules.properties')} tall>
          <PropertyManagementPanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            user={SHOWCASE_USER}
            busy={false}
            embedded
            filter={propertyFilter}
            onFilterChange={setPropertyFilter}
            onCommand={noopCommand}
          />
        </PanelSample>
        <PanelSample name={t('admin.components.modules.trades')} tall>
          <GameTradePanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            user={SHOWCASE_USER}
            busy={false}
            error={null}
            boardHistory={null}
            onCommand={noopCommand}
          />
        </PanelSample>
      </ModuleGrid>

      <ModuleGrid>
        <PanelSample name={t('admin.components.modules.bank')} tall>
          <BankPanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            user={SHOWCASE_USER}
            busy={false}
            onCommand={noopCommand}
          />
        </PanelSample>
        <PanelSample name={t('admin.components.modules.market')} tall>
          <MarketPanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            user={SHOWCASE_USER}
            busy={false}
            onCommand={noopCommand}
          />
        </PanelSample>
      </ModuleGrid>

      <ModuleGrid>
        <PanelSample name={t('admin.components.modules.debts')}>
          <DebtAccountsPanel
            game={SHOWCASE_GAME}
            user={SHOWCASE_USER}
            busy={false}
            onCommand={noopCommand}
          />
        </PanelSample>
        <PanelSample name={t('admin.components.modules.economy')}>
          <EconomicPulsePanel game={SHOWCASE_GAME} pack={SHOWCASE_PACK} />
        </PanelSample>
      </ModuleGrid>

      <ModuleGrid>
        <PanelSample name={t('admin.components.modules.advancedEconomy')}>
          <AdvancedEconomyPanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            user={SHOWCASE_USER}
            busy={false}
            onCommand={noopCommand}
          />
        </PanelSample>
        <PanelSample name={t('admin.components.modules.activity')}>
          <GameActivityFeed
            events={SHOWCASE_GAME.events}
            players={SHOWCASE_GAME.players}
            spectators={SHOWCASE_GAME.spectators}
            pack={SHOWCASE_PACK}
            motionIntensity="off"
          />
        </PanelSample>
      </ModuleGrid>

      <ModuleGrid>
        <PanelSample name={t('admin.components.modules.lobby')} tall>
          <LobbySettingsPanel
            game={SHOWCASE_GAME}
            pack={SHOWCASE_PACK}
            isHost
            busy={false}
            onUpdate={() => undefined}
          />
        </PanelSample>
        <PanelSample name={t('admin.components.modules.bots')}>
          <BotManagementPanel
            game={SHOWCASE_GAME}
            maximumPlayers={SHOWCASE_GAME.settings.max_players ?? SHOWCASE_PACK.manifest.max_players}
            isHost
            busy={false}
            onAdd={async () => true}
            onFill={async () => true}
            onRemove={async () => true}
          />
        </PanelSample>
      </ModuleGrid>
    </Stack>
  )
}

function ModuleGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'repeat(2, minmax(0, 1fr))' },
        gap: 2,
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  )
}

function PanelSample({
  name,
  tall = false,
  children,
}: {
  name: string
  tall?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <Box minWidth={0}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={1}>
        <Typography fontWeight={850}>{name}</Typography>
        <Chip size="small" variant="outlined" label={t('admin.components.viewport.live')} />
      </Stack>
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.25, md: 2 },
          height: tall ? 620 : 470,
          overflow: 'auto',
          bgcolor: 'background.default',
          backgroundImage: 'none',
        }}
      >
        {children}
      </Paper>
    </Box>
  )
}
