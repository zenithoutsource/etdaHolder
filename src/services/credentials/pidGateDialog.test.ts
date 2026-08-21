import {
  buildPidGateDialogOptions,
  shouldShowHomePidGateDialog,
  showPidGateDialog,
} from './pidGateDialog'
import { WALLET_HOME_COPY } from './walletHomeCopy'

describe('pidGateDialog', () => {
  test('shows cancel only when PID renewal is required', () => {
    const options = buildPidGateDialogOptions('renewal-required', jest.fn())

    expect(options.title).toBe(WALLET_HOME_COPY.renewThaIdRequiredTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.renewThaIdRequiredMessage)
    expect(options.icon).toBeUndefined()
    expect(options.actions).toEqual([
      { label: WALLET_HOME_COPY.cancel, variant: 'secondary' },
    ])
  })

  test('offers PID request when PID is missing', () => {
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

  test('offers PID request when PID is issuer-suspended or holder-revoked', () => {
    const onRequestThaId = jest.fn()
    const options = buildPidGateDialogOptions('suspended', onRequestThaId, 'present')

    expect(options.title).toBe(WALLET_HOME_COPY.pidSuspendedTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.pidSuspendedToPresentMessage)
    expect(options.actions?.[1]).toEqual({
      label: WALLET_HOME_COPY.requestThaId,
      onPress: onRequestThaId,
    })
  })

  test('offers PID request when PID is calendar-expired', () => {
    const onRequestThaId = jest.fn()
    const options = buildPidGateDialogOptions('document-expired', onRequestThaId, 'present')

    expect(options.title).toBe(WALLET_HOME_COPY.pidExpiredTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.pidExpiredToPresentMessage)
    expect(options.actions?.[1]).toEqual({
      label: WALLET_HOME_COPY.requestThaId,
      onPress: onRequestThaId,
    })
  })

  test('uses present-specific copy when blocking a presentation without PID', () => {
    const options = buildPidGateDialogOptions('missing', jest.fn(), 'present')

    expect(options.title).toBe(WALLET_HOME_COPY.pidRequiredTitle)
    expect(options.message).toBe(WALLET_HOME_COPY.pidRequiredToPresentMessage)
  })

  test('showPidGateDialog no-ops when gate is already ready', () => {
    const showDialog = jest.fn()

    expect(() => {
      showPidGateDialog(showDialog, 'ready', jest.fn())
    }).not.toThrow()
    expect(showDialog).not.toHaveBeenCalled()
  })

  test('home PID gate dialog only for typed non-PID rows that are blocked', () => {
    expect(shouldShowHomePidGateDialog(undefined, 'ready')).toBe(false)
    expect(shouldShowHomePidGateDialog(undefined, 'missing')).toBe(false)
    expect(shouldShowHomePidGateDialog('ThaiNationalID', 'missing')).toBe(false)
    expect(shouldShowHomePidGateDialog('DLTDrivingLicence', 'ready')).toBe(false)
    expect(shouldShowHomePidGateDialog('DLTDrivingLicence', 'missing')).toBe(true)
    expect(shouldShowHomePidGateDialog('DLTDrivingLicence', 'suspended')).toBe(true)
    expect(shouldShowHomePidGateDialog('DLTDrivingLicence', 'document-expired')).toBe(true)
    expect(
      shouldShowHomePidGateDialog('ChulalongkornUniversityTranscript', 'renewal-required'),
    ).toBe(true)
    expect(shouldShowHomePidGateDialog('DLTDrivingLicence', 'renewal-required')).toBe(true)
  })
})
