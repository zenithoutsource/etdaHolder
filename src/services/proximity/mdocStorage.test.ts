jest.mock('./nativeProximityModule', () => ({
  getNativeProximityModule: jest.fn(),
  requireNativeProximityModule: jest.fn(),
}))

import { hasStoredMdoc } from './mdocStorage'
import { getNativeProximityModule } from './nativeProximityModule'

describe('hasStoredMdoc', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns unknown when the native proximity module is unavailable', async () => {
    jest.mocked(getNativeProximityModule).mockReturnValue(null)

    await expect(hasStoredMdoc('credential-1')).resolves.toBeUndefined()
  })

  test('returns unknown when the native presence check fails', async () => {
    jest.mocked(getNativeProximityModule).mockReturnValue({
      hasMdoc: jest.fn().mockRejectedValue(new Error('native-presence-failed')),
    } as never)

    await expect(hasStoredMdoc('credential-1')).resolves.toBeUndefined()
  })

  test('preserves a positively reported native presence result', async () => {
    jest.mocked(getNativeProximityModule).mockReturnValue({
      hasMdoc: jest.fn().mockResolvedValue(true),
    } as never)

    await expect(hasStoredMdoc('credential-1')).resolves.toBe(true)
  })
})
