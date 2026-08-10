import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded'
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
import WebAssetRoundedIcon from '@mui/icons-material/WebAssetRounded'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import StorageRoundedIcon from '@mui/icons-material/StorageRounded'
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  BoardHistoricalStats,
  ContentPack,
  GameEvent,
  GameState,
  AnalyticsDashboardTab,
  AnalyticsDashboardView,
  AnalyticsDashboardSource,
} from '../types'
import { playerColor } from './gameColors'
import {
  ACTIVITY_CATEGORIES,
  activityCategory,
  buildActivityBuckets,
  buildDiceAnalytics,
  buildGameAnalytics,
  eventPlayerIds,
  eventRelatesToPlayer,
  type ActivityBucket,
  type ActivityCategory,
  type DiceAnalytics,
  type PlayerAnalytics,
} from './gameAnalytics'

interface Props {
  open: boolean
  game: GameState
  pack: ContentPack
  boardHistory: BoardHistoricalStats | null
  boardHistoryLoading: boolean
  onClose: () => void
  tab?: AnalyticsDashboardTab
  view?: AnalyticsDashboardView
  onTabChange?: (tab: AnalyticsDashboardTab) => void
  onViewChange?: (view: AnalyticsDashboardView) => void
  source?: AnalyticsDashboardSource
  onSourceChange?: (source: AnalyticsDashboardSource) => void
}

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  movement: '#6ea8fe',
  property: '#b8ff3d',
  cashflow: '#ffd166',
  finance: '#a78bfa',
  negotiation: '#ff8fab',
  game: '#8a94a6',
}

const SURFACE_SX = {
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 2.5,
  bgcolor: 'rgba(255,255,255,.035)',
} as const

