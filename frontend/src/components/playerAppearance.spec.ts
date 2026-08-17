import { describe, expect, it } from 'vitest'
import {
  automaticPlayerAppearance,
  resolvedPlayerAppearance,
} from './playerAppearance'

describe('automaticPlayerAppearance', () => {
  it('provides twenty unique colors and visual models', () => {
    const appearances = Array.from({ length: 20 }, (_, appearance_slot) =>
      automaticPlayerAppearance({ appearance_slot }, appearance_slot),
    )

    expect(new Set(appearances.map((appearance) => appearance.color)).size).toBe(20)
    expect(
      new Set(
        appearances.map(
          (appearance) => `${appearance.icon}:${appearance.emoji ?? ''}`,
        ),
      ).size,
    ).toBe(20)
  })

  it('uses the player index for states saved before appearance slots existed', () => {
    expect(automaticPlayerAppearance({}, 3)).toEqual(
      automaticPlayerAppearance({ appearance_slot: 3 }, 0),
    )
  })

  it('uses the shared player appearance on every client', () => {
    const sharedAppearance = {
      color: '#70b7ff',
      secondary_color: '#ff6ea8',
      fill: 'gradient' as const,
      gradient_angle: 45,
      pattern: 'waves' as const,
      shape: 'star' as const,
      icon: 'emoji' as const,
      emoji: '🚀',
    }

    expect(
      resolvedPlayerAppearance(
        { appearance_slot: 3, token_appearance: sharedAppearance },
        0,
      ),
    ).toEqual(sharedAppearance)
  })

  it('keeps the current local edit visible until the shared state arrives', () => {
    const localAppearance = {
      ...automaticPlayerAppearance({ appearance_slot: 2 }, 2),
      color: '#ffffff',
    }

    expect(
      resolvedPlayerAppearance(
        { appearance_slot: 3, token_appearance: null },
        0,
        localAppearance,
      ),
    ).toEqual(localAppearance)
  })
})
