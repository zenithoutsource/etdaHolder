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

test('issuer logical_credential_id wins over naming convention', () => {
  const configurations = [
    makeConfiguration('TranscriptCredential_dc+sd-jwt', 'dc+sd-jwt', { logical_credential_id: 'transcript-42' }),
    makeConfiguration('TranscriptCredential_mso_mdoc', 'mso_mdoc', { logical_credential_id: 'transcript-42' }),
  ]

  const groups = groupDualFormatConfigurations(configurations)
  expect(groups[0]?.logicalCredentialIdHint).toBe('transcript-42')
})
