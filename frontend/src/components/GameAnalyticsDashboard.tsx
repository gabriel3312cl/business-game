import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded'
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded'
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
  Typography,
} from '@mui/material'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentPack, GameEvent, GameState } from '../types'
import { playerColors } from './gameColors'
import {
  ACTIVITY_CATEGORIES,
  activityCategory,
  buildActivityBuckets,
  buildGameAnalytics,
  eventPlayerIds,
  eventRelatesToPlayer,
  type ActivityBucket,
  type ActivityCategory,
  type PlayerAnalytics,
} from './gameAnalytics'

interface Props {
  open: boolean
  game: GameState
  pack: ContentPack
  onClose: () => void
}

type DashboardTab = 'overview' | 'players' | 'economy' | 'activity' | 'technical'

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

export function GameAnalyticsDashboard({ open, game, pack, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [scope, setScope] = useState('global')
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
      fullScreen
      open={open}
      onClose={onClose}
      sx={{ zIndex: 2000 }}
      PaperProps={{
        sx: {
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
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              display: 'grid',
              placeItems: 'center',
              width: 42,
              height: 42,
              borderRadius: 2,
              color: '#0b0d14',
              bgcolor: 'primary.main',
            }}
          >
            <AnalyticsRoundedIcon />
          </Box>
          <Box minWidth={0} flex={1}>
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
          <FormControl size="small" sx={{ minWidth: { xs: 132, sm: 210 } }}>
            <Select
              value={selectedPlayer ? scope : 'global'}
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
          <IconButton aria-label={t('close')} onClick={onClose}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Tabs
          value={tab}
          onChange={(_, value: DashboardTab) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mt: 1, minHeight: 38, '& .MuiTab-root': { minHeight: 38 } }}
        >
          <Tab value="overview" icon={<InsightsRoundedIcon />} iconPosition="start" label={t('analytics.tabs.overview')} />
          <Tab value="players" icon={<GroupsRoundedIcon />} iconPosition="start" label={t('analytics.tabs.players')} />
          <Tab value="economy" icon={<AccountBalanceRoundedIcon />} iconPosition="start" label={t('analytics.tabs.economy')} />
          <Tab value="activity" icon={<ReceiptLongRoundedIcon />} iconPosition="start" label={t('analytics.tabs.activity')} />
          <Tab value="technical" icon={<StorageRoundedIcon />} iconPosition="start" label={t('analytics.tabs.technical')} />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: { xs: 1.5, md: 3 } }}>
        {!game.events_complete && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('analytics.partialHistory', { count: game.events.length })}
          </Alert>
        )}
        {game.events_complete && analytics.missingEventSequences > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('analytics.sequenceGaps', { count: analytics.missingEventSequences })}
          </Alert>
        )}

        {tab === 'overview' && (
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
                    color: playerColors[index % playerColors.length],
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

        {tab === 'players' && (
          <Stack spacing={2}>
            <MetricGrid>
              {scopedPlayers.map((player, index) => (
                <PlayerScorecard
                  key={player.player.user_id}
                  analytics={player}
                  rank={analytics.players.findIndex(
                    (candidate) => candidate.player.user_id === player.player.user_id,
                  ) + 1}
                  color={playerColors[index % playerColors.length]}
                  money={money}
                />
              ))}
            </MetricGrid>
            <Panel title={t('analytics.charts.playerComparison')} subtitle={t('analytics.charts.netWorthFormula')}>
              <PlayerComparisonTable players={scopedPlayers} money={money} />
            </Panel>
          </Stack>
        )}

        {tab === 'economy' && (
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
                <RankedBars rows={scopedPlayers.map((player, index) => ({ label: player.player.display_name, value: player.cash, formattedValue: money(player.cash), color: playerColors[index % playerColors.length], muted: player.player.bankrupt }))} />
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

        {tab === 'activity' && (
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

        {tab === 'technical' && (
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

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
          {t('analytics.methodology')}
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
      {rows.map((row) => {
        const width =
          (Math.abs(row.value) * (hasNegative ? 50 : 100)) / max
        return (
          <Box key={row.label} sx={{ opacity: row.muted ? 0.45 : 1 }}>
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
    <TableContainer sx={{ maxHeight: 330 }}><Table stickyHeader size="small"><TableHead><TableRow><TableCell>{t('analytics.table.instrument')}</TableCell><TableCell align="right">{t('analytics.table.price')}</TableCell><TableCell align="right">{t('analytics.table.change')}</TableCell><TableCell align="right">{t('analytics.table.volume')}</TableCell><TableCell align="right">{t('analytics.table.trades')}</TableCell></TableRow></TableHead><TableBody>{game.bank.investments.map((instrument) => { const change = instrument.base_price > 0 ? ((instrument.current_price - instrument.base_price) * 100) / instrument.base_price : 0; return <TableRow key={instrument.id}><TableCell>{pack.messages[instrument.name_key] ?? instrument.id}</TableCell><TableCell align="right">{money(instrument.current_price)}</TableCell><TableCell align="right" sx={{ color: change >= 0 ? 'primary.main' : '#ff8fab' }}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</TableCell><TableCell align="right">{instrument.buy_volume + instrument.sell_volume}</TableCell><TableCell align="right">{instrument.trade_count}</TableCell></TableRow> })}</TableBody></Table></TableContainer>
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
