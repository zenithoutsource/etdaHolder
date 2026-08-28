import { X509Certificate } from 'react-native-quick-crypto'
import { sha256 } from '@noble/hashes/sha2.js'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import { isRecord, readString } from '@/src/utils/jwtUtils'

export type X509CertificateMetadata = {
  sanDnsNames: string[]
  sanUriNames: string[]
}

export function readX509LeafCertificateBase64(header: Record<string, unknown>): string | undefined {
  const x5c = header.x5c
  if (!Array.isArray(x5c)) return undefined
  return readString(x5c[0])
}

export function readX509CertificateMetadata(certificateBase64: string): X509CertificateMetadata {
  const certificate = new X509Certificate(Buffer.from(certificateBase64, 'base64'))
  return parseSubjectAltName(certificate.subjectAltName)
}

export function readPublicJwkFromX509CertificateBase64(
  certificateBase64: string,
): Record<string, unknown> {
  const certificate = new X509Certificate(Buffer.from(certificateBase64, 'base64'))
  const exported = certificate.publicKey.export({ format: 'jwk' })
  if (!isRecord(exported)) {
    throw new Error('PresentationRequestInvalid: x5c leaf certificate public key is not a JWK')
  }
  return exported
}

export function readX509HashClientIdIdentifier(certificateBase64: string): string {
  const der = new Uint8Array(Buffer.from(certificateBase64, 'base64'))
  return base64UrlEncodeBytes(sha256(der))
}

export function assertX509HashClientIdMatchesCertificate(
  clientId: string,
  certificateBase64: string,
): void {
  const expectedHash = clientId.startsWith('x509_hash:')
    ? clientId.slice('x509_hash:'.length)
    : clientId
  const actualHash = readX509HashClientIdIdentifier(certificateBase64)
  if (expectedHash !== actualHash) {
    throw new Error('PresentationRequestInvalid: x509_hash client_id does not match leaf x5c certificate')
  }
}

export function resolveX509HashVerificationJwk(input: {
  clientId: string
  header: Record<string, unknown>
}): Record<string, unknown> {
  const leafCertificate = readX509LeafCertificateBase64(input.header)
  if (!leafCertificate) {
    throw new Error('PresentationRequestInvalid: x509_hash request object requires x5c header')
  }
  assertX509HashClientIdMatchesCertificate(input.clientId, leafCertificate)
  return readPublicJwkFromX509CertificateBase64(leafCertificate)
}

export function assertX509SanDnsClientIdMatchesCertificate(
  clientId: string,
  certificateBase64: string,
): void {
  const expectedFqdn = clientId.startsWith('x509_san_dns:')
    ? clientId.slice('x509_san_dns:'.length)
    : clientId
  const metadata = readX509CertificateMetadata(certificateBase64)
  if (!metadata.sanDnsNames.includes(expectedFqdn)) {
    throw new Error('PresentationRequestInvalid: x509_san_dns client_id does not match leaf x5c certificate SAN')
  }
}

export function resolveX509SanDnsVerificationJwk(input: {
  clientId: string
  header: Record<string, unknown>
}): Record<string, unknown> {
  const leafCertificate = readX509LeafCertificateBase64(input.header)
  if (!leafCertificate) {
    throw new Error('PresentationRequestInvalid: x509_san_dns request object requires x5c header')
  }
  assertX509SanDnsClientIdMatchesCertificate(input.clientId, leafCertificate)
  return readPublicJwkFromX509CertificateBase64(leafCertificate)
}

function parseSubjectAltName(subjectAltName: string): X509CertificateMetadata {
  const sanDnsNames: string[] = []
  const sanUriNames: string[] = []

  for (const entry of subjectAltName.split(',').map((part) => part.trim()).filter(Boolean)) {
    if (entry.startsWith('DNS:')) {
      sanDnsNames.push(entry.slice('DNS:'.length))
      continue
    }
    if (entry.startsWith('URI:')) {
      sanUriNames.push(entry.slice('URI:'.length))
    }
  }

  return { sanDnsNames, sanUriNames }
}
