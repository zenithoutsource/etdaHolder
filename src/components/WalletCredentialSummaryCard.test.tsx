import { render, screen } from '@testing-library/react-native'

import { WalletEmptyCredentialCard } from './WalletCredentialSummaryCard'

describe('WalletCredentialSummaryCard', () => {
  test('renders the empty credential state', () => {
    render(<WalletEmptyCredentialCard message="No documents" />)

    expect(screen.getByText('No documents')).toBeTruthy()
  })
})
