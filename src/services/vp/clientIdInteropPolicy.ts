import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'

import type { ParsedClientId } from './clientIdScheme'

const PERMANENTLY_UNSUPPORTED_CLIENT_ID_SCHEMES = new Set<ParsedClientId['scheme']>([
  'unknown',
  'openid_federation',
  'verifier_attestation',
  'origin',
])

const INTEROP_X509_CLIENT_ID_SCHEMES = new Set<ParsedClientId['scheme']>([
  'x509_hash',
  'x509_san_dns',
])

function readClientIdInteropEnabled(trustAnyHttpsPeer: boolean): boolean {
  return trustAnyHttpsPeer || readWalletDemoInteropEnabled()
}

export function isClientIdSchemeSupportedForTrust(
  scheme: ParsedClientId['scheme'],
  trustAnyHttpsPeer: boolean,
): boolean {
  const interop = readClientIdInteropEnabled(trustAnyHttpsPeer)
  if (PERMANENTLY_UNSUPPORTED_CLIENT_ID_SCHEMES.has(scheme)) return false
  if (INTEROP_X509_CLIENT_ID_SCHEMES.has(scheme)) return interop
  return true
}

export function isX509ClientIdScheme(scheme: ParsedClientId['scheme']): boolean {
  return INTEROP_X509_CLIENT_ID_SCHEMES.has(scheme)
}
