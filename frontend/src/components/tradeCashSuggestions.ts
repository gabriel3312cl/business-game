export type TradeCashSuggestionKind =
  | 'difference'
  | 'discount'
  | 'original'
  | 'premium'

export interface TradeCashSuggestion {
  kind: TradeCashSuggestionKind
  amount: number
}

export function tradeCashSuggestions(
  receivedOriginalValue: number,
  givenOriginalValue: number,
  availableCash: number,
): TradeCashSuggestion[] {
  const candidates: TradeCashSuggestion[] = []
  const difference = receivedOriginalValue - givenOriginalValue

  if (difference > 0 && difference !== receivedOriginalValue) {
    candidates.push({ kind: 'difference', amount: difference })
  }
  if (receivedOriginalValue > 0) {
    candidates.push(
      {
        kind: 'discount',
        amount: Math.round(receivedOriginalValue * 0.75),
      },
      { kind: 'original', amount: receivedOriginalValue },
      {
        kind: 'premium',
        amount: Math.round(receivedOriginalValue * 1.25),
      },
    )
  }

  const seen = new Set<number>()
  return candidates.filter(({ amount }) => {
    if (amount <= 0 || amount > availableCash || seen.has(amount)) return false
    seen.add(amount)
    return true
  })
}
