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

function renderHistoryItem(documentType: string) {
  return render(
    <HistoryItem
      item={{ ...baseItem, documentType }}
      onPress={() => undefined}
    />,
  )
}

describe('HistoryItem issuer logos', () => {
  test.each([
    ['Thai National ID', require('../../assets/images/thaid.png')],
    ['Driving Licence', require('../../assets/images/dltt.png')],
    ['Academic Transcript', require('../../assets/images/chulalongkorn.png')],
  ])('renders the configured logo for %s', (documentType, asset) => {
    renderHistoryItem(documentType)

    expect(screen.getByTestId('history-item-issuer-logo').props.source).toEqual(asset)
  })

  test('keeps the generic icon for an unknown document type', () => {
    renderHistoryItem('Unknown Document')

    expect(screen.queryByTestId('history-item-issuer-logo')).toBeNull()
    expect(screen.getByTestId('history-item-issuer-icon')).toBeTruthy()
  })
})
