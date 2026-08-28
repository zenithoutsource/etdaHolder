import { createHash } from 'react-native-quick-crypto'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

import {
  buildTransactionDataKbJwtClaims,
  parseTransactionDataFromAuthorizationRequest,
} from './transactionDataKbJwt'

function encodeTransactionDataObject(value: Record<string, unknown>): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)))
}

describe('transactionDataKbJwt', () => {
  test('parseTransactionDataFromAuthorizationRequest returns undefined when absent', () => {
    expect(parseTransactionDataFromAuthorizationRequest({})).toBeUndefined()
  })

  test('buildTransactionDataKbJwtClaims hashes raw base64url strings without decoding', () => {
    const entry = encodeTransactionDataObject({
      type: 'example',
      credential_ids: ['cred-1'],
    })
    const expectedHash = base64UrlEncodeBytes(
      createHash('sha256').update(entry, 'utf8').digest(),
    )

    expect(
      buildTransactionDataKbJwtClaims({
        entries: [entry],
      }),
    ).toEqual({
      transaction_data_hashes: [expectedHash],
    })
  })

  test('includes transaction_data_hashes_alg when advertised inside transaction_data', () => {
    const entry = encodeTransactionDataObject({
      type: 'example',
      credential_ids: ['cred-1'],
      transaction_data_hashes_alg: 'sha-256',
    })

    expect(
      buildTransactionDataKbJwtClaims(
        parseTransactionDataFromAuthorizationRequest({
          transaction_data: [entry],
        }),
      ),
    ).toEqual({
      transaction_data_hashes: [
        base64UrlEncodeBytes(createHash('sha256').update(entry, 'utf8').digest()),
      ],
      transaction_data_hashes_alg: 'sha-256',
    })
  })
})
