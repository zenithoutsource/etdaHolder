import {
  findDualFormatGroup,
  groupDualFormatConfigurations,
  isDualFormatOffer,
} from './logicalCredentialGrouping'
import type { OfferedCredentialConfiguration } from '../vci/exchangeService'

function makeConfiguration(
  id: string,
  format: string,
  extras: Record<string, unknown> = {},
): OfferedCredentialConfiguration {
  return {
    id,
    requestId: id,
    format,
    rawConfiguration: { format, ...extras } as OfferedCredentialConfiguration['rawConfiguration'],
  }
}

test('groups transcript dual-format configurations by family prefix', () => {
  const configurations = [
    makeConfiguration('TranscriptCredential_dc+sd-jwt', 'dc+sd-jwt'),
    makeConfiguration('TranscriptCredential_mso_mdoc', 'mso_mdoc'),
  ]

  const group = findDualFormatGroup(configurations)
  expect(group?.sdJwt?.configurationId).toBe('TranscriptCredential_dc+sd-jwt')
  expect(group?.mdoc?.configurationId).toBe('TranscriptCredential_mso_mdoc')
  expect(isDualFormatOffer(configurations)).toBe(true)
})

test('groups ISO mDL doctype offer id with Iso18013DriversLicenseCredential SD-JWT via requestId family', () => {
  const configurations = [
    {
      id: 'org.iso.18013.5.1.mDL',
      requestId: 'Iso18013DriversLicenseCredential_mso_mdoc',
      format: 'mso_mdoc',
      rawConfiguration: {
        format: 'mso_mdoc',
        doctype: 'org.iso.18013.5.1.mDL',
      } as unknown as OfferedCredentialConfiguration['rawConfiguration'],
    },
    {
      id: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
      requestId: 'Iso18013DriversLicenseCredential_vc+sd-jwt',
      format: 'vc+sd-jwt',
      rawConfiguration: {
        format: 'vc+sd-jwt',
        types: ['Iso18013DriversLicenseCredential'],
      } as unknown as OfferedCredentialConfiguration['rawConfiguration'],
    },
  ]

  const group = findDualFormatGroup(configurations)
  expect(group?.mdoc?.configurationId).toBe('org.iso.18013.5.1.mDL')
  expect(group?.sdJwt?.configurationId).toBe('Iso18013DriversLicenseCredential_dc+sd-jwt')
  expect(isDualFormatOffer(configurations)).toBe(true)
})

test('groups direct Iso18013 metadata keys (mDL doctype + dc+sd-jwt) as dual-format', () => {
  const configurations = [
    {
      id: 'org.iso.18013.5.1.mDL',
      requestId: 'org.iso.18013.5.1.mDL',
      format: 'mso_mdoc',
      rawConfiguration: {
        format: 'mso_mdoc',
        doctype: 'org.iso.18013.5.1.mDL',
      } as unknown as OfferedCredentialConfiguration['rawConfiguration'],
    },
    {
      id: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
      requestId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
      format: 'dc+sd-jwt',
      rawConfiguration: {
        format: 'dc+sd-jwt',
        types: ['VerifiableCredential', 'VerifiableAttestation', 'Iso18013DriversLicenseCredential'],
      } as unknown as OfferedCredentialConfiguration['rawConfiguration'],
    },
  ]

  const group = findDualFormatGroup(configurations)
  expect(group?.mdoc?.configurationId).toBe('org.iso.18013.5.1.mDL')
  expect(group?.mdoc?.requestId).toBe('org.iso.18013.5.1.mDL')
  expect(group?.sdJwt?.configurationId).toBe('Iso18013DriversLicenseCredential_dc+sd-jwt')
  expect(group?.sdJwt?.requestId).toBe('Iso18013DriversLicenseCredential_dc+sd-jwt')
  expect(isDualFormatOffer(configurations)).toBe(true)
})

test('issuer logical_credential_id wins over naming convention', () => {
  const configurations = [
    makeConfiguration('TranscriptCredential_dc+sd-jwt', 'dc+sd-jwt', { logical_credential_id: 'transcript-42' }),
    makeConfiguration('TranscriptCredential_mso_mdoc', 'mso_mdoc', { logical_credential_id: 'transcript-42' }),
  ]

  const groups = groupDualFormatConfigurations(configurations)
  expect(groups[0]?.logicalCredentialIdHint).toBe('transcript-42')
})
