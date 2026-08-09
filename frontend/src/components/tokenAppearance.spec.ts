import { describe, expect, it } from 'vitest'
import {
  normalizeTokenAppearance,
  tokenFillStyle,
  tokenShapeStyle,
} from './tokenAppearance'

describe('token appearance', () => {
  it('keeps legacy solid tokens compatible', () => {
    expect(
      normalizeTokenAppearance({
        color: '#70B7FF',
        shape: 'diamond',
        icon: 'cat',
      }),
    ).toEqual({
      color: '#70b7ff',
      secondary_color: '#9d8cff',
      fill: 'solid',
      gradient_angle: 135,
      pattern: 'dots',
      shape: 'diamond',
      icon: 'cat',
      emoji: null,
    })
  })

  it('normalizes a custom emoji gradient', () => {
    expect(
      normalizeTokenAppearance({
        color: '#B8FF3D',
        secondary_color: '#38E8FF',
        fill: 'gradient',
        gradient_angle: 45,
        pattern: 'waves',
        shape: 'star',
        icon: 'emoji',
        emoji: '  🚀  ',
      }),
    ).toEqual({
      color: '#b8ff3d',
      secondary_color: '#38e8ff',
      fill: 'gradient',
      gradient_angle: 45,
      pattern: 'waves',
      shape: 'star',
      icon: 'emoji',
      emoji: '🚀',
    })
  })

  it('rejects an empty custom emoji', () => {
    expect(
      normalizeTokenAppearance({
        color: '#b8ff3d',
        shape: 'circle',
        icon: 'emoji',
        emoji: '   ',
      }),
    ).toBeNull()
  })

  it('builds pattern and shape styles', () => {
    const fill = tokenFillStyle({
      color: '#b8ff3d',
      secondary_color: '#38e8ff',
      fill: 'pattern',
      gradient_angle: 135,
      pattern: 'checker',
    })

    expect(fill.backgroundImage).toContain('linear-gradient')
    expect(tokenShapeStyle('hexagon').clipPath).toContain('polygon')
  })
})
