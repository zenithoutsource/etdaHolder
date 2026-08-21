import { Platform } from 'react-native'

import { base64UrlToBytes } from '@/src/utils/jwtUtils'

import { isFirstPartyDrivingLicence, type FirstPartyRecordLike } from '../../config/firstPartyCredential'
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
