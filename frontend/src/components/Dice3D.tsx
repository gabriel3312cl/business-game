import { Box, Stack } from '@mui/material'
import type { VisualEffectsIntensity } from '../types'

interface Dice3DProps {
  values: readonly [number, number] | null
  rollSequence: number | null
  dieLabel: string
  motionIntensity?: VisualEffectsIntensity
}

const faceTransforms: Record<number, string> = {
  1: 'translateZ(calc(var(--die-size) / 2))',
  2: 'rotateX(90deg) translateZ(calc(var(--die-size) / 2))',
  3: 'rotateY(90deg) translateZ(calc(var(--die-size) / 2))',
  4: 'rotateY(-90deg) translateZ(calc(var(--die-size) / 2))',
  5: 'rotateX(-90deg) translateZ(calc(var(--die-size) / 2))',
  6: 'rotateY(180deg) translateZ(calc(var(--die-size) / 2))',
}

const restingTransforms: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(0deg) rotateY(180deg)',
}

const pipPositions: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

export function Dice3D({
  values,
  rollSequence,
  dieLabel,
  motionIntensity = 'full',
}: Dice3DProps) {
  const displayedValues = values ?? ([1, 1] as const)
  const decorative = values === null

  return (
    <Stack
      direction="row"
      spacing={{ xs: 0.75, sm: 1.4 }}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {displayedValues.map((value, index) => (
        <Die
          key={`${rollSequence ?? 'decorative'}-${index}`}
          value={value}
          index={index}
          decorative={decorative}
          motionIntensity={motionIntensity}
          label={`${dieLabel} ${index + 1}: ${value}`}
        />
      ))}
    </Stack>
  )
}

interface DieProps {
  value: number
  index: number
  decorative: boolean
  label: string
  motionIntensity: VisualEffectsIntensity
}

function Die({ value, index, decorative, label, motionIntensity }: DieProps) {
  const boundedValue = Math.max(1, Math.min(6, Math.trunc(value)))
  const restingTransform = restingTransforms[boundedValue]

  return (
    <Box
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      sx={{
        '--die-size': {
          xs: '34px',
          sm: '56px',
          lg: '82px',
        },
        width: 'var(--die-size)',
        height: 'var(--die-size)',
        perspective: 'calc(var(--die-size) * 5.5)',
        transform: index === 0 ? 'rotateZ(-5deg)' : 'rotateZ(5deg)',
        filter: 'drop-shadow(0 14px 14px rgba(0,0,0,.34))',
      }}
    >
      <Box
        sx={{
          '--die-rest-transform': restingTransform,
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transform: restingTransform,
          animation: decorative || motionIntensity === 'off'
            ? 'none'
            : motionIntensity === 'soft'
              ? 'dice-soft 360ms ease-out both'
              : 'dice-tumble 780ms cubic-bezier(.22,.72,.24,1) both',
          animationDelay: decorative ? '0ms' : `${index * 70}ms`,
          '@keyframes dice-tumble': {
            '0%': {
              transform:
                'rotateX(-18deg) rotateY(24deg) rotateZ(0deg) scale(.86)',
            },
            '28%': {
              transform:
                'rotateX(286deg) rotateY(-214deg) rotateZ(72deg) scale(1.04)',
            },
            '58%': {
              transform:
                'rotateX(518deg) rotateY(396deg) rotateZ(-54deg) scale(.96)',
            },
            '78%': {
              transform:
                'rotateX(682deg) rotateY(-492deg) rotateZ(28deg) scale(1.02)',
            },
            '100%': {
              transform: 'var(--die-rest-transform)',
            },
          },
          '@keyframes dice-soft': {
            '0%': { opacity: 0.45, transform: 'var(--die-rest-transform) scale(.88)' },
            '65%': { opacity: 1, transform: 'var(--die-rest-transform) scale(1.06)' },
            '100%': { opacity: 1, transform: 'var(--die-rest-transform)' },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
            transform: restingTransform,
          },
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <DieFace key={face} value={face} />
        ))}
      </Box>
    </Box>
  )
}

function DieFace({ value }: { value: number }) {
  const visiblePips = new Set(pipPositions[value])

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap: '5%',
        p: '15%',
        boxSizing: 'border-box',
        borderRadius: '18%',
        bgcolor: '#f8f8fb',
        border: '1px solid rgba(82,82,98,.16)',
        boxShadow:
          'inset -8px -9px 13px rgba(70,70,86,.2), inset 4px 4px 8px rgba(255,255,255,.9)',
        backfaceVisibility: 'hidden',
        transform: faceTransforms[value],
      }}
    >
      {Array.from({ length: 9 }, (_, index) => {
        const position = index + 1
        return (
          <Box
            key={position}
            component="span"
            sx={{
              width: '72%',
              aspectRatio: '1',
              placeSelf: 'center',
              borderRadius: '50%',
              bgcolor: visiblePips.has(position) ? '#11101a' : 'transparent',
              boxShadow: visiblePips.has(position)
                ? 'inset 1px 1px 2px rgba(255,255,255,.18)'
                : 'none',
            }}
          />
        )
      })}
    </Box>
  )
}
