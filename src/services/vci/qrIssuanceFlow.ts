import {
  claimCredentialWithDualFormatSupport,
  isDualFormatOffer,
} from '../credentials/dualFormatIssuance'
import {
  claimCredential as defaultClaimCredential,
  type ClaimCredentialOptions,
  readCredentialClaimMap,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from './exchangeService'
import { resolveCardSchema, type DisplayField, type CardSchemaConfig } from '../../config/cardSchemas'
import { canonicalFirstPartyType, isFirstPartyCredential, isFirstPartyIssuerOrigin } from '../../config/firstPartyCredential'
import { isHiddenClaimKey, readClaimText, stringifyClaim } from '../credentials/claimFormatting'
import { readClaimDisplayName } from '../credentials/claimDisplayMetadata'
import { readThirdPartyCredentialDisplayRows } from '../credentials/thirdPartyCredentialDisplay'
import { getCredentialKeyRecord } from '../crypto/credentialKeyRegistry'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { launchPushNotificationsInBackground } from '../notifications/pushNotificationService'
import { isRecord, readRecord } from '../../utils/jwtUtils'

export type OfferConfirmationPreview = {
  issuerName: string
  credentialName: string
  format: string
  informationItems: OfferInformationItem[]
}

export type OfferInformationItem = {
  key: string
  label: string
}

export type CredentialInformationRow = {
  key: string
  label: string
  value: string
}

export type CredentialPreviewDisplay = {
  documentTitle: string
  imageKey: CardSchemaConfig['imageKey']
  rows: CredentialInformationRow[]
}

type ClaimConfirmedOfferOptions = {
  tx_code?: string
  claimCredential?: (
    resolvedOffer: ResolvedCredentialOffer,
    options?: ClaimCredentialOptions,
  ) => Promise<VerifiableCredentialRecord>
}

export function readOfferConfirmationPreview(offer: ResolvedCredentialOffer): OfferConfirmationPreview {
  const configuration = offer.credentialConfigurations[0]
  const dualFormat = isDualFormatOffer(offer.credentialConfigurations)
  const credentialName =
    configuration?.display?.name ?? readFriendlyCredentialName(configuration?.id, offer.issuer)
  const informationItems = readInformationItems(configuration?.rawConfiguration)

  return {
    issuerName: offer.issuerDisplay?.name ?? 'Unknown Issuer',
    credentialName,
    format: dualFormat ? 'dc+sd-jwt + mso_mdoc' : (configuration?.format ?? 'Unknown format'),
    informationItems: informationItems.length > 0 ? informationItems : [{ key: 'credential', label: 'Credential to receive' }],
  }
}

export async function claimConfirmedOffer(
  offer: ResolvedCredentialOffer,
  options: ClaimConfirmedOfferOptions = {},
): Promise<VerifiableCredentialRecord> {
  const { claimCredential = defaultClaimCredential, tx_code } = options
  const record = isDualFormatOffer(offer.credentialConfigurations)
    ? await claimCredentialWithDualFormatSupport(offer, { tx_code })
    : await claimCredential(offer, { tx_code })

  const credentialKey = getCredentialKeyRecord(record.id)
  if (credentialKey?.holderDid) {
    try {
      launchPushNotificationsInBackground(credentialKey.holderDid)
      logWalletStep('oid4vci', 'push-registration-after-claim-started')
    } catch (error) {
      logWalletError('oid4vci', 'push-registration-after-claim-failed', error)
    }
  } else {
    logWalletStep('oid4vci', 'push-registration-after-claim-skipped-no-credential-did')
  }

  return record
}

export function readCredentialInformationRows(
  record: VerifiableCredentialRecord,
  displayFields: DisplayField[],
): CredentialInformationRow[] {
  const claims = readCredentialClaimMap(record)
  const configuredRows = displayFields
    .map((field) => {
      const value = readClaimText(claims, [field.key, ...(field.aliases ?? [])])
      return value ? { key: field.key, label: field.label, value } : undefined
    })
    .filter((row): row is CredentialInformationRow => Boolean(row))

  if (configuredRows.length > 0) return configuredRows

  return Object.entries(claims)
    .filter(([key, value]) => !key.startsWith('_') && !isHiddenClaimKey(key) && stringifyClaim(value).trim().length > 0)
    .map(([key, value]) => ({ key, label: key, value: stringifyClaim(value) }))
}

export function readCredentialPreviewDisplay(record: VerifiableCredentialRecord): CredentialPreviewDisplay {
  const schema = resolveCardSchema(record)
  const rows = isFirstPartyCredential(record)
    ? readCredentialInformationRows(record, schema.displayFields)
    : readThirdPartyCredentialDisplayRows(record).rows

  return {
    documentTitle: record.credentialDisplayName?.trim() || schema.documentTitle,
    imageKey: schema.imageKey,
    rows,
  }
}

function readFriendlyCredentialName(configurationId?: string, issuer?: string): string {
  if (!configurationId) return 'Digital Document'
  if (issuer && !isFirstPartyIssuerOrigin(issuer)) return 'Digital Document'
  const firstPartyType = canonicalFirstPartyType(configurationId)
  if (firstPartyType === 'ThaiNationalID') return 'Thai National ID'
  if (firstPartyType === 'DLTDrivingLicence') return 'Driving Licence'
  if (firstPartyType === 'ChulalongkornUniversityTranscript') return 'Academic Transcript'
  if (firstPartyType === 'MedicalCertificate') return 'Medical Certificate'
  return 'Digital Document'
}

function readInformationItems(rawConfiguration: unknown): OfferInformationItem[] {
  const claims = readRecord(rawConfiguration)?.claims

  if (!isRecord(claims)) return []

  return Object.entries(claims).map(([key, value]) => ({
    key,
    label: readClaimDisplayName(value) ?? key,
  }))
}

