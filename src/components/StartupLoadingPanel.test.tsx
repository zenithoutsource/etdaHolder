import { render, screen } from '@testing-library/react-native'
import { Image } from 'react-native'

import { StartupLoadingPanel } from './StartupLoadingPanel'

const ReactNativeImage = Image as unknown as {
  resolveAssetSource: (source: unknown) => { uri?: string }
}

describe('StartupLoadingPanel', () => {
  test('shows the app logo and loading bar without starting-wallet copy', () => {
    const logoSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/icon.png'))

    render(<StartupLoadingPanel status="loading" />)

    expect(screen.getByTestId('startup-loading-panel')).toBeTruthy()
    expect(screen.getByTestId('startup-loading-bar')).toBeTruthy()
    expect(screen.getByLabelText('Document Wallet')).toBeTruthy()
    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('startup-loading-logo').props.source)).toEqual(
      logoSource,
    )
    expect(screen.queryByText('Starting wallet...')).toBeNull()
  })

  test('shows the failure title and message without the loading bar', () => {
    render(
      <StartupLoadingPanel status="error" message="ไม่สามารถเปิดพื้นที่จัดเก็บข้อมูลได้ กรุณาลองใหม่อีกครั้ง" />,
    )

    expect(screen.getByTestId('startup-loading-logo')).toBeTruthy()
    expect(screen.getByText('Wallet startup failed')).toBeTruthy()
    expect(screen.getByText('ไม่สามารถเปิดพื้นที่จัดเก็บข้อมูลได้ กรุณาลองใหม่อีกครั้ง')).toBeTruthy()
    expect(screen.queryByTestId('startup-loading-bar')).toBeNull()
  })
})
