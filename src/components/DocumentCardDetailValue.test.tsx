import { render, screen } from '@testing-library/react-native'

import { DocumentCardDetailValue } from './DocumentCardDetailValue'

describe('DocumentCardDetailValue', () => {
  test('renders a compact navy value by default', () => {
    render(<DocumentCardDetailValue label="Licence No." value="54002891" />)

    expect(screen.getByText('Licence No.')).toBeTruthy()
    expect(screen.getByText('54002891')).toBeTruthy()
    expect(screen.getByText('Licence No.').props.className).toContain('text-blue-gray')
    expect(screen.getByText('54002891').props.className).toContain('text-wallet-navy')
  })

  test('marks expiry copy in danger color', () => {
    render(
      <DocumentCardDetailValue
        label="Expiry Date / วันสิ้นอายุ"
        value="20 มกราคม 2570"
        expiry
        testID="driving-licence-expiry"
        accessibilityLabel="Expiry Date: 20 มกราคม 2570"
      />,
    )

    expect(screen.getByTestId('driving-licence-expiry')).toHaveTextContent('20 มกราคม 2570')
    expect(screen.getByTestId('driving-licence-expiry').props.accessibilityLabel).toBe(
      'Expiry Date: 20 มกราคม 2570',
    )
    expect(screen.getByText('Expiry Date / วันสิ้นอายุ').props.className).toContain('text-danger')
    expect(screen.getByTestId('driving-licence-expiry').props.className).toContain('text-danger')
  })
})
