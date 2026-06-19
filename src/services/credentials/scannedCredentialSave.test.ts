import { saveScannedCredential } from './scannedCredentialSave'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const record: VerifiableCredentialRecord = {
  id: 'transcript-2',
  type: 'BangkokUniversityTranscript',
  rawVc: 'header.payload.signature',
  claims: {},
  issuedAt: '2026-06-15T10:00:00.000Z',
}

describe('saveScannedCredential', () => {
  test('refreshes stored credentials after saving a scanned credential', () => {
    const events: string[] = []
    const saveCredentialRecord = jest.fn(() => events.push('save'))
    const markCredentialAsNew = jest.fn(() => events.push('mark-new'))
    const refreshCredentials = jest.fn(() => events.push('refresh'))

    saveScannedCredential(record, {
      saveCredentialRecord,
      markCredentialAsNew,
      refreshCredentials,
    })

    expect(saveCredentialRecord).toHaveBeenCalledWith(record)
    expect(markCredentialAsNew).toHaveBeenCalledWith(record.id)
    expect(refreshCredentials).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['save', 'mark-new', 'refresh'])
  })
})
