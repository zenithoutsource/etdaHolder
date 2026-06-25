import NfcManager, { Ndef, NfcTech, NfcError } from 'react-native-nfc-manager'

import {
  NfcDisabledError,
  NfcReadCancelledError,
  NfcUnsupportedError,
  NfcUnsupportedTagError,
  cancelNfcRead,
  classifyNfcPayloadUri,
  initNfc,
  readNdefPayloadUri,
  readSingleNfcPayload,
  resetNfcForTests,
} from './nfcTagService'

jest.mock('../debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('react-native-nfc-manager', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(),
    start: jest.fn(),
    isEnabled: jest.fn(),
    requestTechnology: jest.fn(),
    getTag: jest.fn(),
    cancelTechnologyRequest: jest.fn(),
  },
  NfcTech: {
    Ndef: 'Ndef',
  },
  NfcError: {
    UserCancel: class UserCancel extends Error {},
    Timeout: class Timeout extends Error {},
  },
  Ndef: {
    text: {
      decodePayload: jest.fn(),
    },
    uri: {
      decodePayload: jest.fn(),
    },
  },
}))

const nfcManagerMock = NfcManager as jest.Mocked<typeof NfcManager>
const uriDecodeMock = Ndef.uri.decodePayload as jest.Mock<string, [Uint8Array]>
const textDecodeMock = Ndef.text.decodePayload as jest.Mock<string, [Uint8Array]>

describe('nfcTagService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    resetNfcForTests()
    nfcManagerMock.isSupported.mockResolvedValue(true)
    nfcManagerMock.start.mockResolvedValue()
    nfcManagerMock.isEnabled.mockResolvedValue(true)
    nfcManagerMock.requestTechnology.mockResolvedValue(NfcTech.Ndef)
    nfcManagerMock.getTag.mockResolvedValue({ ndefMessage: [] })
    nfcManagerMock.cancelTechnologyRequest.mockResolvedValue()
    uriDecodeMock.mockReturnValue('')
    textDecodeMock.mockReturnValue('')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('classifies credential offer URIs', () => {
    expect(classifyNfcPayloadUri('openid-credential-offer://?credential_offer={}')).toEqual({
      kind: 'credential-offer',
      uri: 'openid-credential-offer://?credential_offer={}',
    })
  })

  it('classifies OID4VP URIs', () => {
    expect(classifyNfcPayloadUri('openid4vp://?response_type=vp_token')).toEqual({
      kind: 'oid4vp',
      uri: 'openid4vp://?response_type=vp_token',
    })
  })

  it('rejects unsupported URIs', () => {
    expect(() => classifyNfcPayloadUri('https://example.com')).toThrow(NfcUnsupportedTagError)
  })

  it('extracts a URI record payload', () => {
    uriDecodeMock.mockReturnValue('openid4vp://?response_type=vp_token')

    expect(readNdefPayloadUri({
      ndefMessage: [{ tnf: 1, type: [85], payload: [0x01, 0x02] }],
    })).toBe('openid4vp://?response_type=vp_token')
  })

  it('extracts a text record payload', () => {
    textDecodeMock.mockReturnValue('openid-credential-offer://?credential_offer={}')

    expect(readNdefPayloadUri({
      ndefMessage: [{ tnf: 1, type: [84], payload: [0x02, 0x65, 0x6e] }],
    })).toBe('openid-credential-offer://?credential_offer={}')
  })

  it('rejects records without supported payloads', () => {
    expect(() => readNdefPayloadUri({ ndefMessage: [] })).toThrow(NfcUnsupportedTagError)
  })

  it('starts NFC only once after support is confirmed', async () => {
    await initNfc()
    await initNfc()

    expect(nfcManagerMock.isSupported).toHaveBeenCalledTimes(1)
    expect(nfcManagerMock.start).toHaveBeenCalledTimes(1)
  })

  it('surfaces unsupported devices during init', async () => {
    nfcManagerMock.isSupported.mockResolvedValue(false)

    await expect(initNfc()).rejects.toThrow(NfcUnsupportedError)
  })

  it('reads a single credential-offer NFC payload', async () => {
    uriDecodeMock.mockReturnValue('openid-credential-offer://?credential_offer={}')
    nfcManagerMock.getTag.mockResolvedValue({
      ndefMessage: [{ tnf: 1, type: [85], payload: [0x01] }],
    })

    const promise = readSingleNfcPayload()
    jest.advanceTimersByTime(0)
    await expect(promise).resolves.toEqual({
      kind: 'credential-offer',
      uri: 'openid-credential-offer://?credential_offer={}',
    })

    expect(nfcManagerMock.requestTechnology).toHaveBeenCalledWith(NfcTech.Ndef)
    expect(nfcManagerMock.cancelTechnologyRequest).toHaveBeenCalled()
  })

  it('fails when NFC is disabled before reading', async () => {
    nfcManagerMock.isEnabled.mockResolvedValue(false)

    await expect(readSingleNfcPayload()).rejects.toThrow(NfcDisabledError)
    expect(nfcManagerMock.requestTechnology).not.toHaveBeenCalled()
  })

  it('maps user cancellation to a normal exit error', async () => {
    nfcManagerMock.requestTechnology.mockRejectedValue(new NfcError.UserCancel('cancelled'))

    const promise = readSingleNfcPayload()
    jest.advanceTimersByTime(0)
    await expect(promise).rejects.toThrow(NfcReadCancelledError)
    expect(nfcManagerMock.cancelTechnologyRequest).toHaveBeenCalled()
  })

  it('ignores records with unsupported type codes', () => {
    uriDecodeMock.mockReturnValue('openid4vp://?response_type=vp_token')
    textDecodeMock.mockReturnValue('openid-credential-offer://?credential_offer={}')

    expect(() => readNdefPayloadUri({
      ndefMessage: [{ tnf: 1, type: [0x00], payload: [0x01] }],
    })).toThrow(NfcUnsupportedTagError)

    expect(uriDecodeMock).not.toHaveBeenCalled()
    expect(textDecodeMock).not.toHaveBeenCalled()
  })

  it('cancelNfcRead calls cancelTechnologyRequest', async () => {
    await cancelNfcRead()
    expect(nfcManagerMock.cancelTechnologyRequest).toHaveBeenCalled()
  })

  it('cancelNfcRead swallows errors gracefully', async () => {
    nfcManagerMock.cancelTechnologyRequest.mockRejectedValue(new Error('no session'))
    await expect(cancelNfcRead()).resolves.toBeUndefined()
  })

  it('times out after 30 seconds and throws NfcReadCancelledError', async () => {
    nfcManagerMock.requestTechnology.mockReturnValue(new Promise(() => {}))

    const promise = readSingleNfcPayload()
    // Flush microtask queue so initNfc/isEnabled/requestTechnology awaits resolve
    // before we advance the fake timer to trigger the timeout
    for (let i = 0; i < 10; i++) await Promise.resolve()
    jest.advanceTimersByTime(30_000)
    await expect(promise).rejects.toThrow(NfcReadCancelledError)
  })
})
