import type { IssuerPortalCredentialType } from '../../config/issuerPortalUrls'
import {
  readIssuerLoginBaseUrl,
  readWalletReturnUrl,
  resolveIssuerDocumentType,
} from '../../config/sameDeviceIssuance'

export function buildIssuerLoginUrl(credentialType: IssuerPortalCredentialType): string {
  const loginBase = readIssuerLoginBaseUrl()
  const returnUrl = readWalletReturnUrl()
  const documentType = resolveIssuerDocumentType(credentialType)

  const url = new URL(loginBase)
  url.searchParams.set('ReturnUrl', returnUrl)
  url.searchParams.set('documentType', documentType)
  return url.toString()
}

export function readIssuerPortalReturnUrl(): string {
  return readWalletReturnUrl()
}
