import { readWalletHistory } from './walletHistory'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'BangkokUniversityTranscript',
  rawVc: 'header.payload.signature',
  claims: { givenName: 'Ada', familyName: 'Lovelace' },
  issuedAt: '2026-06-07T10:00:00.000Z',
}

const licenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: { givenName: 'Mali', familyName: 'Somsri' },
  issuedAt: '2026-06-08T10:00:00.000Z',
}

describe('walletHistory', () => {
  test('derives wallet transaction events from local credentials newest first', () => {
    const history = readWalletHistory([transcriptRecord, licenceRecord])

    expect(history.transactions).toEqual([
      {
        id: 'credential-issued:licence-1',
        credentialId: 'licence-1',
        title: 'Driving Licence',
        subtitle: 'Credential saved to Wallet',
        issuerName: 'Department of Land Transport',
        documentType: 'Driving Licence',
        actionLabel: 'Credential received',
        occurredAt: '2026-06-08T10:00:00.000Z',
        status: 'completed',
      },
      {
        id: 'credential-issued:transcript-1',
        credentialId: 'transcript-1',
        title: 'Academic Transcript',
        subtitle: 'Credential saved to Wallet',
        issuerName: 'Bangkok University',
        documentType: 'Academic Transcript',
        actionLabel: 'Credential received',
        occurredAt: '2026-06-07T10:00:00.000Z',
        status: 'completed',
      },
    ])
  })

  test('includes successful presentation history events', () => {
    const history = readWalletHistory([transcriptRecord], {}, [
      {
        id: 'presentation-1',
        credentialId: 'transcript-1',
        verifierName: 'Entertainment Venue',
        documentType: 'Academic Transcript',
        disclosedClaims: ['Date of Birth'],
        occurredAt: '2026-06-09T10:00:00.000Z',
      },
    ])

    expect(history.presentations).toEqual([
      {
        id: 'presentation:presentation-1',
        credentialId: 'transcript-1',
        title: 'Academic Transcript',
        subtitle: 'Shared Date of Birth',
        issuerName: 'Entertainment Venue',
        documentType: 'Academic Transcript',
        actionLabel: 'Credential presented',
        occurredAt: '2026-06-09T10:00:00.000Z',
        status: 'completed',
      },
    ])
  })

  test('includes local P6 lifecycle events when a credential is revoked or deleted', () => {
    const history = readWalletHistory([transcriptRecord], {
      'transcript-1': {
        credentialId: 'transcript-1',
        action: 'Revoke',
        status: 'revoked',
        occurredAt: '2026-06-08T10:00:00.000Z',
      },
    })

    expect(history.transactions[0]).toEqual({
      id: 'credential-lifecycle:transcript-1:revoked',
      credentialId: 'transcript-1',
      title: 'Academic Transcript',
      subtitle: 'Credential revocation approved by Wallet',
      issuerName: 'Bangkok University',
      documentType: 'Academic Transcript',
      actionLabel: 'Credential revoked',
      occurredAt: '2026-06-08T10:00:00.000Z',
      status: 'revoked',
    })
  })
})
