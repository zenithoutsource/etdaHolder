import {
  WALLET_ATTEST_WIA_KEY,
  WALLET_ATTEST_WUA_KEY,
  WALLET_CRYPTO_V2_META_KEY,
} from '@/src/config/walletCryptoPolicy'

import { logWalletStep } from '../debug/walletLogger'
import { getMetaStorage } from '../storage/storage'
import { readStoredCredentials } from '../credentials/storedCredentials'
import { hasWalletKey } from './crypto'
import { listCredentialKeyRecords } from './credentialKeyRegistry'
import { ensureWalletAttestKey } from './walletAttestKey'
import { createWalletAttestClient } from './walletAttestClient'

type CachedAttestation = {
  value: string
  expiresAt: string
}

export function isWalletCryptoV2Enabled(): boolean {
  return getMetaStorage().getString(WALLET_CRYPTO_V2_META_KEY) === 'true'
}

export function detectLegacySingleKeyWallet(): boolean {
  if (isWalletCryptoV2Enabled()) return false
  if (!hasWalletKey()) return false
  if (readStoredCredentials().length === 0) return false
  return listCredentialKeyRecords().length === 0
}

function writeCachedAttestation(key: string, value: string, expiresAt: string): void {
  const record: CachedAttestation = { value, expiresAt }
  getMetaStorage().set(key, JSON.stringify(record))
}

export async function activateWalletCryptoV2(): Promise<void> {
  if (isWalletCryptoV2Enabled()) {
    logWalletStep('crypto', 'wallet-crypto-v2-already-enabled')
    return
  }

  const { publicJwk } = await ensureWalletAttestKey()
  const attestation = await createWalletAttestClient().requestAttestations({ pubKAttestJwk: publicJwk })

  writeCachedAttestation(WALLET_ATTEST_WUA_KEY, attestation.wua, attestation.expiresAt)
  writeCachedAttestation(WALLET_ATTEST_WIA_KEY, attestation.wia, attestation.expiresAt)
  getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
  logWalletStep('crypto', 'wallet-crypto-v2-activated', { expiresAt: attestation.expiresAt })
}

export function readCachedWalletAttestations(): { wua?: CachedAttestation; wia?: CachedAttestation } {
  const parse = (raw: string | undefined): CachedAttestation | undefined => {
    if (!raw) return undefined
    try {
      const parsed = JSON.parse(raw) as Partial<CachedAttestation>
      if (typeof parsed.value === 'string' && typeof parsed.expiresAt === 'string') {
        return parsed as CachedAttestation
      }
    } catch {
      return undefined
    }
    return undefined
  }

  return {
    wua: parse(getMetaStorage().getString(WALLET_ATTEST_WUA_KEY)),
    wia: parse(getMetaStorage().getString(WALLET_ATTEST_WIA_KEY)),
  }
}
