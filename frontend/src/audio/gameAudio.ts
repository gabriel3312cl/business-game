export const GAME_AUDIO_FILES = {
  'action-rejected': ['/audio/action-rejected.ogg'],
  'advisor-response': ['/audio/advisor-response.ogg'],
  'auction-bid': ['/audio/auction-bid.ogg'],
  'auction-completed': ['/audio/auction-completed.ogg'],
  'auction-countdown': ['/audio/auction-countdown.ogg'],
  'auction-lost': ['/audio/auction-lost.ogg'],
  'auction-start': ['/audio/auction-start.ogg'],
  'building-hotel': ['/audio/building-hotel.ogg'],
  'building-house': ['/audio/building-house.ogg'],
  'building-sold': ['/audio/building-sold.ogg'],
  'card-draw': ['/audio/card-draw.ogg'],
  'card-negative': ['/audio/card-negative.ogg'],
  'card-positive': ['/audio/card-positive.ogg'],
  'chat-mention': ['/audio/chat-mention.ogg'],
  'chat-message': ['/audio/chat-message.ogg'],
  'connection-lost': ['/audio/connection-lost.ogg'],
  'connection-restored': ['/audio/connection-restored.ogg'],
  'debt-created': ['/audio/debt-created.ogg'],
  'debt-paid': ['/audio/debt-paid.ogg'],
  'dice-doubles': ['/audio/dice-doubles.ogg'],
  'dice-roll-a': ['/audio/dice-roll-a.ogg'],
  'dice-roll-b': ['/audio/dice-roll-b.ogg'],
  'free-parking-collected': ['/audio/free-parking-collected.ogg'],
  'game-finished': ['/audio/game-finished.ogg'],
  'game-started': ['/audio/game-started.ogg'],
  'jail-entered': ['/audio/jail-entered.ogg'],
  'jail-released': ['/audio/jail-released.ogg'],
  'jail-roll-failed': ['/audio/jail-roll-failed.ogg'],
  'payment-received': ['/audio/payment-received.ogg'],
  'payment-sent': ['/audio/payment-sent.ogg'],
  'player-bankrupt': ['/audio/player-bankrupt.ogg'],
  'player-joined': ['/audio/player-joined.ogg'],
  'player-left': ['/audio/player-left.ogg'],
  'property-declined': ['/audio/property-declined.ogg'],
  'property-mortgaged': ['/audio/property-mortgaged.ogg'],
  'property-purchase': ['/audio/property-purchase.ogg'],
  'property-unmortgaged': ['/audio/property-unmortgaged.ogg'],
  'salary-collected': ['/audio/salary-collected.ogg'],
  'tax-or-repairs': ['/audio/tax-or-repairs.ogg'],
  'token-step-metal-soft': [
    '/audio/token-step-metal-soft-1.ogg',
    '/audio/token-step-metal-soft-2.ogg',
    '/audio/token-step-metal-soft-3.ogg',
    '/audio/token-step-metal-soft-4.ogg',
  ],
  'token-teleport': ['/audio/token-teleport.ogg'],
  'trade-accepted': ['/audio/trade-accepted.ogg'],
  'trade-cancelled': ['/audio/trade-cancelled.ogg'],
  'trade-proposed': ['/audio/trade-proposed.ogg'],
  'trade-rejected': ['/audio/trade-rejected.ogg'],
  'turn-extra-roll': ['/audio/turn-extra-roll.ogg'],
  'turn-yours': ['/audio/turn-yours.ogg'],
  'ui-important-click': ['/audio/ui-important-click.ogg'],
} as const

export type GameSound = keyof typeof GAME_AUDIO_FILES

export const GAME_SOUNDS = Object.keys(GAME_AUDIO_FILES) as GameSound[]

export interface AudioSettings {
  muted: boolean
  volume: number
  disabledSounds: GameSound[]
}

interface PlayOptions {
  gain?: number
  variant?: number
}

const LEGACY_STORAGE_KEY = 'business-game-audio-settings-v2'
const USER_STORAGE_PREFIX = 'business-game:audio-settings:v3:'
const DEFAULT_SETTINGS: AudioSettings = {
  muted: false,
  volume: 0.65,
  disabledSounds: [],
}

function normalizeSettings(stored: Partial<AudioSettings>): AudioSettings {
  return {
    muted: typeof stored.muted === 'boolean' ? stored.muted : DEFAULT_SETTINGS.muted,
    volume:
      typeof stored.volume === 'number'
        ? Math.min(1, Math.max(0, stored.volume))
        : DEFAULT_SETTINGS.volume,
    disabledSounds: Array.isArray(stored.disabledSounds)
      ? [
          ...new Set(
            stored.disabledSounds.filter(
              (sound): sound is GameSound =>
                typeof sound === 'string' && sound in GAME_AUDIO_FILES,
            ),
          ),
        ]
      : DEFAULT_SETTINGS.disabledSounds,
  }
}

function loadSettings(storageKey: string): AudioSettings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(storageKey) ?? '{}',
    ) as Partial<AudioSettings>
    return normalizeSettings(stored)
  } catch {
    return DEFAULT_SETTINGS
  }
}

