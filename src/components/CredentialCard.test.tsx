import { render, screen } from '@testing-library/react-native'

import { CredentialCard } from './CredentialCard'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'vc-001',
  type: 'ThaiNationalID',
  rawVc: 'signed.jwt',
  claims: {
    givenName: 'Somchai',
    familyName: 'Jaidee',
    birthDate: '1990-01-15',
    nationalId: '1234567890123',
  },
  issuedAt: '2025-01-01T00:00:00.000Z',
}

const unknownRecord: VerifiableCredentialRecord = {
  id: 'vc-999',
  type: 'SomeUnknownCredential',
  rawVc: 'signed.jwt',
  claims: {},
  issuedAt: '2025-01-01T00:00:00.000Z',
}

describe('CredentialCard', () => {
  test('renders title from schema', () => {
    render(<CredentialCard record={thaiIdRecord} />)
    expect(screen.getByTestId('credential-card-title')).toHaveTextContent('Thai National ID')
  })

  test('renders issuerName from schema', () => {
    render(<CredentialCard record={thaiIdRecord} />)
    expect(screen.getByTestId('credential-card-issuer')).toHaveTextContent(
      'Department of Provincial Administration'
    )
  })

  test('renders claim fields present in record', () => {
    render(<CredentialCard record={thaiIdRecord} />)
    expect(screen.getByTestId('credential-field-givenName')).toBeTruthy()
    expect(screen.getByTestId('credential-field-familyName')).toBeTruthy()
    expect(screen.getByTestId('credential-field-nationalId')).toBeTruthy()
  })

  test('omits fields with missing claim values', () => {
    const partialRecord: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      claims: { givenName: 'Somchai' },
    }
    render(<CredentialCard record={partialRecord} />)
    expect(screen.getByTestId('credential-field-givenName')).toBeTruthy()
    expect(screen.queryByTestId('credential-field-familyName')).toBeNull()
    expect(screen.queryByTestId('credential-field-nationalId')).toBeNull()
  })

  test('renders fallback title for unknown credential type', () => {
    render(<CredentialCard record={unknownRecord} />)
    expect(screen.getByTestId('credential-card-title')).toHaveTextContent('Credential')
    expect(screen.getByTestId('credential-card-issuer')).toHaveTextContent('Unknown Issuer')
  })

  test('renders no fields for unknown type with empty claims', () => {
    render(<CredentialCard record={unknownRecord} />)
    expect(screen.queryByTestId(/^credential-field-/)).toBeNull()
  })

  test('card container is present', () => {
    render(<CredentialCard record={thaiIdRecord} />)
    expect(screen.getByTestId('credential-card')).toBeTruthy()
  })
})
