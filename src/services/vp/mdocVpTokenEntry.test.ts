import { readMdocVpTokenEntry } from './mdocVpTokenEntry'

const mockReadStoredMdocBytes = jest.fn()
jest.mock('../proximity/mdocStorage', () => ({
  readStoredMdocBytes: (...args: unknown[]) => mockReadStoredMdocBytes(...args),
}))

describe('readMdocVpTokenEntry', () => {
  beforeEach(() => {
    mockReadStoredMdocBytes.mockReset()
  })

  test('encodes native-stored mdoc bytes', async () => {
    mockReadStoredMdocBytes.mockResolvedValue(Uint8Array.from([1, 2, 3, 4]))

    await expect(readMdocVpTokenEntry('mdoc-1')).resolves.toBe('AQIDBA')
    expect(mockReadStoredMdocBytes).toHaveBeenCalledWith('mdoc-1')
  })

  test('falls back to mdoc rawVc when native storage is empty', async () => {
    mockReadStoredMdocBytes.mockRejectedValue(new Error('ProximityStorageFailed'))

    await expect(readMdocVpTokenEntry('mdoc-1', 'mdoc:AQIDBA')).resolves.toBe('AQIDBA')
  })
})