export function GameAnalyticsDashboard({
  open,
  game,
  pack,
  boardHistory,
  boardHistoryLoading,
  onClose,
  tab: controlledTab,
  view: controlledView,
  onTabChange,
  onViewChange,
  source: controlledSource,
  onSourceChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const [internalTab, setInternalTab] = useState<AnalyticsDashboardTab>('overview')
  const tab = controlledTab ?? internalTab
  const setTab = (nextTab: AnalyticsDashboardTab) => {
    if (controlledTab === undefined) setInternalTab(nextTab)
    onTabChange?.(nextTab)
  }
  const [scope, setScope] = useState('global')
  const [internalView, setInternalView] =
    useState<AnalyticsDashboardView>('fullscreen')
  const view = controlledView ?? internalView
  const setView = (nextView: AnalyticsDashboardView) => {
    if (controlledView === undefined) setInternalView(nextView)
    onViewChange?.(nextView)
  }
  const [internalSource, setInternalSource] =
    useState<AnalyticsDashboardSource>('current')
  const source = controlledSource ?? internalSource
  const setSource = (nextSource: AnalyticsDashboardSource) => {
    if (controlledSource === undefined) setInternalSource(nextSource)
    onSourceChange?.(nextSource)
  }
  const analytics = useMemo(() => buildGameAnalytics(game, pack), [game, pack])
  const selectedPlayer =
    scope === 'global'
      ? null
      : analytics.players.find((player) => player.player.user_id === scope) ?? null
  const scopedPlayers = selectedPlayer ? [selectedPlayer] : analytics.players
  const scopedEvents = useMemo(
    () =>
      selectedPlayer
        ? game.events.filter((event) =>
            eventRelatesToPlayer(event, game, selectedPlayer.player.user_id),
          )
        : game.events,
    [game, selectedPlayer],
  )
  const scopedBuckets = useMemo(
    () => buildActivityBuckets(scopedEvents),
    [scopedEvents],
  )
  const scopedEventCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ACTIVITY_CATEGORIES.map((category) => [category, 0]),
    ) as Record<ActivityCategory, number>
    for (const event of scopedEvents) counts[activityCategory(event.type)] += 1
    return counts
  }, [scopedEvents])
  const diceAnalytics = useMemo(
    () => buildDiceAnalytics(scopedEvents),
    [scopedEvents],
  )
  const money = (value: number) =>
    `$${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(
      Math.round(value),
    )}`
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(value)
  const totalCash = scopedPlayers.reduce((total, player) => total + player.cash, 0)
  const totalDebt = scopedPlayers.reduce((total, player) => total + player.totalDebt, 0)
  const totalNetWorth = scopedPlayers.reduce(
    (total, player) => total + player.estimatedNetWorth,
    0,
  )
  const totalProperties = scopedPlayers.reduce(
    (total, player) => total + player.propertyCount,
    0,
  )
  const lastEvent = [...scopedEvents].sort(
    (left, right) => right.sequence - left.sequence,
  )[0]

  return (
    <Dialog
      fullScreen={view === 'fullscreen'}
      fullWidth
      maxWidth="xl"
      open={open}
      onClose={onClose}
      sx={{ zIndex: 2000 }}
      PaperProps={{
        sx: {
          height: view === 'window' ? { xs: '94dvh', md: '88dvh' } : undefined,
          maxHeight: view === 'window' ? { xs: '94dvh', md: '88dvh' } : undefined,
          bgcolor: '#0b0d14',
          color: '#f5f7fb',
          backgroundImage:
            'radial-gradient(circle at 8% 0%, rgba(184,255,61,.09), transparent 32%), radial-gradient(circle at 92% 10%, rgba(110,168,254,.08), transparent 30%)',
        },
      }}
    >
      <Box
        component="header"
        sx={{
          px: { xs: 1.5, md: 3 },
          py: 1.5,
          borderBottom: '1px solid rgba(255,255,255,.1)',
          bgcolor: 'rgba(8,10,16,.92)',
          backdropFilter: 'blur(14px)',
          position: 'sticky',
          top: 0,
          zIndex: 3,
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={1.5}
          useFlexGap
          flexWrap="wrap"
        >
          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 42,
              height: 42,
              borderRadius: 2,
              color: '#0b0d14',
              bgcolor: 'primary.main',
              order: 0,
            }}
          >
            <AnalyticsRoundedIcon />
          </Box>
          <Box
            minWidth={{ xs: 180, sm: 0 }}
            flex={1}
            sx={{ order: 1 }}
          >
            <Typography variant="h6" fontWeight={900} noWrap>
              {t('analytics.title')}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {t('analytics.subtitle', {
                room: game.id.slice(0, 8),
                sequence: game.event_sequence,
              })}
            </Typography>
          </Box>
          <FormControl
            size="small"
            sx={{
              minWidth: { xs: 190, sm: 230 },
              flex: { xs: 1, sm: '0 0 auto' },
              order: 3,
            }}
          >
            <InputLabel id="analytics-scope-label">
              {t('analytics.scopeLabel')}
            </InputLabel>
            <Select
              labelId="analytics-scope-label"
              label={t('analytics.scopeLabel')}
              value={selectedPlayer ? scope : 'global'}
              disabled={source === 'historical'}
              onChange={(event) => setScope(event.target.value)}
              aria-label={t('analytics.scopeLabel')}
            >
              <MenuItem value="global">{t('analytics.globalScope')}</MenuItem>
              {game.players.map((player) => (
                <MenuItem key={player.user_id} value={player.user_id}>
                  {player.display_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={view}
            onChange={(_, nextView: AnalyticsDashboardView | null) => {
              if (nextView) setView(nextView)
            }}
            aria-label={t('analytics.view.label')}
            sx={{ order: 4 }}
          >
            <ToggleButton
              value="window"
              aria-label={t('analytics.view.window')}
              title={t('analytics.view.window')}
            >
              <WebAssetRoundedIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton
              value="fullscreen"
              aria-label={t('analytics.view.fullscreen')}
              title={t('analytics.view.fullscreen')}
            >
              <FullscreenRoundedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          <IconButton
            aria-label={t('close')}
            onClick={onClose}
            sx={{ order: { xs: 2, sm: 5 } }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 1 }}
        >
          <Typography variant="caption" color="text.secondary">
            {t('analytics.sourceLabel')}
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={source}
            onChange={(_, nextSource: AnalyticsDashboardSource | null) => {
              if (nextSource) setSource(nextSource)
            }}
            aria-label={t('analytics.sourceLabel')}
          >
            <ToggleButton value="current">
              <InsightsRoundedIcon fontSize="small" sx={{ mr: 0.75 }} />
              {t('analytics.sources.current')}
            </ToggleButton>
            <ToggleButton value="historical">
              <HistoryRoundedIcon fontSize="small" sx={{ mr: 0.75 }} />
              {t('analytics.sources.historical')}
            </ToggleButton>
          </ToggleButtonGroup>
          {source === 'historical' && boardHistory && (
            <Chip
              size="small"
              label={t('analytics.historical.gameCount', {
                count: boardHistory.game_count,
              })}
            />
          )}
        </Stack>
        {source === 'current' && (
          <Tabs
            value={tab}
            onChange={(_, value: AnalyticsDashboardTab) => setTab(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mt: 1, minHeight: 38, '& .MuiTab-root': { minHeight: 38 } }}
          >
            <Tab value="overview" icon={<InsightsRoundedIcon />} iconPosition="start" label={t('analytics.tabs.overview')} />
            <Tab value="players" icon={<GroupsRoundedIcon />} iconPosition="start" label={t('analytics.tabs.players')} />
            <Tab value="economy" icon={<AccountBalanceRoundedIcon />} iconPosition="start" label={t('analytics.tabs.economy')} />
            <Tab value="activity" icon={<ReceiptLongRoundedIcon />} iconPosition="start" label={t('analytics.tabs.activity')} />
            <Tab value="dice" icon={<CasinoRoundedIcon />} iconPosition="start" label={t('analytics.tabs.dice')} />
            <Tab value="technical" icon={<StorageRoundedIcon />} iconPosition="start" label={t('analytics.tabs.technical')} />
          </Tabs>
        )}
      </Box>

      <DialogContent sx={{ p: { xs: 1.5, md: 3 } }}>
        {source === 'current' && !game.events_complete && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('analytics.partialHistory', { count: game.events.length })}
          </Alert>
        )}
        {source === 'current' &&
          game.events_complete &&
          analytics.missingEventSequences > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('analytics.sequenceGaps', { count: analytics.missingEventSequences })}
          </Alert>
        )}

        {source === 'current' && tab === 'overview' && (
          <Stack spacing={2}>
            <MetricGrid>
              <MetricCard
                label={t('analytics.metrics.netWorth')}
                value={money(totalNetWorth)}
                detail={t('analytics.metrics.netWorthDetail')}
                accent="#b8ff3d"
              />
              <MetricCard
                label={t('analytics.metrics.cash')}
                value={money(totalCash)}
                detail={t('analytics.metrics.cashDetail')}
                accent="#6ea8fe"
              />
              <MetricCard
                label={t('analytics.metrics.debt')}
                value={money(totalDebt)}
                detail={t('analytics.metrics.debtDetail')}
                accent="#ff8fab"
              />
              <MetricCard
                label={t('analytics.metrics.properties')}
                value={number(totalProperties)}
                detail={t('analytics.metrics.propertiesDetail', {
                  mortgaged: scopedPlayers.reduce(
                    (total, player) => total + player.mortgagedCount,
                    0,
                  ),
                })}
                accent="#ffd166"
              />
              <MetricCard
                label={t('analytics.metrics.players')}
                value={
                  selectedPlayer
                    ? selectedPlayer.player.display_name
                    : `${analytics.activePlayers}/${game.players.length}`
                }
                detail={
                  selectedPlayer
                    ? t('analytics.metrics.playerScope')
                    : t('analytics.metrics.activePlayers')
                }
                accent="#a78bfa"
              />
              <MetricCard
                label={t('analytics.metrics.events')}
                value={number(scopedEvents.length)}
                detail={
                  game.events_complete
                    ? t('analytics.completeHistory')
                    : t('analytics.incompleteHistory')
                }
                accent="#8a94a6"
              />
            </MetricGrid>
            <DashboardGrid>
              <Panel title={t('analytics.charts.netWorthRanking')} subtitle={t('analytics.charts.netWorthFormula')}>
                <RankedBars
                  rows={scopedPlayers.map((player, index) => ({
                    label: player.player.display_name,
                    value: player.estimatedNetWorth,
                    formattedValue: money(player.estimatedNetWorth),
                    color: playerColor(player.player, index),
                    muted: player.player.bankrupt,
                  }))}
                />
              </Panel>
              <Panel title={t('analytics.charts.assetComposition')} subtitle={t('analytics.charts.assetCompositionDetail')}>
                <AssetComposition players={scopedPlayers} money={money} />
              </Panel>
              <Panel title={t('analytics.charts.activityMix')} subtitle={t('analytics.charts.activityMixDetail')}>
                <CategoryBars counts={scopedEventCounts} />
              </Panel>
              <Panel title={t('analytics.charts.progress')} subtitle={t('analytics.charts.progressDetail')}>
                <ProgressTable players={scopedPlayers} />
              </Panel>
            </DashboardGrid>
          </Stack>
        )}

        {source === 'current' && tab === 'players' && (
          <Stack spacing={2}>
            <MetricGrid>
              {scopedPlayers.map((player, index) => (
                <PlayerScorecard
                  key={player.player.user_id}
                  analytics={player}
                  rank={analytics.players.findIndex(
                    (candidate) => candidate.player.user_id === player.player.user_id,
                  ) + 1}
                  color={playerColor(player.player, index)}
                  money={money}
                />
              ))}
            </MetricGrid>
            <Panel title={t('analytics.charts.playerComparison')} subtitle={t('analytics.charts.netWorthFormula')}>
              <PlayerComparisonTable players={scopedPlayers} money={money} />
            </Panel>
          </Stack>
        )}

        {source === 'current' && tab === 'economy' && (
          <Stack spacing={2}>
            <MetricGrid>
              <MetricCard label={t('analytics.economy.monetaryBase')} value={money(game.bank.monetary_base)} detail={t('analytics.economy.serverValue')} accent="#6ea8fe" />
              <MetricCard label={t('analytics.economy.bankCash')} value={money(game.bank.cash)} detail={t('analytics.economy.minimumReserve', { percent: game.bank.minimum_reserve_percent })} accent="#b8ff3d" />
              <MetricCard label={t('analytics.economy.credit')} value={money(game.bank.loans.reduce((total, loan) => total + loan.remaining_balance, 0))} detail={t('analytics.economy.activeLoans', { count: game.bank.loans.length })} accent="#ff8fab" />
              <MetricCard label={t('analytics.economy.marketValue')} value={money(game.bank.investments.reduce((total, instrument) => total + instrument.current_price * (instrument.total_shares - instrument.available_shares), 0))} detail={t('analytics.economy.instruments', { count: game.bank.investments.length })} accent="#a78bfa" />
              <MetricCard label={t('analytics.economy.emergencyIssuance')} value={money(game.bank.emergency_issuance)} detail={t('analytics.economy.serverValue')} accent="#ffd166" />
              <MetricCard label={t('analytics.economy.bankPot')} value={money(game.bank_pot)} detail={t('analytics.economy.segregated')} accent="#8a94a6" />
            </MetricGrid>
            <DashboardGrid>
              <Panel title={t('analytics.charts.cashRanking')} subtitle={t('analytics.charts.currentSnapshot')}>
                <RankedBars rows={scopedPlayers.map((player, index) => ({ label: player.player.display_name, value: player.cash, formattedValue: money(player.cash), color: playerColor(player.player, index), muted: player.player.bankrupt }))} />
              </Panel>
              <Panel title={t('analytics.charts.debtRanking')} subtitle={t('analytics.charts.debtComposition')}>
                <RankedBars rows={scopedPlayers.map((player) => ({ label: player.player.display_name, value: player.totalDebt, formattedValue: money(player.totalDebt), color: '#ff8fab', muted: player.player.bankrupt }))} />
              </Panel>
              <Panel title={t('analytics.charts.propertyGroups')} subtitle={t('analytics.charts.propertyGroupsDetail')}>
                <PropertyGroups players={scopedPlayers} pack={pack} money={money} />
              </Panel>
              <Panel title={t('analytics.economy.market')} subtitle={t('analytics.economy.marketRound', { round: game.bank.market_round })}>
                <MarketTable game={game} pack={pack} money={money} />
              </Panel>
            </DashboardGrid>
          </Stack>
        )}

        {source === 'current' && tab === 'activity' && (
          <Stack spacing={2}>
            <MetricGrid>
              {ACTIVITY_CATEGORIES.map((category) => (
                <MetricCard
                  key={category}
                  label={t(`analytics.categories.${category}`)}
                  value={number(scopedEventCounts[category])}
                  detail={t('analytics.metrics.linkedEvents')}
                  accent={CATEGORY_COLORS[category]}
                />
              ))}
            </MetricGrid>
            <Panel title={t('analytics.charts.activityTimeline')} subtitle={t('analytics.charts.activityTimelineDetail')}>
              <ActivityTimeline buckets={scopedBuckets} />
            </Panel>
            <Panel title={t('analytics.activity.latestEvents')} subtitle={t('analytics.activity.latestEventsDetail')}>
              <EventsTable events={scopedEvents} game={game} />
            </Panel>
          </Stack>
        )}

        {source === 'current' && tab === 'dice' && (
          <DiceDashboard
            analytics={diceAnalytics}
            game={game}
            pack={pack}
            number={number}
          />
        )}

        {source === 'current' && tab === 'technical' && (
          <Stack spacing={2}>
            <MetricGrid>
              <MetricCard label={t('analytics.technical.snapshotSequence')} value={number(game.event_sequence)} detail={t('analytics.technical.authoritativeSnapshot')} accent="#b8ff3d" />
              <MetricCard label={t('analytics.technical.receivedEvents')} value={number(game.events.length)} detail={game.events_complete ? t('analytics.completeHistory') : t('analytics.incompleteHistory')} accent="#6ea8fe" />
              <MetricCard label={t('analytics.technical.sequenceGaps')} value={number(analytics.missingEventSequences)} detail={t('analytics.technical.sequenceRange', { from: analytics.firstEventSequence ?? 0, to: analytics.lastEventSequence ?? 0 })} accent={analytics.missingEventSequences > 0 ? '#ff8fab' : '#8a94a6'} />
              <MetricCard label={t('analytics.technical.phase')} value={t(`analytics.phases.${game.phase}`)} detail={t(`gameStatus.${game.status}`)} accent="#a78bfa" />
              <MetricCard label={t('analytics.technical.lastEvent')} value={lastEvent ? `#${lastEvent.sequence}` : '—'} detail={lastEvent ? formatDate(lastEvent.occurred_at, i18n.language) : t('analytics.technical.noEvents')} accent="#ffd166" />
              <MetricCard label={t('analytics.technical.spectators')} value={number(game.spectators.length)} detail={t('analytics.technical.roomMembers', { count: game.players.length + game.spectators.length })} accent="#8a94a6" />
            </MetricGrid>
            <DashboardGrid>
              <Panel title={t('analytics.technical.liveState')} subtitle={t('analytics.technical.liveStateDetail')}>
                <TechnicalState game={game} />
              </Panel>
              <Panel title={t('analytics.technical.eventTypes')} subtitle={t('analytics.technical.eventTypesDetail')}>
                <EventTypeTable events={scopedEvents} />
              </Panel>
              <Panel title={t('analytics.technical.rules')} subtitle={t('analytics.technical.rulesDetail')}>
                <RulesTable game={game} />
              </Panel>
              <Panel title={t('analytics.technical.pending')} subtitle={t('analytics.technical.pendingDetail')}>
                <PendingState game={game} />
              </Panel>
            </DashboardGrid>
          </Stack>
        )}

        {source === 'historical' && (
          <HistoricalBoardDashboard
            history={boardHistory}
            loading={boardHistoryLoading}
            pack={pack}
            money={money}
            number={number}
          />
        )}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
          {source === 'current'
            ? t('analytics.methodology')
            : t('analytics.historical.methodology')}
        </Typography>
      </DialogContent>
    </Dialog>
  )
}

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 1.25 }}>
      {children}
    </Box>
  )
}

