import { act, renderHook } from '@testing-library/react-native'

import { useReturnToWallet } from './useReturnToWallet'

describe('useReturnToWallet', () => {
  const router = {
    dismissTo: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('replaces to the Wallet tab shell', () => {
    const { result } = renderHook(() => useReturnToWallet(router))

    act(() => {
      result.current()
    })

    expect(router.replace).toHaveBeenCalledWith('/(tabs)')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.dismissTo).not.toHaveBeenCalled()
  })

  it('falls back to navigate then dismissTo when replace throws', () => {
    router.replace.mockImplementationOnce(() => {
      throw new Error('replace unavailable')
    })
    router.navigate.mockImplementationOnce(() => {
      throw new Error('navigate unavailable')
    })
    router.replace.mockImplementationOnce(() => {
      throw new Error('replace tabs unavailable')
    })

    const { result } = renderHook(() => useReturnToWallet(router))

    act(() => {
      result.current()
    })

    expect(router.replace).toHaveBeenCalledWith('/(tabs)')
    expect(router.navigate).toHaveBeenCalledWith('/(tabs)')
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)')
  })
})
