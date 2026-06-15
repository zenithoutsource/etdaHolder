import {
  clearSuccessfulPresentationBadge,
  readSuccessfullyPresentedCredentialIds,
  readSuccessfulPresentationHistory,
  recordSuccessfulPresentation,
} from './presentationHistory'
import { getCredentialStorage } from '../storage/storage'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

function mockStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))
  const storage = {
    getString: jest.fn((key: string) => values.get(key)),
    set: jest.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    remove: jest.fn((key: string) => {
      values.delete(key)
      return true
    }),
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return storage
}

describe('presentationHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('records successful presentation events in credential storage', () => {
    const storage = mockStorage()

    const event = recordSuccessfulPresentation({
      credentialId: 'thai-id-1',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      now: new Date('2026-06-09T10:00:00.000Z'),
    })

    expect(event).toMatchObject({
      credentialId: 'thai-id-1',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      occurredAt: '2026-06-09T10:00:00.000Z',
    })
    expect(storage.set).toHaveBeenCalledWith(`presentation:history:${event.id}`, JSON.stringify(event))
    expect(storage.set).toHaveBeenCalledWith('presentation:history:index', JSON.stringify([event.id]))
  })

  test('reads presentation events newest first and skips malformed rows', () => {
    const first = {
      id: 'first',
      credentialId: 'thai-id-1',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      occurredAt: '2026-06-09T10:00:00.000Z',
    }
    const second = {
      ...first,
      id: 'second',
      verifierName: 'Age Gate',
      occurredAt: '2026-06-10T10:00:00.000Z',
    }
    mockStorage({
      'presentation:history:index': JSON.stringify(['broken', 'first', 'second']),
      'presentation:history:broken': JSON.stringify({ id: 'broken' }),
      'presentation:history:first': JSON.stringify(first),
      'presentation:history:second': JSON.stringify(second),
    })

    expect(readSuccessfulPresentationHistory()).toEqual([second, first])
  })

  test('reads unique credential ids with successful presentations', () => {
    const first = {
      id: 'first',
      credentialId: 'thai-id-1',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      occurredAt: '2026-06-09T10:00:00.000Z',
    }
    const second = {
      ...first,
      id: 'second',
      verifierName: 'Age Gate',
      occurredAt: '2026-06-10T10:00:00.000Z',
    }
    const third = {
      ...first,
      id: 'third',
      credentialId: 'transcript-1',
      documentType: 'Academic Transcript',
      occurredAt: '2026-06-11T10:00:00.000Z',
    }
    mockStorage({
      'presentation:history:index': JSON.stringify(['broken', 'first', 'second', 'third']),
      'presentation:history:broken': JSON.stringify({ id: 'broken' }),
      'presentation:history:first': JSON.stringify(first),
      'presentation:history:second': JSON.stringify(second),
      'presentation:history:third': JSON.stringify(third),
    })

    expect(readSuccessfullyPresentedCredentialIds()).toEqual(['transcript-1', 'thai-id-1'])
  })

  test('clears the current successful presentation badge but shows it again after a later presentation', () => {
    const first = {
      id: 'first',
      credentialId: 'thai-id-1',
      verifierName: 'Entertainment Venue',
      documentType: 'Thai National ID',
      disclosedClaims: ['Date of Birth'],
      occurredAt: '2026-06-09T10:00:00.000Z',
    }
    const storage = mockStorage({
      'presentation:history:index': JSON.stringify(['first']),
      'presentation:history:first': JSON.stringify(first),
    })

    clearSuccessfulPresentationBadge('thai-id-1', new Date('2026-06-09T10:01:00.000Z'))

    expect(readSuccessfullyPresentedCredentialIds()).toEqual([])
    expect(storage.set).toHaveBeenCalledWith(
      'presentation:badge-cleared:thai-id-1',
      '2026-06-09T10:01:00.000Z',
    )

    const second = {
      ...first,
      id: 'second',
      occurredAt: '2026-06-09T10:02:00.000Z',
    }
    storage.set('presentation:history:index', JSON.stringify(['first', 'second']))
    storage.set('presentation:history:second', JSON.stringify(second))

    expect(readSuccessfullyPresentedCredentialIds()).toEqual(['thai-id-1'])
  })
})
