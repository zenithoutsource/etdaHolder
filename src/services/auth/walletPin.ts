import { createHash, randomBytes } from 'react-native-quick-crypto'

import { getCredentialStorage, persistWalletPinMeta, provisionStoragePinFallback } from '../storage/storage'

const WALLET_PIN_KEY = 'wallet:pin:v1'
const PIN_LENGTH = 6

type StoredWalletPin = {
  salt: string
  hash: string
}

function isSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin)
}

function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

function readStoredPin(): StoredWalletPin | undefined {
  const raw = getCredentialStorage().getString(WALLET_PIN_KEY)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<StoredWalletPin>
    if (typeof parsed.salt === 'string' && typeof parsed.hash === 'string') {
      return { salt: parsed.salt, hash: parsed.hash }
    }
  } catch {
    return undefined
  }

  return undefined
}

export function hasWalletPin(): boolean {
  return Boolean(readStoredPin())
}

export function setWalletPin(pin: string): void {
  if (!isSixDigitPin(pin)) {
    throw new Error(`InvalidWalletPin: expected ${PIN_LENGTH} digits`)
  }

  const salt = randomBytes(16).toString('hex')
  const hash = hashPin(pin, salt)
  const stored: StoredWalletPin = { salt, hash }
  getCredentialStorage().set(WALLET_PIN_KEY, JSON.stringify(stored))
  persistWalletPinMeta({ salt, hash })
  provisionStoragePinFallback(pin)
}

export function verifyWalletPin(pin: string): boolean {
  if (!isSixDigitPin(pin)) return false

  const stored = readStoredPin()
  if (!stored) return false

  return hashPin(pin, stored.salt) === stored.hash
}
