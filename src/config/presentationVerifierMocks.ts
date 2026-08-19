/**
 * Dev/demo verifier display labels until Verifiers send client_name in OID4VP requests.
 * Mapped from requested credential type (matched document), aligned with P4-P5 UI reference.
 *
 * Resolution order: protocol / config name (when not generic) → mock → ผู้ตรวจสอบ.
 */

import type { ImageSourcePropType } from 'react-native'

export type PresentationConsentHeroIcon = 'glass-cocktail' | 'car' | 'medical-bag'

export type PresentationVerifierMock = {
  /** Party name in History Log, consent, and success screen */
  verifierName: string
  /** Consent screen: ข้อมูลที่…ต้องการ (same as verifierName per grill #6) */
  consentPartyLabel: string
  /** History detail/list "ประเภทข้อมูลที่เข้าถึง" when no disclosed claims */
  accessLabel: string
}

const TRANSCRIPT_CONSENT_LOGO = require('../../assets/images/chulalongkorn-white.png') as ImageSourcePropType

const PRESENTATION_CONSENT_HERO_ICONS: Record<string, PresentationConsentHeroIcon> = {
  ThaiNationalID: 'glass-cocktail',
  DLTDrivingLicence: 'car',
  MedicalCertificate: 'medical-bag',
}

const PRESENTATION_VERIFIER_MOCKS: Record<string, PresentationVerifierMock> = {
  ThaiNationalID: {
    verifierName: 'ร้านบาร์',
    consentPartyLabel: 'ร้านบาร์',
    accessLabel: 'การตรวจสอบอายุ',
  },
  DLTDrivingLicence: {
    verifierName: 'สำนักงานตำรวจแห่งชาติ',
    consentPartyLabel: 'สำนักงานตำรวจแห่งชาติ',
    accessLabel: 'ใบขับขี่ดิจิทัล',
  },
  ChulalongkornUniversityTranscript: {
    verifierName: 'มหาวิทยาลัยจุฬาลงกรณ์',
    consentPartyLabel: 'มหาวิทยาลัยจุฬาลงกรณ์',
    accessLabel: 'ใบแสดงผลการเรียน',
  },
  MedicalCertificate: {
    verifierName: 'โรงพยาบาล',
    consentPartyLabel: 'โรงพยาบาล',
    accessLabel: 'ใบรับรองแพทย์',
  },
}

const GENERIC_VERIFIER_NAMES = new Set([
  'verifier',
  'verifier api',
  'trusted party',
  'pid issuer',
])

export function isGenericVerifierName(name?: string): boolean {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) return true
  return GENERIC_VERIFIER_NAMES.has(trimmed.toLowerCase())
}

export function readPresentationVerifierMock(
  credentialType: string,
): PresentationVerifierMock | undefined {
  return PRESENTATION_VERIFIER_MOCKS[credentialType]
}

/** Holder-facing verifier name for presentation UI and history partyName. */
export function readPresentationVerifierDisplayName(
  credentialType: string,
  protocolVerifierName?: string,
): string {
  if (!isGenericVerifierName(protocolVerifierName)) {
    return protocolVerifierName!.trim()
  }
  const mock = readPresentationVerifierMock(credentialType)
  if (mock) return mock.verifierName
  return protocolVerifierName?.trim() || 'ผู้ตรวจสอบ'
}

export function readPresentationConsentPartyLabel(
  credentialType: string,
  protocolVerifierName?: string,
): string {
  if (!isGenericVerifierName(protocolVerifierName)) {
    return protocolVerifierName!.trim()
  }
  const mock = readPresentationVerifierMock(credentialType)
  if (mock) return mock.consentPartyLabel
  return protocolVerifierName?.trim() || 'ผู้ตรวจสอบ'
}

export function readPresentationAccessLabel(credentialType: string): string | undefined {
  return readPresentationVerifierMock(credentialType)?.accessLabel
}

/** Consent-screen hero PNG — transcript only (white Chula logo). */
export function readPresentationVerifierLogoSource(
  credentialType: string,
): ImageSourcePropType | undefined {
  if (credentialType !== 'ChulalongkornUniversityTranscript') return undefined
  return TRANSCRIPT_CONSENT_LOGO
}

/** Consent-screen hero icon when there is no transcript PNG. */
export function readPresentationConsentHeroIcon(
  credentialType: string,
): PresentationConsentHeroIcon | undefined {
  return PRESENTATION_CONSENT_HERO_ICONS[credentialType]
}
