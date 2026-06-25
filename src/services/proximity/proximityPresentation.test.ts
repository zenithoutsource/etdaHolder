import { ProximityPresentationError } from './proximityPresentation'

function mapNativeError(error: unknown): ProximityPresentationError {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : 'UNKNOWN'

  const message = error instanceof Error ? error.message : 'Proximity presentation failed'

  switch (code) {
    case 'NFC_UNAVAILABLE':
      return new ProximityPresentationError('NFC_UNAVAILABLE', 'NFC is not supported on this device')
    case 'NFC_DISABLED':
      return new ProximityPresentationError('NFC_DISABLED', 'Please enable NFC in Settings')
    case 'CREDENTIAL_NOT_FOUND':
      return new ProximityPresentationError('CREDENTIAL_NOT_FOUND', 'No credential available for proximity')
    case 'PRESENTATION_ACTIVE':
      return new ProximityPresentationError('PRESENTATION_ACTIVE', 'A proximity presentation is already active')
    case 'PROXIMITY_NOT_READY':
      return new ProximityPresentationError('PROXIMITY_NOT_READY', message)
    default:
      return new ProximityPresentationError('UNKNOWN', message)
  }
}

describe('proximityPresentation error mapping', () => {
  it('maps native NFC errors to user-facing codes', () => {
    expect(mapNativeError({ code: 'NFC_DISABLED', message: 'NFC is disabled' }).code).toBe('NFC_DISABLED')
    expect(mapNativeError({ code: 'CREDENTIAL_NOT_FOUND', message: 'missing' }).code).toBe('CREDENTIAL_NOT_FOUND')
  })

  it('falls back to UNKNOWN for unexpected native errors', () => {
    const error = mapNativeError(new Error('boom'))
    expect(error).toBeInstanceOf(ProximityPresentationError)
    expect(error.code).toBe('UNKNOWN')
  })
})
