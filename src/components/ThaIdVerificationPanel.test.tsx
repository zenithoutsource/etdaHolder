import { fireEvent, render, screen } from '@testing-library/react-native'
import { Image } from 'react-native'

import { ThaIdVerificationPanel } from './ThaIdVerificationPanel'

const ReactNativeImage = Image as unknown as {
  resolveAssetSource: (source: unknown) => unknown
}

describe('ThaIdVerificationPanel', () => {
  test('renders the ThaID asset and continues when confirmed', () => {
    const onContinue = jest.fn()
    const thaidSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/thaid.png'))

    render(<ThaIdVerificationPanel onContinue={onContinue} />)

    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('thaid-verification-image').props.source)).toEqual(
      thaidSource,
    )
    fireEvent.press(screen.getByText('ยืนยัน'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
