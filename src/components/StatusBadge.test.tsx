import { render, screen } from '@testing-library/react-native'

import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  test('renders a reusable pill label', () => {
    render(<StatusBadge label="Active" className="bg-green-600" />)

    expect(screen.getByText('Active')).toBeTruthy()
  })
})
