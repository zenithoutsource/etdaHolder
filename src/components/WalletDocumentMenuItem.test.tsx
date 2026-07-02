import { fireEvent, render, screen } from '@testing-library/react-native'

import { WalletDocumentMenuItem } from './WalletDocumentMenuItem'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')

describe('WalletDocumentMenuItem', () => {
  const icon = { uri: 'credential-icon' }

  test('renders the request state with badge and handles press', () => {
    const onPress = jest.fn()

    render(
      <WalletDocumentMenuItem
        label="ID Card"
        icon={icon}
        iconStyle={{ width: 40, height: 40 }}
        hasCredential={false}
        isExpanded={false}
        badge={{ label: 'New', className: 'bg-green-600' }}
        requestLabel="Request"
        onPress={onPress}
      />,
    )

    expect(screen.getByText('ID Card')).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
    fireEvent.press(screen.getByText('Request'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  test('renders expanded inactive actions', () => {
    const onViewOldCredential = jest.fn()
    const onRenewalRequest = jest.fn()

    render(
      <WalletDocumentMenuItem
        label="ID Card"
        icon={icon}
        iconStyle={{ width: 40, height: 40 }}
        hasCredential
        isExpanded
        requestLabel="Request"
        onPress={jest.fn()}
        oldCredentialLabel="View old"
        onViewOldCredential={onViewOldCredential}
        inactivePanelMessage="Renewal required"
        showRenewalCta
        renewalCtaLabel="Request"
        onRenewalRequest={onRenewalRequest}
      />,
    )

    fireEvent.press(screen.getByText('View old'))
    fireEvent.press(screen.getByText('Request'))

    expect(screen.getByText('Renewal required')).toBeTruthy()
    expect(onViewOldCredential).toHaveBeenCalledTimes(1)
    expect(onRenewalRequest).toHaveBeenCalledTimes(1)
  })
})
