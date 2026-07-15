import { renderHook } from '@testing-library/react-native'
import * as ScreenCapture from 'expo-screen-capture'

import { useScreenCaptureGuard } from './useScreenCaptureGuard'

const mockUseFocusEffect = jest.fn()
let focusCleanup: (() => void) | undefined

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => mockUseFocusEffect(callback),
}))

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
}))

const preventMock = ScreenCapture.preventScreenCaptureAsync as jest.Mock
const allowMock = ScreenCapture.allowScreenCaptureAsync as jest.Mock

function runFocusEffect() {
  const callback = mockUseFocusEffect.mock.calls.at(-1)?.[0] as (() => void | (() => void)) | undefined
  if (!callback) throw new Error('useFocusEffect was not called')
  focusCleanup = callback() as (() => void) | undefined
}

describe('useScreenCaptureGuard', () => {
  const originalEnv = process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD

  afterEach(() => {
    jest.clearAllMocks()
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD
    } else {
      process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD = originalEnv
    }
    focusCleanup = undefined
  })

  test('prevents capture on focus and allows on blur when guard is enabled', async () => {
    delete process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD

    renderHook(() => useScreenCaptureGuard())
    runFocusEffect()

    expect(preventMock).toHaveBeenCalledTimes(1)
    expect(allowMock).not.toHaveBeenCalled()

    focusCleanup?.()
    await Promise.resolve()

    expect(allowMock).toHaveBeenCalledTimes(1)
  })

  test('skips prevent and allow when disable env is true', () => {
    process.env.EXPO_PUBLIC_DISABLE_SCREEN_CAPTURE_GUARD = 'true'

    renderHook(() => useScreenCaptureGuard())
    runFocusEffect()
    focusCleanup?.()

    expect(preventMock).not.toHaveBeenCalled()
    expect(allowMock).not.toHaveBeenCalled()
  })
})
