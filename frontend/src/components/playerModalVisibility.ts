export function shouldShowPlayerModal(
  showOtherPlayerModals: boolean,
  currentUserId: string,
  requiredPlayerIds: Array<string | null | undefined>,
): boolean {
  return (
    showOtherPlayerModals ||
    requiredPlayerIds.some((playerId) => playerId === currentUserId)
  )
}