function DashboardGrid({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      {children}
    </Box>
  )
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return (
    <Box sx={{ ...SURFACE_SX, p: 1.5, borderTop: `3px solid ${accent}`, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" noWrap display="block">{label}</Typography>
      <Typography variant="h5" fontWeight={900} noWrap title={value}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" display="block" noWrap title={detail}>{detail}</Typography>
    </Box>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ ...SURFACE_SX, p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
      <Typography fontWeight={850}>{title}</Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>{subtitle}</Typography>
      {children}
    </Box>
  )
}

function RankedBars({ rows }: { rows: Array<{ label: string; value: number; formattedValue: string; color: string; muted?: boolean }> }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  const hasNegative = rows.some((row) => row.value < 0)
  if (rows.length === 0) return <Empty />
  return (
    <Stack spacing={1.25}>
      {rows.map((row, index) => {
        const width =
          (Math.abs(row.value) * (hasNegative ? 50 : 100)) / max
        return (
          <Box key={`${row.label}-${index}`} sx={{ opacity: row.muted ? 0.45 : 1 }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography variant="body2" noWrap>{row.label}</Typography>
              <Typography variant="body2" fontWeight={800}>{row.formattedValue}</Typography>
            </Stack>
            <Box sx={{ position: 'relative', height: 12, mt: 0.5, borderRadius: 99, bgcolor: 'rgba(255,255,255,.06)', overflow: 'hidden', '&::after': hasNegative ? { content: '""', position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', bgcolor: 'rgba(255,255,255,.28)' } : undefined }}>
              <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: hasNegative ? (row.value >= 0 ? '50%' : `${50 - width}%`) : 0, width: `${width}%`, bgcolor: row.color, borderRadius: 99 }} />
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}

function AssetComposition({ players, money }: { players: PlayerAnalytics[]; money: (value: number) => string }) {
  const { t } = useTranslation()
  const assets = [
    { key: 'cash', value: players.reduce((total, player) => total + Math.max(0, player.cash), 0), color: '#6ea8fe' },
    { key: 'properties', value: players.reduce((total, player) => total + player.propertyValue, 0), color: '#b8ff3d' },
    { key: 'buildings', value: players.reduce((total, player) => total + player.buildingValue, 0), color: '#ffd166' },
    { key: 'investments', value: players.reduce((total, player) => total + player.investmentValue, 0), color: '#a78bfa' },
  ]
  const total = Math.max(1, assets.reduce((sum, asset) => sum + asset.value, 0))
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ height: 28, borderRadius: 99, overflow: 'hidden', bgcolor: 'rgba(255,255,255,.06)' }}>
        {assets.map((asset) => asset.value > 0 && (
          <Tooltip key={asset.key} title={`${t(`analytics.assets.${asset.key}`)}: ${money(asset.value)}`}>
            <Box sx={{ width: `${(asset.value * 100) / total}%`, bgcolor: asset.color, minWidth: 3 }} />
          </Tooltip>
        ))}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        {assets.map((asset) => (
          <Stack key={asset.key} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: asset.color, flex: '0 0 auto' }} />
            <Typography variant="caption" color="text.secondary" noWrap>{t(`analytics.assets.${asset.key}`)}</Typography>
            <Typography variant="caption" fontWeight={800} sx={{ ml: 'auto !important' }}>{money(asset.value)}</Typography>
          </Stack>
        ))}
      </Box>
    </Stack>
  )
}

function CategoryBars({ counts }: { counts: Record<ActivityCategory, number> }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...ACTIVITY_CATEGORIES.map((category) => counts[category]))
  return (
    <Stack spacing={1}>
      {ACTIVITY_CATEGORIES.map((category) => (
        <Box key={category} sx={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 130px) 1fr 38px', gap: 1, alignItems: 'center' }}>
          <Typography variant="caption" noWrap>{t(`analytics.categories.${category}`)}</Typography>
          <Box sx={{ height: 12, bgcolor: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${(counts[category] * 100) / max}%`, bgcolor: CATEGORY_COLORS[category], borderRadius: 99 }} />
          </Box>
          <Typography variant="caption" fontWeight={800} textAlign="right">{counts[category]}</Typography>
        </Box>
      ))}
    </Stack>
  )
}

function ActivityTimeline({ buckets }: { buckets: ActivityBucket[] }) {
  const { t } = useTranslation()
  if (buckets.length === 0) return <Empty />
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total))
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, height: 220, minWidth: Math.max(520, buckets.length * 56), borderBottom: '1px solid rgba(255,255,255,.16)', px: 1 }}>
        {buckets.map((bucket) => (
          <Tooltip key={`${bucket.from}-${bucket.to}`} title={`${t('analytics.activity.sequence')} ${bucket.from}–${bucket.to}: ${bucket.total}`}>
            <Stack justifyContent="flex-end" sx={{ flex: 1, height: '100%', minWidth: 34 }}>
              <Stack sx={{ height: `${Math.max(5, (bucket.total * 100) / max)}%`, borderRadius: '5px 5px 0 0', overflow: 'hidden', flexDirection: 'column-reverse' }}>
                {ACTIVITY_CATEGORIES.map((category) => bucket.counts[category] > 0 && (
                  <Box key={category} sx={{ height: `${(bucket.counts[category] * 100) / bucket.total}%`, bgcolor: CATEGORY_COLORS[category] }} />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" textAlign="center" sx={{ mt: 0.5, fontSize: 10 }}>#{bucket.to}</Typography>
            </Stack>
          </Tooltip>
        ))}
      </Box>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
        {ACTIVITY_CATEGORIES.map((category) => (
          <Stack key={category} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, bgcolor: CATEGORY_COLORS[category], borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">{t(`analytics.categories.${category}`)}</Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  )
}

function HistoricalBoardDashboard({
  history,
  loading,
  pack,
  money,
  number,
}: {
  history: BoardHistoricalStats | null
  loading: boolean
  pack: ContentPack
  money: (value: number) => string
  number: (value: number) => string
}) {
  const { t } = useTranslation()
  if (loading) return <Alert severity="info">{t('analytics.historical.loading')}</Alert>
  if (!history) {
    return <Alert severity="warning">{t('analytics.historical.unavailable')}</Alert>
  }
  if (history.game_count === 0) {
    return <Alert severity="info">{t('analytics.historical.empty')}</Alert>
  }

  const visitedPositions = history.position_landings.filter((count) => count > 0).length
  const totalRent = history.properties.reduce(
    (total, property) => total + property.total_rent,
    0,
  )
  const rentPayments = history.properties.reduce(
    (total, property) => total + property.rent_payments,
    0,
  )
  const purchases = history.properties.reduce(
    (total, property) => total + property.purchases,
    0,
  )
  const auctionSales = history.properties.reduce(
    (total, property) => total + property.auction_sales,
    0,
  )

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        {t('analytics.historical.scopeNotice', { pack: history.pack_id })}
      </Alert>
      <MetricGrid>
        <MetricCard
          label={t('analytics.historical.games')}
          value={String(history.game_count)}
          detail={t('analytics.historical.previousGames')}
          accent="#b8ff3d"
        />
        <MetricCard
          label={t('analytics.historical.movements')}
          value={String(history.movement_count)}
          detail={t('analytics.historical.movementsPerGame', {
            average: number(history.movement_count / history.game_count),
          })}
          accent="#6ea8fe"
        />
        <MetricCard
          label={t('analytics.historical.visitedTiles')}
          value={`${visitedPositions}/${pack.board.tiles.length}`}
          detail={t('analytics.historical.distinctDestinations')}
          accent="#a78bfa"
        />
        <MetricCard
          label={t('analytics.historical.rentGenerated')}
          value={money(totalRent)}
          detail={t('analytics.historical.rentPayments', { count: rentPayments })}
          accent="#ff8fab"
        />
        <MetricCard
          label={t('analytics.historical.purchases')}
          value={String(purchases)}
          detail={t('analytics.historical.directPurchases')}
          accent="#ffd166"
        />
        <MetricCard
          label={t('analytics.historical.auctions')}
          value={String(auctionSales)}
          detail={t('analytics.historical.auctionSales')}
          accent="#8a94a6"
        />
      </MetricGrid>
      <DashboardGrid>
        <Panel
          title={t('analytics.historical.landingFrequency')}
          subtitle={t('analytics.historical.landingFrequencyDetail')}
        >
          <HistoricalLandingBars history={history} pack={pack} />
        </Panel>
        <Panel
          title={t('analytics.historical.rentRanking')}
          subtitle={t('analytics.historical.rentRankingDetail')}
        >
          <HistoricalRentBars history={history} pack={pack} money={money} />
        </Panel>
        <Panel
          title={t('analytics.historical.acquisitionRanking')}
          subtitle={t('analytics.historical.acquisitionRankingDetail')}
        >
          <HistoricalAcquisitionBars history={history} pack={pack} />
        </Panel>
        <Panel
          title={t('analytics.historical.coverage')}
          subtitle={t('analytics.historical.coverageDetail')}
        >
          <KeyValueRows
            rows={[
              [t('analytics.historical.games'), String(history.game_count)],
              [t('analytics.historical.movements'), String(history.movement_count)],
              [t('analytics.historical.rentPaymentsLabel'), String(rentPayments)],
              [t('analytics.historical.purchases'), String(purchases)],
              [t('analytics.historical.auctions'), String(auctionSales)],
            ]}
          />
        </Panel>
      </DashboardGrid>
      <Panel
        title={t('analytics.historical.propertyTable')}
        subtitle={t('analytics.historical.propertyTableDetail')}
      >
        <HistoricalPropertiesTable history={history} pack={pack} money={money} />
      </Panel>
    </Stack>
  )
}

function HistoricalLandingBars({
  history,
  pack,
}: {
  history: BoardHistoricalStats
  pack: ContentPack
}) {
  const rows = history.position_landings
    .map((count, position) => ({ count, position }))
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.position - right.position)
    .slice(0, 15)
    .map(({ count, position }) => {
      const tile = pack.board.tiles[position]
      return {
        label: tile ? pack.messages[tile.name_key] ?? tile.id : `#${position}`,
        value: count,
        formattedValue: `${count} · ${((count * 100) / Math.max(1, history.movement_count)).toFixed(1)}%`,
        color: '#6ea8fe',
      }
    })
  return <RankedBars rows={rows} />
}

function HistoricalRentBars({
  history,
  pack,
  money,
}: {
  history: BoardHistoricalStats
  pack: ContentPack
  money: (value: number) => string
}) {
  const tileById = new Map(pack.board.tiles.map((tile) => [tile.id, tile]))
  const rows = history.properties
    .filter((property) => property.total_rent > 0)
    .sort((left, right) => right.total_rent - left.total_rent)
    .slice(0, 15)
    .map((property) => {
      const tile = tileById.get(property.tile_id)
      return {
        label: tile ? pack.messages[tile.name_key] ?? tile.id : property.tile_id,
        value: property.total_rent,
        formattedValue: money(property.total_rent),
        color: '#ff8fab',
      }
    })
  return <RankedBars rows={rows} />
}

function HistoricalAcquisitionBars({
  history,
  pack,
}: {
  history: BoardHistoricalStats
  pack: ContentPack
}) {
  const { t } = useTranslation()
  const tileById = new Map(pack.board.tiles.map((tile) => [tile.id, tile]))
  const rows = history.properties
    .filter((property) => property.purchases + property.auction_sales > 0)
    .sort(
      (left, right) =>
        right.purchases +
        right.auction_sales -
        (left.purchases + left.auction_sales),
    )
    .slice(0, 15)
    .map((property) => {
      const tile = tileById.get(property.tile_id)
      return {
        label: tile ? pack.messages[tile.name_key] ?? tile.id : property.tile_id,
        value: property.purchases + property.auction_sales,
        formattedValue: `${t('analytics.historical.purchaseCount', {
          count: property.purchases,
        })} · ${t('analytics.historical.auctionCount', {
          count: property.auction_sales,
        })}`,
        color: '#ffd166',
      }
    })
  return <RankedBars rows={rows} />
}

function HistoricalPropertiesTable({
  history,
  pack,
  money,
}: {
  history: BoardHistoricalStats
  pack: ContentPack
  money: (value: number) => string
}) {
  const { t } = useTranslation()
  const tileById = new Map(pack.board.tiles.map((tile) => [tile.id, tile]))
  const rows = [...history.properties].sort(
    (left, right) =>
      right.landings - left.landings || right.total_rent - left.total_rent,
  )
  return (
    <TableContainer sx={{ maxHeight: 520 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('analytics.historical.property')}</TableCell>
            <TableCell align="right">{t('analytics.historical.landings')}</TableCell>
            <TableCell align="right">%</TableCell>
            <TableCell align="right">{t('analytics.historical.rentPaymentsLabel')}</TableCell>
            <TableCell align="right">{t('analytics.historical.totalRent')}</TableCell>
            <TableCell align="right">{t('analytics.historical.averageRent')}</TableCell>
            <TableCell align="right">{t('analytics.historical.purchases')}</TableCell>
            <TableCell align="right">{t('analytics.historical.averagePurchase')}</TableCell>
            <TableCell align="right">{t('analytics.historical.auctions')}</TableCell>
            <TableCell align="right">{t('analytics.historical.averageAuction')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((property) => {
            const tile = tileById.get(property.tile_id)
            return (
              <TableRow key={property.tile_id}>
                <TableCell>
                  {tile ? pack.messages[tile.name_key] ?? tile.id : property.tile_id}
                </TableCell>
                <TableCell align="right">{property.landings}</TableCell>
                <TableCell align="right">{property.landing_percent.toFixed(1)}%</TableCell>
                <TableCell align="right">{property.rent_payments}</TableCell>
                <TableCell align="right">{money(property.total_rent)}</TableCell>
                <TableCell align="right">{money(property.average_rent)}</TableCell>
                <TableCell align="right">{property.purchases}</TableCell>
                <TableCell align="right">{money(property.average_purchase_price)}</TableCell>
                <TableCell align="right">{property.auction_sales}</TableCell>
                <TableCell align="right">{money(property.average_auction_price)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function DiceDashboard({
  analytics,
  game,
  pack,
  number,
}: {
  analytics: DiceAnalytics
  game: GameState
  pack: ContentPack
  number: (value: number) => string
}) {
  const { t } = useTranslation()
  const maxTotalCount = Math.max(0, ...analytics.totalCounts)
  const mostFrequentTotal =
    maxTotalCount === 0 ? null : analytics.totalCounts.indexOf(maxTotalCount) + 2
  const landingRolls = analytics.landings.reduce(
    (total, landing) => total + landing.count,
    0,
  )

  return (
    <Stack spacing={2}>
      <MetricGrid>
        <MetricCard
          label={t('analytics.dice.rolls')}
          value={number(analytics.rolls.length)}
          detail={t('analytics.dice.authoritativeEvents')}
          accent="#b8ff3d"
        />
        <MetricCard
          label={t('analytics.dice.average')}
          value={analytics.rolls.length > 0 ? number(analytics.average) : '—'}
          detail={t('analytics.dice.expectedAverage')}
          accent="#6ea8fe"
        />
        <MetricCard
          label={t('analytics.dice.doubles')}
          value={
            analytics.rolls.length > 0
              ? `${number((analytics.doubles * 100) / analytics.rolls.length)}%`
              : '—'
          }
          detail={t('analytics.dice.doublesCount', { count: analytics.doubles })}
          accent="#ffd166"
        />
        <MetricCard
          label={t('analytics.dice.mostFrequentTotal')}
          value={mostFrequentTotal === null ? '—' : String(mostFrequentTotal)}
          detail={t('analytics.dice.appearances', { count: maxTotalCount })}
          accent="#a78bfa"
        />
        <MetricCard
          label={t('analytics.dice.landings')}
          value={number(landingRolls)}
          detail={t('analytics.dice.uniqueLandings', {
            count: analytics.landings.length,
          })}
          accent="#ff8fab"
        />
        <MetricCard
          label={t('analytics.dice.utilityRolls')}
          value={number(analytics.utilityRolls.length)}
          detail={t('analytics.dice.utilityRollsDetail')}
          accent="#8a94a6"
        />
      </MetricGrid>
      <DashboardGrid>
        <Panel
          title={t('analytics.dice.totalDistribution')}
          subtitle={t('analytics.dice.totalDistributionDetail')}
        >
          <DiceTotalDistribution analytics={analytics} />
        </Panel>
        <Panel
          title={t('analytics.dice.faceDistribution')}
          subtitle={t('analytics.dice.faceDistributionDetail')}
        >
          <RankedBars
            rows={analytics.faceCounts.map((count, index) => ({
              label: t('analytics.dice.face', { face: index + 1 }),
              value: count,
              formattedValue: String(count),
              color: '#6ea8fe',
            }))}
          />
        </Panel>
        <Panel
          title={t('analytics.dice.landingFrequency')}
          subtitle={t('analytics.dice.landingFrequencyDetail')}
        >
          <DiceLandingBars analytics={analytics} pack={pack} />
        </Panel>
        <Panel
          title={t('analytics.dice.playerComparison')}
          subtitle={t('analytics.dice.playerComparisonDetail')}
        >
          <DicePlayerTable analytics={analytics} game={game} number={number} />
        </Panel>
      </DashboardGrid>
      <Panel
        title={t('analytics.dice.history')}
        subtitle={t('analytics.dice.historyDetail')}
      >
        <DiceHistoryTable analytics={analytics} game={game} pack={pack} />
      </Panel>
    </Stack>
  )
}

function DiceTotalDistribution({ analytics }: { analytics: DiceAnalytics }) {
  const { t } = useTranslation()
  const expectedCombinations = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]
  const expected = expectedCombinations.map(
    (combinations) => (analytics.rolls.length * combinations) / 36,
  )
  const max = Math.max(1, ...analytics.totalCounts, ...expected)
  if (analytics.rolls.length === 0) return <Empty />
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(11, minmax(34px, 1fr))',
          gap: 0.75,
          minWidth: 520,
          height: 230,
          alignItems: 'end',
          borderBottom: '1px solid rgba(255,255,255,.16)',
          px: 1,
        }}
      >
        {analytics.totalCounts.map((count, index) => {
          const total = index + 2
          return (
            <Tooltip
              key={total}
              title={t('analytics.dice.totalTooltip', {
                total,
                count,
                expected: expected[index].toFixed(1),
              })}
            >
              <Stack justifyContent="flex-end" sx={{ height: '100%', minWidth: 0 }}>
                <Typography variant="caption" textAlign="center" fontWeight={800}>
                  {count}
                </Typography>
                <Box sx={{ position: 'relative', height: 180 }}>
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 'auto 12% 0',
                      height: `${(count * 100) / max}%`,
                      minHeight: count > 0 ? 3 : 0,
                      bgcolor: '#b8ff3d',
                      borderRadius: '5px 5px 0 0',
                    }}
                  />
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: `${(expected[index] * 100) / max}%`,
                      borderTop: '2px solid #6ea8fe',
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" textAlign="center">
                  {total}
                </Typography>
              </Stack>
            </Tooltip>
          )
        })}
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Box sx={{ width: 10, height: 10, bgcolor: '#b8ff3d', borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">
            {t('analytics.dice.observed')}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Box sx={{ width: 14, borderTop: '2px solid #6ea8fe' }} />
          <Typography variant="caption" color="text.secondary">
            {t('analytics.dice.theoretical')}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  )
}

function DiceLandingBars({
  analytics,
  pack,
}: {
  analytics: DiceAnalytics
  pack: ContentPack
}) {
  const { t } = useTranslation()
  const total = analytics.landings.reduce(
    (sum, landing) => sum + landing.count,
    0,
  )
  const tileById = new Map(pack.board.tiles.map((tile) => [tile.id, tile]))
  const rows = analytics.landings.slice(0, 12).map((landing) => {
    const tile = landing.tileId ? tileById.get(landing.tileId) : undefined
    const label = tile
      ? pack.messages[tile.name_key] ?? tile.id
      : t('analytics.dice.position', { position: landing.position })
    return {
      label,
      value: landing.count,
      formattedValue: `${landing.count} · ${((landing.count * 100) / Math.max(1, total)).toFixed(1)}%`,
      color: '#ff8fab',
    }
  })
  return <RankedBars rows={rows} />
}

function DicePlayerTable({
  analytics,
  game,
  number,
}: {
  analytics: DiceAnalytics
  game: GameState
  number: (value: number) => string
}) {
  const { t } = useTranslation()
  const playerNames = new Map(
    game.players.map((player) => [player.user_id, player.display_name]),
  )
  if (analytics.players.length === 0) return <Empty />
  return (
    <TableContainer sx={{ maxHeight: 360 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('analytics.table.player')}</TableCell>
            <TableCell align="right">{t('analytics.table.rolls')}</TableCell>
            <TableCell align="right">{t('analytics.dice.average')}</TableCell>
            <TableCell align="right">{t('analytics.dice.doubles')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {analytics.players.map((player) => (
            <TableRow key={player.playerId}>
              <TableCell>{playerNames.get(player.playerId) ?? player.playerId.slice(0, 8)}</TableCell>
              <TableCell align="right">{player.rolls}</TableCell>
              <TableCell align="right">{number(player.average)}</TableCell>
              <TableCell align="right">
                {player.doubles} · {number((player.doubles * 100) / player.rolls)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function DiceHistoryTable({
  analytics,
  game,
  pack,
}: {
  analytics: DiceAnalytics
  game: GameState
  pack: ContentPack
}) {
  const { t, i18n } = useTranslation()
  const playerNames = new Map(
    game.players.map((player) => [player.user_id, player.display_name]),
  )
  const tileById = new Map(pack.board.tiles.map((tile) => [tile.id, tile]))
  if (analytics.history.length === 0) return <Empty />
  return (
    <TableContainer sx={{ maxHeight: 480 }}>
      <Table stickyHeader size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t('analytics.table.sequence')}</TableCell>
            <TableCell>{t('analytics.table.time')}</TableCell>
            <TableCell>{t('analytics.table.player')}</TableCell>
            <TableCell>{t('analytics.dice.dice')}</TableCell>
            <TableCell align="right">{t('analytics.dice.total')}</TableCell>
            <TableCell>{t('analytics.dice.result')}</TableCell>
            <TableCell>{t('analytics.dice.destination')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {analytics.history.slice(0, 50).map((roll) => {
            const tile = roll.tileId ? tileById.get(roll.tileId) : undefined
            const destination =
              roll.source === 'utility'
                ? '—'
                : tile
                  ? pack.messages[tile.name_key] ?? tile.id
                  : roll.toPosition === null
                    ? '—'
                    : t('analytics.dice.position', { position: roll.toPosition })
            const result = roll.jailAttempt
              ? t('analytics.dice.jailAttempt')
              : roll.source === 'utility'
                ? t('analytics.dice.utility')
                : roll.isDouble
                  ? t('analytics.dice.double')
                  : t('analytics.dice.movement')
            return (
              <TableRow key={roll.sequence}>
                <TableCell>#{roll.sequence}</TableCell>
                <TableCell>{formatDate(roll.occurredAt, i18n.language)}</TableCell>
                <TableCell>
                  {roll.playerId
                    ? playerNames.get(roll.playerId) ?? roll.playerId.slice(0, 8)
                    : '—'}
                </TableCell>
                <TableCell>{roll.dice.join(' + ')}</TableCell>
                <TableCell align="right"><strong>{roll.total}</strong></TableCell>
                <TableCell>{result}</TableCell>
                <TableCell>{destination}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function ProgressTable({ players }: { players: PlayerAnalytics[] }) {
  const { t } = useTranslation()
  return (
    <TableContainer>
      <Table size="small">
        <TableHead><TableRow><TableCell>{t('analytics.table.player')}</TableCell><TableCell align="right">{t('analytics.table.laps')}</TableCell><TableCell align="right">{t('analytics.table.turns')}</TableCell><TableCell align="right">{t('analytics.table.rolls')}</TableCell><TableCell align="right">{t('analytics.table.position')}</TableCell></TableRow></TableHead>
        <TableBody>{players.map((player) => <TableRow key={player.player.user_id}><TableCell>{player.player.display_name}</TableCell><TableCell align="right">{player.completedLaps}</TableCell><TableCell align="right">{player.turns}</TableCell><TableCell align="right">{player.diceRolls}</TableCell><TableCell align="right">{player.player.position}</TableCell></TableRow>)}</TableBody>
      </Table>
    </TableContainer>
  )
}

function PlayerScorecard({ analytics, rank, color, money }: { analytics: PlayerAnalytics; rank: number; color: string; money: (value: number) => string }) {
  const { t } = useTranslation()
  return (
    <Box sx={{ ...SURFACE_SX, p: 1.5, borderLeft: `4px solid ${color}`, opacity: analytics.player.bankrupt ? 0.5 : 1 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
        <Box minWidth={0}><Typography fontWeight={850} noWrap>{analytics.player.display_name}</Typography><Typography variant="caption" color="text.secondary">#{rank} · {analytics.player.is_bot ? t('analytics.player.bot') : t('analytics.player.human')}</Typography></Box>
        {analytics.player.bankrupt && <Chip size="small" label={t('bankrupt')} />}
      </Stack>
      <Typography variant="h5" fontWeight={900} sx={{ mt: 1 }}>{money(analytics.estimatedNetWorth)}</Typography>
      <Typography variant="caption" color="text.secondary">{t('analytics.metrics.netWorth')}</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
        <Chip size="small" variant="outlined" label={`${t('analytics.assets.cash')}: ${money(analytics.cash)}`} />
        <Chip size="small" variant="outlined" label={`${t('analytics.assets.properties')}: ${analytics.propertyCount}`} />
        <Chip size="small" variant="outlined" label={`${t('analytics.metrics.debt')}: ${money(analytics.totalDebt)}`} />
      </Stack>
    </Box>
  )
}

function PlayerComparisonTable({ players, money }: { players: PlayerAnalytics[]; money: (value: number) => string }) {
  const { t } = useTranslation()
  return (
    <TableContainer>
      <Table size="small">
        <TableHead><TableRow><TableCell>{t('analytics.table.player')}</TableCell><TableCell align="right">{t('analytics.assets.cash')}</TableCell><TableCell align="right">{t('analytics.assets.properties')}</TableCell><TableCell align="right">{t('analytics.assets.buildings')}</TableCell><TableCell align="right">{t('analytics.assets.investments')}</TableCell><TableCell align="right">{t('analytics.metrics.debt')}</TableCell><TableCell align="right">{t('analytics.metrics.netWorth')}</TableCell></TableRow></TableHead>
        <TableBody>{players.map((player) => <TableRow key={player.player.user_id} sx={{ opacity: player.player.bankrupt ? 0.45 : 1 }}><TableCell>{player.player.display_name}</TableCell><TableCell align="right">{money(player.cash)}</TableCell><TableCell align="right">{money(player.propertyValue)}</TableCell><TableCell align="right">{money(player.buildingValue)}</TableCell><TableCell align="right">{money(player.investmentValue)}</TableCell><TableCell align="right">{money(player.totalDebt)}</TableCell><TableCell align="right"><strong>{money(player.estimatedNetWorth)}</strong></TableCell></TableRow>)}</TableBody>
      </Table>
    </TableContainer>
  )
}

function PropertyGroups({ players, pack, money }: { players: PlayerAnalytics[]; pack: ContentPack; money: (value: number) => string }) {
  const { t } = useTranslation()
  const propertyIds = new Set(players.flatMap((player) => player.propertyIds))
  const groupNames = new Map((pack.board.groups ?? []).map((group) => [group.id, pack.messages[group.name_key] ?? group.id]))
  const groups = new Map<string, { label: string; count: number; value: number }>()
  for (const tile of pack.board.tiles) {
    if (!propertyIds.has(tile.id)) continue
    const key = tile.group ?? tile.kind
    const current = groups.get(key) ?? { label: groupNames.get(key) ?? t(`analytics.propertyKinds.${tile.kind}`), count: 0, value: 0 }
    current.count += 1
    current.value += tile.price ?? 0
    groups.set(key, current)
  }
  const rows = [...groups.values()].sort((left, right) => right.value - left.value)
  return <RankedBars rows={rows.map((row) => ({ label: `${row.label} (${row.count})`, value: row.value, formattedValue: money(row.value), color: '#b8ff3d' }))} />
}

function MarketTable({ game, pack, money }: { game: GameState; pack: ContentPack; money: (value: number) => string }) {
  const { t } = useTranslation()
  if (game.bank.investments.length === 0) return <Empty />
  return (
    <TableContainer sx={{ maxHeight: 330 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>{t('analytics.table.instrument')}</TableCell><TableCell align="right">{t('analytics.table.price')}</TableCell><TableCell align="right">{t('analytics.table.change')}</TableCell><TableCell align="right">{t('analytics.table.volume')}</TableCell><TableCell align="right">{t('analytics.table.trades')}</TableCell></TableRow></TableHead><TableBody>{game.bank.investments.map((instrument) => { const change = instrument.base_price > 0 ? ((instrument.current_price - instrument.base_price) * 100) / instrument.base_price : 0; return <TableRow key={instrument.id}><TableCell>{pack.messages[instrument.name_key] ?? instrument.id}</TableCell><TableCell align="right">{money(instrument.current_price)}</TableCell><TableCell align="right" sx={{ color: change >= 0 ? 'primary.main' : '#ff8fab' }}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</TableCell><TableCell align="right">{instrument.trade_volume}</TableCell><TableCell align="right">{instrument.trade_count}</TableCell></TableRow> })}</TableBody></Table></TableContainer>
  )
}

function EventsTable({ events, game }: { events: GameEvent[]; game: GameState }) {
  const { t, i18n } = useTranslation()
  const playerNames = new Map(game.players.map((player) => [player.user_id, player.display_name]))
  const latest = [...events].sort((left, right) => right.sequence - left.sequence).slice(0, 30)
  if (latest.length === 0) return <Empty />
  return (
    <TableContainer sx={{ maxHeight: 430 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>{t('analytics.table.sequence')}</TableCell><TableCell>{t('analytics.table.time')}</TableCell><TableCell>{t('analytics.table.type')}</TableCell><TableCell>{t('analytics.table.players')}</TableCell><TableCell>{t('analytics.table.category')}</TableCell></TableRow></TableHead><TableBody>{latest.map((event) => <TableRow key={event.sequence}><TableCell>#{event.sequence}</TableCell><TableCell>{formatDate(event.occurred_at, i18n.language)}</TableCell><TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{event.type}</Typography></TableCell><TableCell>{eventPlayerIds(event, game).map((id) => playerNames.get(id) ?? id.slice(0, 8)).join(', ') || '—'}</TableCell><TableCell><Chip size="small" label={t(`analytics.categories.${activityCategory(event.type)}`)} sx={{ bgcolor: `${CATEGORY_COLORS[activityCategory(event.type)]}22`, color: CATEGORY_COLORS[activityCategory(event.type)] }} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>
  )
}

function EventTypeTable({ events }: { events: GameEvent[] }) {
  const { t } = useTranslation()
  const counts = new Map<string, number>()
  for (const event of events) counts.set(event.type, (counts.get(event.type) ?? 0) + 1)
  const rows = [...counts.entries()].sort((left, right) => right[1] - left[1])
  if (rows.length === 0) return <Empty />
  return <TableContainer sx={{ maxHeight: 360 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>{t('analytics.table.type')}</TableCell><TableCell align="right">{t('analytics.table.count')}</TableCell></TableRow></TableHead><TableBody>{rows.map(([type, count]) => <TableRow key={type}><TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{type}</Typography></TableCell><TableCell align="right">{count}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
}

function TechnicalState({ game }: { game: GameState }) {
  const { t } = useTranslation()
  const rows = [
    [t('analytics.technical.gameId'), game.id],
    [t('analytics.technical.pack'), `${game.pack_id}@${game.pack_version}`],
    [t('analytics.technical.status'), game.status],
    [t('analytics.technical.phase'), game.phase],
    [t('analytics.technical.currentPlayerIndex'), String(game.current_player_index)],
    [t('analytics.technical.pendingTile'), game.pending_tile_id ?? 'null'],
    [t('analytics.technical.lastRoll'), game.last_roll?.join(' + ') ?? 'null'],
    [t('analytics.technical.housesHotels'), `${game.houses_remaining} / ${game.hotels_remaining}`],
  ]
  return <KeyValueRows rows={rows} />
}

function RulesTable({ game }: { game: GameState }) {
  const { t } = useTranslation()
  return <KeyValueRows rows={Object.entries(game.settings.rules).map(([key, enabled]) => [t(`analytics.ruleNames.${key}`), enabled ? t('analytics.enabled') : t('analytics.disabled')])} />
}

function PendingState({ game }: { game: GameState }) {
  const { t } = useTranslation()
  return <KeyValueRows rows={[
    [t('analytics.pending.auction'), game.active_auction?.property_id ?? t('analytics.none')],
    [t('analytics.pending.debt'), game.active_debt ? `$${game.active_debt.amount}` : t('analytics.none')],
    [t('analytics.pending.card'), game.pending_card_choice?.card_id ?? t('analytics.none')],
    [t('analytics.pending.payments'), String(game.pending_card_payments.length)],
    [t('analytics.pending.trades'), String(game.trades.filter((trade) => trade.status === 'pending').length)],
    [t('analytics.pending.marketOrders'), String(game.bank.market_orders.length)],
  ]} />
}

function KeyValueRows({ rows }: { rows: string[][] }) {
  return <Stack spacing={0.75}>{rows.map(([label, value]) => <Stack key={label} direction="row" justifyContent="space-between" spacing={2} sx={{ py: 0.6, borderBottom: '1px solid rgba(255,255,255,.07)' }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={750} textAlign="right" sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Stack>)}</Stack>
}

function Empty() {
  const { t } = useTranslation()
  return <Typography variant="body2" color="text.secondary">{t('analytics.noData')}</Typography>
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date)
}
