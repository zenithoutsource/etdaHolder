import { Openid4vciVersion, type IssuerMetadataResult } from '@openid4vc/openid4vci'

import type { CredentialConfigurationSupportedV1_0_15 } from '../walletVciTypes'
import { findCredentialConfigurationViaOid4vc } from './matchCredentialConfigurationViaOid4vc'

const ISSUER = 'https://issuer.example.com'

function makeIssuerMetadataResult(
  credentialConfigurationsSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
): IssuerMetadataResult {
  return {
    originalDraftVersion: Openid4vciVersion.V1,
    credentialIssuer: {
      credential_issuer: ISSUER,
      credential_endpoint: `${ISSUER}/credential`,
      credential_configurations_supported: credentialConfigurationsSupported,
    },
    authorizationServers: [],
    knownCredentialConfigurations: credentialConfigurationsSupported as IssuerMetadataResult['knownCredentialConfigurations'],
  }
}

function match(
  offeredId: string,
  credentialConfigurationsSupported: Record<string, CredentialConfigurationSupportedV1_0_15>,
) {
  const issuerMetadataResult = makeIssuerMetadataResult(credentialConfigurationsSupported)
  return findCredentialConfigurationViaOid4vc({
    offeredId,
    issuerMetadataResult,
    walletSupported: credentialConfigurationsSupported,
  })
}

test('findCredentialConfigurationViaOid4vc resolves direct configuration id', () => {
  expect(
    match('ThaiNationalID', {
      ThaiNationalID: {
        format: 'dc+sd-jwt',
        vct: 'https://issuer.example.com/vct/ThaiNationalID',
      },
    }),
  ).toEqual({
    id: 'ThaiNationalID',
    rawConfiguration: {
      format: 'dc+sd-jwt',
      vct: 'https://issuer.example.com/vct/ThaiNationalID',
    },
  })
})

test('findCredentialConfigurationViaOid4vc defers IdCard alias matching to wallet fallback', () => {
  expect(
    match('IdCard_dc+sd-jwt', {
      idcard: {
        format: 'dc+sd-jwt',
        vct: 'https://issuer.example.com/vct/idcard',
      },
    }),
  ).toBeUndefined()
})

test('findCredentialConfigurationViaOid4vc resolves mso_mdoc doctype offer via lib format match', () => {
  expect(
    match('org.iso.18013.5.1.mDL', {
      'org.iso.18013.5.1.mDL': {
        format: 'mso_mdoc',
        doctype: 'org.iso.18013.5.1.mDL',
      },
    }),
  ).toEqual({
    id: 'org.iso.18013.5.1.mDL',
    rawConfiguration: {
      format: 'mso_mdoc',
      doctype: 'org.iso.18013.5.1.mDL',
    },
  })
})

test('findCredentialConfigurationViaOid4vc maps dc+sd-jwt offer to vc+sd-jwt metadata via lib cross-format match', () => {
  expect(
    match('Iso18013DriversLicenseCredential_dc+sd-jwt', {
      'Iso18013DriversLicenseCredential_vc+sd-jwt': {
        format: 'vc+sd-jwt',
        vct: 'https://issuer.example.com/vct/Iso18013DriversLicenseCredential',
      },
    }),
  ).toEqual({
    id: 'Iso18013DriversLicenseCredential_vc+sd-jwt',
    rawConfiguration: {
      format: 'vc+sd-jwt',
      vct: 'https://issuer.example.com/vct/Iso18013DriversLicenseCredential',
    },
  })
})

test('findCredentialConfigurationViaOid4vc returns undefined when lib cannot disambiguate', () => {
  expect(
    match('org.iso.18013.5.1.mDL', {
      Iso18013DriversLicenseCredential_mso_mdoc: {
        format: 'mso_mdoc',
        types: ['VerifiableCredential', 'Iso18013DriversLicenseCredential'],
      },
      TranscriptCredential_mso_mdoc: {
        format: 'mso_mdoc',
        types: ['VerifiableCredential', 'TranscriptCredential'],
      },
    }),
  ).toBeUndefined()
})
