import { act, renderHook } from '@testing-library/react-native'

import { useReturnToWallet } from './useReturnToWallet'

const mockDispatch = jest.fn()
const mockGetParent = jest.fn()

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    getParent: mockGetParent,
  }),
}))

describe('useReturnToWallet', () => {
  const router = {
    dismissTo: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetParent.mockReturnValue({ dispatch: mockDispatch })
  })

  it('resets the root stack to the Wallet tab', () => {
    const { result } = renderHook(() => useReturnToWallet(router))

    act(() => {
      result.current()
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'RESET',
      payload: {
        index: 0,
        routes: [{ name: '(tabs)' }],
      },
    })
    expect(router.dismissTo).not.toHaveBeenCalled()
  })

  it('falls back to dismissTo when no parent navigator is available', () => {
    mockGetParent.mockReturnValue(null)
    const { result } = renderHook(() => useReturnToWallet(router))

    act(() => {
      result.current()
    })

    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)')
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
