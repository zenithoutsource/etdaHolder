const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEV_WALLET_KEY_TTL_MS = Number(process.env.EXPO_PUBLIC_WALLET_KEY_DEV_TTL_MS) || 5 * 60 * 1000;
const PROD_WALLET_KEY_TTL_MS = process.env.EXPO_PUBLIC_WALLET_KEY_PROD_TTL_DAYS
  ? Number(process.env.EXPO_PUBLIC_WALLET_KEY_PROD_TTL_DAYS) * MS_PER_DAY
  : 180 * MS_PER_DAY;

export const WALLET_KEY_TTL_MS = __DEV__
  ? DEV_WALLET_KEY_TTL_MS
  : PROD_WALLET_KEY_TTL_MS;

export function isWalletKeyExpiredAt(
  registeredAt: string | undefined,
  now = new Date(),
): boolean {
  if (!registeredAt) return false;

  const registeredAtMs = new Date(registeredAt).getTime();
  if (Number.isNaN(registeredAtMs)) return false;

  return now.getTime() > registeredAtMs + WALLET_KEY_TTL_MS;
}

export function readMsUntilWalletKeyExpiry(
  registeredAt: string | undefined,
  now = Date.now(),
): number | undefined {
  if (!registeredAt) return undefined;

  const registeredAtMs = new Date(registeredAt).getTime();
  if (Number.isNaN(registeredAtMs)) return undefined;

  return registeredAtMs + WALLET_KEY_TTL_MS - now;
}
