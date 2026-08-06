import type { BoardEdge } from './BoardTile'

export function perimeterPosition(
  index: number,
  side: number,
): { column: number; row: number; edge: BoardEdge; rotation: number } {
  let column: number
  let row: number
  if (index < side) {
    column = index + 1
    row = 1
  } else if (index < side * 2 - 1) {
    column = side
    row = index - side + 2
  } else if (index < side * 3 - 2) {
    column = side - 1 - (index - (side * 2 - 1))
    row = side
  } else {
    column = 1
    row = side - 1 - (index - (side * 3 - 2))
  }

  const corner =
    (column === 1 || column === side) && (row === 1 || row === side)
  const edge: BoardEdge = corner
    ? 'corner'
    : row === 1
      ? 'top'
      : column === side
        ? 'right'
        : row === side
          ? 'bottom'
          : 'left'
  const rotation = corner
    ? row === 1
      ? column === 1
        ? 135
        : -135
      : column === 1
        ? 45
        : -45
    : edge === 'top'
      ? 180
      : edge === 'right'
        ? -90
        : edge === 'left'
          ? 90
          : 0
  return { column, row, edge, rotation }
}
