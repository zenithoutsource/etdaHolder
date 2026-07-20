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
  test('routes barcode scans through props and does not render NFC', () => {
    const onBarcode = jest.fn()

    render(
      <ScanCaptureSurface
        isLoading={false}
        loadingLabel="Scan QR code"
        onBarcode={onBarcode}
        onCancel={jest.fn()}
      />,
    )

    fireEvent.press(screen.getByTestId('mock-camera'))

    expect(onBarcode).toHaveBeenCalledWith('openid4vp://request')
    expect(screen.queryByText('Use NFC')).toBeNull()
  })
})
