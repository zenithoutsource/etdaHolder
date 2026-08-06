import {
  claimCredentialWithDualFormatSupport,
  isDualFormatOffer,
} from '../credentials/dualFormatIssuance'
import {
  claimCredential as defaultClaimCredential,
  type ClaimCredentialOptions,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from './exchangeService'
import { getCardSchema, type DisplayField, type CardSchemaConfig } from '../../config/cardSchemas'
import { isHiddenClaimKey, readClaimText, stringifyClaim } from '../credentials/claimFormatting'
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
  const credentialName = configuration?.display?.name ?? readFriendlyCredentialName(configuration?.id)
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
  if (isDualFormatOffer(offer.credentialConfigurations)) {
    const result = await claimCredentialWithDualFormatSupport(offer, { tx_code })
    return result
  }

  return claimCredential(offer, { tx_code })
}

export function readCredentialInformationRows(
  record: VerifiableCredentialRecord,
  displayFields: DisplayField[],
): CredentialInformationRow[] {
  const configuredRows = displayFields
    .map((field) => {
      const value = readClaimText(record.claims, [field.key, ...(field.aliases ?? [])])
      return value ? { key: field.key, label: field.label, value } : undefined
    })
    .filter((row): row is CredentialInformationRow => Boolean(row))

  if (configuredRows.length > 0) return configuredRows

  return Object.entries(record.claims)
    .filter(([key, value]) => !key.startsWith('_') && !isHiddenClaimKey(key) && stringifyClaim(value).trim().length > 0)
    .map(([key, value]) => ({ key, label: key, value: stringifyClaim(value) }))
}

export function readCredentialPreviewDisplay(record: VerifiableCredentialRecord): CredentialPreviewDisplay {
  const schema = getCardSchema(record.type)

  return {
    documentTitle: schema.documentTitle,
    imageKey: schema.imageKey,
    rows: readCredentialInformationRows(record, schema.displayFields),
  }
}

function readFriendlyCredentialName(configurationId?: string): string {
  if (!configurationId) return 'Digital Document'

  const normalized = configurationId.toLowerCase()
  if (normalized.includes('transcript')) return 'Academic Transcript'
  if (normalized.includes('driving') || normalized.includes('licence') || normalized.includes('license')) return 'Driving Licence'
  if (normalized.includes('thai') || normalized.includes('national') || normalized.includes('idcard') || normalized.includes('id_card')) {
    return 'Thai National ID'
  }

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

function readClaimDisplayName(value: unknown): string | undefined {
  const display = readRecord(value)?.display
  if (!Array.isArray(display)) return undefined

  for (const item of display) {
    const name = readRecord(item)?.name
    if (typeof name === 'string' && name.length > 0 && !isPlaceholderDisplayName(name)) return name
  }

  return undefined
}

function isPlaceholderDisplayName(value: string): boolean {
  return value.trim().toLowerCase() === 'string'
}

