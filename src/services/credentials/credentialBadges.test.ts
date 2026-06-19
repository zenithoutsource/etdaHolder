import { initStorage, resetStorage } from '../storage/storage'
import {
  clearNewCredentialBadge,
  markCredentialAsNew,
  readNewCredentialBadgeIds,
} from './credentialBadges'

describe('credentialBadges', () => {
  beforeEach(async () => {
    await resetStorage()
    await initStorage()
  })

  afterEach(async () => {
    await resetStorage()
  })

  test('tracks newly received credentials until the badge is cleared', () => {
    markCredentialAsNew('credential-1')
    markCredentialAsNew('credential-2')
    markCredentialAsNew('credential-1')

    expect(readNewCredentialBadgeIds()).toEqual(['credential-1', 'credential-2'])

    clearNewCredentialBadge('credential-1')

    expect(readNewCredentialBadgeIds()).toEqual(['credential-2'])
  })
})
