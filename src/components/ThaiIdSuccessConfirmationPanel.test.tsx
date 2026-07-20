import { fireEvent, render, screen } from '@testing-library/react-native'
import { Image } from 'react-native'

import { ThaiIdSuccessConfirmationPanel } from './ThaiIdSuccessConfirmationPanel'

const ReactNativeImage = Image as unknown as { resolveAssetSource: (source: unknown) => unknown }
const record = { id: 'id-card-1', type: 'ThaiNationalID', issuedAt: '2026-06-09T00:00:00.000Z', rawVc: 'vc', claims: {} }

describe('ThaiIdSuccessConfirmationPanel', () => {
  test('renders schema-driven confirmation content and confirms the phase transition', () => {
    const onConfirm = jest.fn()
    const dopaSource = ReactNativeImage.resolveAssetSource(require('../../assets/images/dopa.png'))

    render(<ThaiIdSuccessConfirmationPanel record={record} onConfirm={onConfirm} />)

    expect(ReactNativeImage.resolveAssetSource(screen.getByTestId('thai-id-confirmation-image').props.source)).toEqual(dopaSource)
    expect(screen.getByTestId('thai-id-confirmation-badge')).toBeTruthy()
    expect(screen.getByText('กรมการปกครอง')).toBeTruthy()
    expect(screen.getByText(/บัตรประชาชน/)).toBeTruthy()
    fireEvent.press(screen.getByText('ยืนยัน'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
