import { Platform } from 'react-native'

import { base64UrlToBytes } from '@/src/utils/jwtUtils'

import type { VerifiableCredentialRecord } from '../vci/exchangeService'

import { isFirstPartyDrivingLicence, type FirstPartyRecordLike } from '../../config/firstPartyCredential'
import { recordHasLogicalMdocFormat } from '../credentials/logicalCredentialStorage'
import { logWalletError } from '../debug/walletLogger'
import { hasStoredMdoc, storeMdocCredential } from './mdocStorage'

const MDOC_RAW_PREFIX = 'mdoc:'

type MdocRecordLike = {
  id: string
  rawVc: string
  type?: string
  claims: Record<string, unknown>
  credentialConfigurationId?: string
}

export function isMdocRawVc(rawVc: string | undefined): boolean {
  return typeof rawVc === 'string' && rawVc.startsWith(MDOC_RAW_PREFIX)
}

/** True when the wallet can build an mdoc DeviceResponse for this record. */
export function isMdocPresentableRecord(record: MdocRecordLike): boolean {
  if (isMdocRawVc(record.rawVc)) return true
  return recordHasLogicalMdocFormat(record.id)
}

export function readMdocDocTypeFromRecord(record: MdocRecordLike): string {
  const doctype = record.claims.doctype ?? record.claims.docType
  if (typeof doctype === 'string' && doctype.length > 0 && doctype !== 'unknown') {
    return doctype
  }
  if (record.type) {
    const classified: FirstPartyRecordLike = {
      type: record.type,
      claims: record.claims ?? {},
      ...(record.credentialConfigurationId
        ? { credentialConfigurationId: record.credentialConfigurationId }
        : {}),
    }
    if (isFirstPartyDrivingLicence(classified)) {
      return 'org.iso.18013.5.1.mDL'
    }
  }
  if (isMdocRawVc(record.rawVc) || recordHasLogicalMdocFormat(record.id)) {
    return 'org.iso.18013.5.1.mDL'
  }
  return 'unknown'
}

export async function enumeratePresentableMdocCredentials(
  credentials: VerifiableCredentialRecord[],
): Promise<VerifiableCredentialRecord[]> {
  const resolved = await Promise.all(
    credentials.map(async (credential) => ({
      credential,
      presentable:
        isMdocPresentableRecord(credential) ||
        (await hasStoredMdoc(credential.id)) === true,
    })),
  )
  return resolved.filter((entry) => entry.presentable).map((entry) => entry.credential)
}

export function canShowNfcPresentButton(input: {
  record?: Pick<MdocRecordLike, 'rawVc'> &
    Partial<Pick<MdocRecordLike, 'type' | 'claims' | 'credentialConfigurationId'>>
  hasNativeMdoc: boolean
  renewalBlocked: boolean
  platform?: string
}): boolean {
  if (input.renewalBlocked || !input.record) return false
  if ((input.platform ?? Platform.OS) !== 'android') return false
  if (input.record.type) {
    const classified: FirstPartyRecordLike = {
      type: input.record.type,
      claims: input.record.claims ?? {},
      ...(input.record.credentialConfigurationId
        ? { credentialConfigurationId: input.record.credentialConfigurationId }
        : {}),
    }
    if (!isFirstPartyDrivingLicence(classified)) return false
  }
  return input.hasNativeMdoc || isMdocRawVc(input.record.rawVc)
}

export function readMdocBytesFromRawVc(rawVc: string): Uint8Array {
  if (!isMdocRawVc(rawVc)) {
    throw new Error('MdocRawVcRequired')
  }
  return base64UrlToBytes(rawVc.slice(MDOC_RAW_PREFIX.length))
}

export async function ensureNativeMdocStored(record: MdocRecordLike): Promise<boolean> {
  if ((await hasStoredMdoc(record.id)) === true) return true
  if (!isMdocRawVc(record.rawVc)) return false

  const docType =
    typeof record.claims.doctype === 'string' && record.claims.doctype.length > 0
      ? record.claims.doctype
      : 'org.iso.18013.5.1.mDL'
  try {
    await storeMdocCredential(
      { credentialId: record.id, docType },
      readMdocBytesFromRawVc(record.rawVc),
    )
    return true
  } catch (error) {
    logWalletError('proximity-storage', 'ensure native mdoc from rawVc failed', error, {
      credentialId: record.id,
    })
    return false
  }
}

export function toMdocBytes(value: Uint8Array | ArrayBuffer | ArrayLike<number>): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return Uint8Array.from(value)
}
