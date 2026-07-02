import { fireEvent, render, screen } from '@testing-library/react-native'

import { ScanCaptureSurface } from './ScanCaptureSurface'

jest.mock('expo-camera', () => ({
  CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (event: { data: string }) => void }) => {
    const { Pressable, Text } = jest.requireActual('react-native')
    return (
      <Pressable testID="mock-camera" onPress={() => onBarcodeScanned?.({ data: 'openid4vp://request' })}>
        <Text>Camera</Text>
      </Pressable>
    )
  },
}))

describe('ScanCaptureSurface', () => {
  test('routes barcode scans and NFC presses through props', () => {
    const onBarcode = jest.fn()
    const onNfcPress = jest.fn()

    render(
      <ScanCaptureSurface
        isLoading={false}
        loadingLabel="Scan QR code"
        onBarcode={onBarcode}
        onNfcPress={onNfcPress}
        onCancel={jest.fn()}
      />,
    )

    fireEvent.press(screen.getByTestId('mock-camera'))
    fireEvent.press(screen.getByText('Use NFC'))

    expect(onBarcode).toHaveBeenCalledWith('openid4vp://request')
    expect(onNfcPress).toHaveBeenCalledTimes(1)
  })
})
