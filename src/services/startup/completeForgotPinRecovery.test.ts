import { completeForgotPinRecovery } from './completeForgotPinRecovery'

describe('completeForgotPinRecovery', () => {
  test('logs out and returns to auth without wiping credential storage', async () => {
    const logout = jest.fn(async () => undefined)
    const markStartupReady = jest.fn()
    const replaceAuth = jest.fn()
    const resetStorage = jest.fn(async () => undefined)

    await completeForgotPinRecovery({ logout, markStartupReady, replaceAuth })

    expect(logout).toHaveBeenCalledTimes(1)
    expect(markStartupReady).toHaveBeenCalledTimes(1)
    expect(replaceAuth).toHaveBeenCalledTimes(1)
    expect(resetStorage).not.toHaveBeenCalled()
  })
})
