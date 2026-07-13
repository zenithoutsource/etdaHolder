import type { ReaderSharingMode } from '@/src/config/readerProfiles'
import {
  getReaderProfileForDocumentType,
  readerProfileUsesCompanion,
} from '@/src/config/readerProfiles'
import { HCE_ARM_WINDOW_MS } from '@/src/config/dualFormatPolicy'
import { readStoredCredentialById } from '@/src/services/credentials/storedCredentials'

import { estimateCompanionPayloadBytes } from './companionPayloadSize'
import { validateProximityArmPayload } from './proximityArmPolicy'
import {
  ProximityPresentationError,
  startProximityPresentation,
  stopProximityPresentation,
} from './proximityPresentation'
import { requireNativeProximityModule } from './nativeProximityModule'

export type ArmProximityPresentationInput = {
  credentialId: string
  approvedMdocFields: string[]
  sharingMode: ReaderSharingMode
  mdocPayloadBytes?: number
  companionPayloadBytes?: number
}

function resolveCompanionPayloadBytes(input: ArmProximityPresentationInput): number | undefined {
  if (input.sharingMode !== 'dual-format') {
    return input.companionPayloadBytes
  }

  if (input.companionPayloadBytes !== undefined) {
    return input.companionPayloadBytes
  }

  const record = readStoredCredentialById(input.credentialId)
  const profile = record
    ? getReaderProfileForDocumentType(record.type, input.sharingMode)
    : undefined
  const pluginId = profile?.companion?.transportPluginId

  if (!record?.rawVc || !pluginId) {
    throw new ProximityPresentationError(
      'CREDENTIAL_NOT_FOUND',
      'No SD-JWT credential available for dual-format companion transport',
    )
  }

  return estimateCompanionPayloadBytes(record.rawVc, pluginId)
}

export async function armProximityPresentation(input: ArmProximityPresentationInput): Promise<void> {
  const companionPayloadBytes = resolveCompanionPayloadBytes(input)

  validateProximityArmPayload({
    mdocPayloadBytes: input.mdocPayloadBytes ?? 0,
    companionPayloadBytes: companionPayloadBytes ?? 0,
  })

  await startProximityPresentation(input.credentialId, {
    onDeviceEngaged: () => undefined,
    onRequestReceived: () => undefined,
    onPresentationComplete: () => undefined,
    onError: () => undefined,
  })

  const record = readStoredCredentialById(input.credentialId)
  const profile = record
    ? getReaderProfileForDocumentType(record.type, input.sharingMode)
    : undefined

  await requireNativeProximityModule().armProximitySession({
    credentialId: input.credentialId,
    sharingMode: input.sharingMode,
    profileId: profile?.profileId ?? 'unknown-profile',
    approvedMdocFields: input.approvedMdocFields,
    companionTransportPluginId: profile?.companion?.transportPluginId,
    ...(profile && readerProfileUsesCompanion(profile) && record?.rawVc
      ? { companionSdJwt: record.rawVc }
      : {}),
    armWindowMs: HCE_ARM_WINDOW_MS,
  })
}

export async function disarmProximityPresentation(): Promise<void> {
  await stopProximityPresentation()
}

const NFC_TEST_ARM_WINDOW_MS =
  Number(process.env.EXPO_PUBLIC_NFC_TEST_ARM_WINDOW_MS) || 120_000

/**
 * DEV-ONLY: arm the companion HCE session with a dummy id (no stored mDOC) so
 * the ACR1311U-N2 reader path can be validated end-to-end. Bypasses the mDOC
 * guard in `startProximityPresentation` on purpose and calls the native module
 * directly. Never callable in production.
 */
export async function armProximityTestSession(): Promise<void> {
  if (!__DEV__) {
    throw new Error('armProximityTestSession is dev-only')
  }

  await requireNativeProximityModule().armProximitySession({
    credentialId: 'nfc-test',
    sharingMode: 'mdoc-only',
    profileId: 'nfc-test-profile',
    approvedMdocFields: [],
    armWindowMs: NFC_TEST_ARM_WINDOW_MS,
  })
}

export const NFC_TEST_ARM_WINDOW_SECONDS = Math.round(NFC_TEST_ARM_WINDOW_MS / 1000)
