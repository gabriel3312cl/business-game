import { describe, expect, it } from 'vitest'
import { automaticPlayerAppearance } from './playerAppearance'

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
})