class GameAudioManager {
  private storageKey = LEGACY_STORAGE_KEY
  private settings = loadSettings(this.storageKey)
  private listeners = new Set<() => void>()
  private templates = new Map<string, HTMLAudioElement>()
  private active = new Map<
    HTMLAudioElement,
    { gain: number; sound: GameSound }
  >()

  getSettings = (): AudioSettings => this.settings

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  useUser(userId: string): void {
    const storageKey = `${USER_STORAGE_PREFIX}${userId}`
    if (storageKey === this.storageKey) return

    let settings = DEFAULT_SETTINGS
    try {
      if (localStorage.getItem(storageKey) !== null) {
        settings = loadSettings(storageKey)
      } else if (localStorage.getItem(LEGACY_STORAGE_KEY) !== null) {
        settings = loadSettings(LEGACY_STORAGE_KEY)
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      }
    } catch {
      // Continue with defaults when storage is unavailable.
    }
    this.storageKey = storageKey
    this.replaceSettings(settings)
  }

  replaceSettings(settings: Partial<AudioSettings>): void {
    const normalized = normalizeSettings(settings)
    this.updateSettings(normalized)
    if (normalized.muted) {
      this.stopAll()
      return
    }
    for (const [player, activeSound] of this.active) {
      if (normalized.disabledSounds.includes(activeSound.sound)) {
        this.stopSounds((sound) => sound === activeSound.sound)
      } else {
        player.volume = normalized.volume * activeSound.gain
      }
    }
  }

  preloadAll(): void {
    for (const sources of Object.values(GAME_AUDIO_FILES)) {
      for (const source of sources) this.templateFor(source)
    }
  }

  play(sound: GameSound, options: PlayOptions = {}): void {
    this.playSound(sound, options, false)
  }

  preview(sound: GameSound): void {
    this.playSound(sound, {}, true)
  }

  private playSound(
    sound: GameSound,
    options: PlayOptions,
    includeDisabled: boolean,
  ): void {
    if (
      this.settings.muted ||
      this.settings.volume <= 0 ||
      (!includeDisabled && this.settings.disabledSounds.includes(sound))
    ) {
      return
    }
    const sources = GAME_AUDIO_FILES[sound]
    const variant = Math.abs(options.variant ?? 0) % sources.length
    const template = this.templateFor(sources[variant])
    const player = template.cloneNode(true) as HTMLAudioElement
    const gain = Math.min(1, Math.max(0, options.gain ?? 1))
    player.volume = this.settings.volume * gain
    this.active.set(player, { gain, sound })

    const cleanup = () => this.active.delete(player)
    player.addEventListener('ended', cleanup, { once: true })
    player.addEventListener('error', cleanup, { once: true })
    void player.play().catch(cleanup)
  }

  setMuted(muted: boolean): void {
    this.updateSettings({ ...this.settings, muted })
    if (muted) this.stopAll()
  }

  setVolume(volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume))
    if (this.settings.volume === nextVolume) return
    this.updateSettings({ ...this.settings, volume: nextVolume })
    for (const [player, activeSound] of this.active) {
      player.volume = nextVolume * activeSound.gain
    }
  }

  setSoundEnabled(sound: GameSound, enabled: boolean): void {
    const disabledSounds = new Set(this.settings.disabledSounds)
    if (enabled) disabledSounds.delete(sound)
    else disabledSounds.add(sound)
    if (disabledSounds.size === this.settings.disabledSounds.length) return
    this.updateSettings({
      ...this.settings,
      disabledSounds: GAME_SOUNDS.filter((candidate) => disabledSounds.has(candidate)),
    })
    if (!enabled) this.stopSounds((candidate) => candidate === sound)
  }

  setAllSoundsEnabled(enabled: boolean): void {
    const disabledSounds = enabled ? [] : [...GAME_SOUNDS]
    if (
      disabledSounds.length === this.settings.disabledSounds.length &&
      disabledSounds.every((sound) => this.settings.disabledSounds.includes(sound))
    ) {
      return
    }
    this.updateSettings({ ...this.settings, disabledSounds })
    if (!enabled) this.stopAll()
  }

  stopAll(): void {
    this.stopSounds(() => true)
  }

  private stopSounds(matches: (sound: GameSound) => boolean): void {
    for (const [player, activeSound] of this.active) {
      if (!matches(activeSound.sound)) continue
      try {
        player.pause()
        if (player.readyState > 0) player.currentTime = 0
      } catch {
        // A browser may discard a media element while its source is still loading.
      }
      this.active.delete(player)
    }
  }

  private templateFor(source: string): HTMLAudioElement {
    const cached = this.templates.get(source)
    if (cached) return cached
    const template = new Audio(source)
    template.preload = 'auto'
    template.load()
    this.templates.set(source, template)
    return template
  }

  private updateSettings(settings: AudioSettings): void {
    this.settings = settings
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(settings))
    } catch {
      // Audio controls must keep working even when storage is unavailable.
    }
    for (const listener of this.listeners) listener()
  }
}

export const gameAudio = new GameAudioManager()
