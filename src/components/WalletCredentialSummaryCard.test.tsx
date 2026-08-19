import { render, screen } from '@testing-library/react-native'

import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'
import { WalletCredentialSummaryCard, WalletEmptyCredentialCard } from './WalletCredentialSummaryCard'

const drivingLicenceRecord: VerifiableCredentialRecord = {
  id: 'licence-1',
  type: 'DLTDrivingLicence',
  rawVc: 'header.payload.signature',
  claims: {
    givenName: 'สมชาย',
    familyName: 'ใจดี',
    licenceNumber: '54002891',
  },
  issuedAt: '2024-01-20T00:00:00.000Z',
}

describe('WalletCredentialSummaryCard', () => {
  test('renders driving-licence holder name and licence number', () => {
    render(<WalletCredentialSummaryCard record={drivingLicenceRecord} />)

    expect(screen.getByText('สมชาย ใจดี')).toBeTruthy()
    expect(screen.getByText('Licence No. : 54002891')).toBeTruthy()
  })

  test('renders the empty credential state', () => {
    render(<WalletEmptyCredentialCard message="No documents" />)

    expect(screen.getByText('No documents')).toBeTruthy()
  })

  test('shows the inactive status pill without the grey ribbon when ThaiNationalID is withdrawn', () => {
    const thaiIdRecord: VerifiableCredentialRecord = {
      id: 'id-card-1',
      type: 'ThaiNationalID',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'สมชาย',
        familyName: 'ใจดี',
        nationalId: '1-2345-67890-12-3',
      },
      issuedAt: '2024-01-20T00:00:00.000Z',
    }

    render(
      <WalletCredentialSummaryCard
        record={thaiIdRecord}
        inactiveState={{
          kind: 'issuer-suspended',
          badgeLabel: 'ถูกระงับ',
          badgeClassName: 'bg-danger',
          panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
        }}
      />,
    )

    expect(screen.queryByTestId('credential-renewal-rosette-inactive')).toBeNull()
    expect(screen.getByText('ถูกระงับ')).toBeTruthy()
  })
})
