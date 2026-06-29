import { buildPidGateDialogOptions } from './pidGateDialog'
import { WALLET_HOME_COPY } from './walletHomeCopy'

describe('pidGateDialog', () => {
  test('shows cancel only when ThaID renewal is required', () => {
    const options = buildPidGateDialogOptions('renewal-required', jest.fn())

    expect(options.title).toBe(WALLET_HOME_COPY.renewThaIdRequiredTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.renewThaIdRequiredMessage)
    expect(options.icon).toBeUndefined()
    expect(options.actions).toEqual([
      { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
    ])
  })

  test('offers ThaID request when PID is missing', () => {
    const onRequestThaId = jest.fn()
    const options = buildPidGateDialogOptions('missing', onRequestThaId)

    expect(options.title).toBe(WALLET_HOME_COPY.pidRequiredTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.pidRequiredMessage)
    expect(options.icon).toBeUndefined()
    expect(options.actions?.[1]).toEqual({
      label: WALLET_HOME_COPY.requestThaId,
      onPress: onRequestThaId,
    })
  })
})
