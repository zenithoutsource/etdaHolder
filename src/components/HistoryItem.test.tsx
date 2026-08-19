import { render, screen } from '@testing-library/react-native'

import { HistoryItem } from './HistoryItem'
import type { WalletHistoryRow } from '../services/history/walletHistory'

const baseItem: WalletHistoryRow = {
  id: 'history-1',
  credentialId: 'credential-1',
  title: 'Credential received',
  subtitle: 'Received from issuer',
  partyName: 'Issuer',
  documentType: 'Thai National ID',
  actionLabel: 'Received',
  occurredAt: '2026-07-17T00:00:00.000Z',
  status: 'completed',
  kind: 'credential-received',
  channel: 'oid4vci',
  disclosedClaims: [],
  channelCaption: 'Issuer',
  infoBoxLabel: 'Document',
  infoBoxValue: 'Thai National ID',
  partyRoleLabel: 'Issuer',
  showSuspendAccessButton: false,
}

function renderHistoryItem(documentType: string, credentialType?: string) {
  return render(
    <HistoryItem
      item={{ ...baseItem, documentType, credentialType }}
      onPress={() => undefined}
    />,
  )
}

describe('HistoryItem issuer logos', () => {
  test.each([
    ['บัตรประชาชน', 'ThaiNationalID', require('../../assets/images/thaid.png')],
    ['ใบอนุญาตขับขี่', 'DLTDrivingLicence', require('../../assets/images/dltt.png')],
    [
      'ใบแสดงผลการเรียน',
      'ChulalongkornUniversityTranscript',
      require('../../assets/images/chulalongkorn.png'),
    ],
  ])('renders the agency logo for %s', (documentType, credentialType, asset) => {
    renderHistoryItem(documentType, credentialType)

    expect(screen.getByTestId('history-item-issuer-logo').props.source).toEqual(asset)
  })

  test('infers ThaID logo from the Thai document label when credentialType is omitted', () => {
    renderHistoryItem('บัตรประชาชน')

    expect(screen.getByTestId('history-item-issuer-logo').props.source).toEqual(
      require('../../assets/images/thaid.png'),
    )
  })

  test('keeps the generic icon for an unknown document type', () => {
    renderHistoryItem('Unknown Document')

    expect(screen.queryByTestId('history-item-issuer-logo')).toBeNull()
    expect(screen.getByTestId('history-item-issuer-icon')).toBeTruthy()
  })
})
