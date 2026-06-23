import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { initNfc } from './nfcTagService'
import { prewarmNfc } from './nfcStartup'

jest.mock('../debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('./nfcTagService', () => ({
  initNfc: jest.fn(),
}))

const initNfcMock = initNfc as jest.MockedFunction<typeof initNfc>
const logWalletErrorMock = logWalletError as jest.MockedFunction<typeof logWalletError>
const logWalletStepMock = logWalletStep as jest.MockedFunction<typeof logWalletStep>

describe('prewarmNfc', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    initNfcMock.mockResolvedValue()
  })

  it('skips NFC prewarm on web', async () => {
    await prewarmNfc('web')

    expect(initNfcMock).not.toHaveBeenCalled()
  })

  it('initializes NFC on native platforms', async () => {
    await prewarmNfc('android')

    expect(initNfcMock).toHaveBeenCalledTimes(1)
    expect(logWalletStepMock).toHaveBeenCalledWith('startup', 'nfc-prewarm-start', { platform: 'android' })
    expect(logWalletStepMock).toHaveBeenCalledWith('startup', 'nfc-prewarm-complete', { platform: 'android' })
  })

  it('logs native NFC prewarm errors without throwing', async () => {
    const error = new Error('NFC not supported on this device')
    initNfcMock.mockRejectedValue(error)

    await expect(prewarmNfc('android')).resolves.toBeUndefined()
    expect(logWalletErrorMock).toHaveBeenCalledWith('startup', 'nfc-prewarm-failed', error, { platform: 'android' })
  })
})
