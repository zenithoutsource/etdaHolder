import { render, screen } from '@testing-library/react-native'

import { ScanSuccessPanel } from './ScanSuccessPanel'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

const record: VerifiableCredentialRecord = {
  id: 'credential-1',
  type: 'BangkokUniversityTranscript',
  issuedAt: '2026-06-09T00:00:00.000Z',
  rawVc: 'vc',
  claims: {
    givenName: 'Pitchaya',
    familyName: 'Rungruangkit',
    studentId: 'BU-1001',
  },
}

describe('ScanSuccessPanel', () => {
  test('shows the post-confirm scan success document summary', () => {
    render(<ScanSuccessPanel record={record} />)

    expect(screen.getByTestId('scan-success-check')).toBeTruthy()
    expect(screen.getByText('รับเอกสารสำเร็จ')).toBeTruthy()
    expect(screen.getByText(/เอกสาร :/)).toBeTruthy()
    expect(screen.getByText(/หน่วยงานที่รับรอง :/)).toBeTruthy()
    expect(screen.getByText(/Academic Transcript/)).toBeTruthy()
    expect(screen.getByText(/Bangkok University/)).toBeTruthy()
  })
})
