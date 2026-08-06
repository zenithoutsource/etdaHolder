import { createHash, randomBytes } from 'react-native-quick-crypto'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

export type PkcePair = {
  codeVerifier: string
  codeChallenge: string
}

export function generatePkcePair(): PkcePair {
  const codeVerifier = base64UrlEncodeBytes(randomBytes(32))
  const digest = createHash('sha256').update(codeVerifier).digest()
  const codeChallenge = base64UrlEncodeBytes(new Uint8Array(digest))
  return { codeVerifier, codeChallenge }
}
