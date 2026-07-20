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
  approveProximityPresentation,
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

  await approveProximityPresentation(input.approvedMdocFields)
}

export async function disarmProximityPresentation(): Promise<void> {
  await stopProximityPresentation()
}
