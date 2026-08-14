import { createHash } from 'react-native-quick-crypto'

import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import {
  bindPendingHardwareKeyToCredential,
  createPendingHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  readHardwareCredentialSigningPublicJwk,
} from '@/src/services/crypto/hardwareCredentialSigningKey'
import { getPublicKeyJwk } from '@/src/services/crypto/crypto'
import { storeMdocCredential } from '@/src/services/proximity/mdocStorage'
import { toMdocBytes } from '@/src/services/proximity/mdocCredential'
import { requireNativeProximityModule } from '@/src/services/proximity/nativeProximityModule'
import { extractMdocWalletClaims } from '@/src/services/credentials/mdocWalletClaims'
import { getCredentialStorage as getDefaultCredentialStorage } from '@/src/services/storage/storage'
import {
  saveCredentialRecord,
  type VerifiableCredentialRecord,
} from '@/src/services/vci/exchangeService'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

const TEST_MDL_DOCTYPE = 'org.iso.18013.5.1.mDL'
const TEST_MDL_TYPE = 'DLTDrivingLicence'

export function isTestMdlInjectAllowed(isDevelopment = __DEV__): boolean {
  return isDevelopment
}

export type InjectTestMdlDependencies = {
  isDevelopment?: boolean
  generateTestMdl?: (deviceJwkJson: string) => Promise<Uint8Array>
  createPendingHardwareKey?: typeof createPendingHardwareCredentialKey
  readPendingPublicJwk?: typeof readHardwareCredentialSigningPublicJwk
  bindHardwareKey?: typeof bindPendingHardwareKeyToCredential
  discardPendingHardwareKey?: typeof discardPendingHardwareCredentialKey
  readSoftwarePublicJwk?: typeof getPublicKeyJwk
  storeMdoc?: typeof storeMdocCredential
  saveRecord?: typeof saveCredentialRecord
}

export async function injectTestMdlCredential(
  dependencies: InjectTestMdlDependencies = {},
): Promise<VerifiableCredentialRecord> {
  const isDevelopment = dependencies.isDevelopment ?? __DEV__
  if (!isTestMdlInjectAllowed(isDevelopment)) {
    throw new Error('TestMdlInjectDisabled')
  }

  logWalletStep('proximity-test-mdl', 'inject start')
  const generateTestMdl =
    dependencies.generateTestMdl ??
    ((deviceJwkJson: string) => requireNativeProximityModule().generateTestMdl(deviceJwkJson))
  const createPendingHardwareKey =
    dependencies.createPendingHardwareKey ?? createPendingHardwareCredentialKey
  const readPendingPublicJwk =
    dependencies.readPendingPublicJwk ?? readHardwareCredentialSigningPublicJwk
  const bindHardwareKey = dependencies.bindHardwareKey ?? bindPendingHardwareKeyToCredential
  const discardPendingHardwareKey =
    dependencies.discardPendingHardwareKey ?? discardPendingHardwareCredentialKey
  const readSoftwarePublicJwk = dependencies.readSoftwarePublicJwk ?? getPublicKeyJwk
  const storeMdoc = dependencies.storeMdoc ?? storeMdocCredential
  const saveRecord = dependencies.saveRecord ?? saveCredentialRecord

  let pendingId: string | undefined
  try {
    let deviceJwkJson: string
    if (isHardwareP256SigningEnabled()) {
      pendingId = await createPendingHardwareKey()
      const jwk = await readPendingPublicJwk(pendingId)
      deviceJwkJson = JSON.stringify({
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
      })
    } else {
      const jwk = readSoftwarePublicJwk()
      deviceJwkJson = JSON.stringify({
        kty: jwk.kty,
        crv: jwk.crv,
        x: jwk.x,
      })
    }

    const mdocBytes = toMdocBytes(await generateTestMdl(deviceJwkJson))
    const rawBase64 = base64UrlEncodeBytes(mdocBytes)
    const credentialId = createHash('sha256').update(rawBase64).digest('hex')
    if (pendingId) {
      await bindHardwareKey(pendingId, credentialId, TEST_MDL_TYPE)
      pendingId = undefined
    }

    await storeMdoc({ credentialId, docType: TEST_MDL_DOCTYPE }, mdocBytes)
    const record: VerifiableCredentialRecord = {
      id: credentialId,
      type: TEST_MDL_TYPE,
      rawVc: `mdoc:${rawBase64}`,
      claims: {
        doctype: TEST_MDL_DOCTYPE,
        familyName: 'TEST',
        givenName: 'HOLDER',
        birthDate: '1990-01-01',
        ...extractMdocWalletClaims(mdocBytes),
      },
      issuedAt: new Date().toISOString(),
      issuerName: 'Wallet TEST IACA',
    }
    saveRecord(record, {
      appendHistory: false,
      getCredentialStorage: getDefaultCredentialStorage,
    })
    logWalletStep('proximity-test-mdl', 'inject complete', { credentialId })
    return record
  } catch (error) {
    if (pendingId) {
      await discardPendingHardwareKey(pendingId).catch((cleanupError) => {
        logWalletError('proximity-test-mdl', 'pending key cleanup failed', cleanupError)
      })
    }
    logWalletError('proximity-test-mdl', 'inject failed', error)
    throw error instanceof Error ? error : new Error('TestMdlInjectFailed')
  }
}
