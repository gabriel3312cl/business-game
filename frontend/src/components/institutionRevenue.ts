export function institutionRevenueSourceKey(
  revenueType: string | undefined,
): 'loanInterest' | 'marketFee' | 'card' | 'jailFine' | 'tax' | 'other' {
  switch (revenueType) {
    case 'loan_interest':
      return 'loanInterest'
    case 'market_fee':
      return 'marketFee'
    case 'card':
      return 'card'
    case 'jail_fine':
      return 'jailFine'
    case 'tax':
      return 'tax'
    default:
      return 'other'
  }
}
