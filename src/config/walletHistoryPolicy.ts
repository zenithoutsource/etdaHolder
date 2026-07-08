/** Days to keep wallet history events; 0 disables pruning. */
export const WALLET_HISTORY_RETENTION_DAYS =
  Number(process.env.EXPO_PUBLIC_WALLET_HISTORY_RETENTION_DAYS) || 0
