import {
  isIssuerPortalCredentialType,
  type IssuerPortalCredentialType,
} from '../../config/issuerPortalUrls'
import {
  findDisplayFieldForClaimKey,
  getCardSchema,
  getCardSchemaForConfigurationId,
} from '../../config/cardSchemas'
import { readHistoryDocumentLabel } from '../../config/historyDisplayNames'
import { PRESENTATION_REQUEST_ALREADY_USED_MESSAGE } from './presentationIntakeRejection'
import { WALLET_HOME_COPY } from '../credentials/walletHomeCopy'
import {
  PresentationCredentialUnavailableError,
  type PresentationMatchFailureKind,
} from './presentationUnavailable'

export type PresentationFailureKind =
  | PresentationMatchFailureKind
  | 'issuer-pid-missing'
  | 'pid-required'
  | 'verifier-untrusted'
  | 'issuer-untrusted'
  | 'request-unsupported'
  | 'request-invalid'
  | 'request-expired'
  | 'request-unreachable'
  | 'holder-binding'
  | 'timeout'
  | 'biometric-cancelled'
  | 'biometric-unavailable'
  | 'biometric-failed'
  | 'submission-rejected'
  | 'credential-revoked'
  | 'replay-blocked'
  | 'security-state'
  | 'generic'

export type PresentationFailureUi = {
  kind: PresentationFailureKind
  title: string
  body: string
  hint?: string
  documentLabel?: string
  missingClaimLabels?: string[]
  showRequestButton: boolean
  requestCredentialType?: IssuerPortalCredentialType
}

export function resolvePresentationFailureUi(error: unknown): PresentationFailureUi {
  const unavailableError = readUnavailableCredentialError(error)
  if (unavailableError) {
    return resolveCredentialUnavailableFailureUi(unavailableError)
  }

  const raw = error instanceof Error ? error.message : String(error)
  return resolveMessageFailureUi(raw, error)
}

function readUnavailableCredentialError(error: unknown): PresentationCredentialUnavailableError | undefined {
  if (error instanceof PresentationCredentialUnavailableError) return error
  if (!(error instanceof Error) || error.name !== 'PresentationCredentialUnavailableError') return undefined
  return error as PresentationCredentialUnavailableError
}

function resolveCredentialUnavailableFailureUi(
  error: PresentationCredentialUnavailableError,
): PresentationFailureUi {
  const documentContext = readDocumentContext(error)
  const kind = resolveMatchFailureKind(error)
  const missingClaimLabels = readMissingClaimLabels(error)

  switch (kind) {
    case 'claims-incomplete':
      return {
        kind,
        title: 'เอกสารไม่ครบข้อมูลที่ผู้ตรวจสอบต้องการ',
        body: documentContext.documentLabel
          ? `มี ${documentContext.documentLabel} ใน Wallet แล้ว แต่ข้อมูลบางส่วนที่ผู้ตรวจสอบขอไม่ได้รับตอนออกเอกสาร`
          : 'มีเอกสารใน Wallet แล้ว แต่ข้อมูลบางส่วนที่ผู้ตรวจสอบขอไม่ได้รับตอนออกเอกสาร',
        hint: 'ติดต่อผู้ออกเอกสารเพื่อออกเอกสารใหม่ที่มีข้อมูลครบ หรือให้ผู้ตรวจสอบปรับรายการข้อมูลที่ขอ',
        documentLabel: documentContext.documentLabel,
        missingClaimLabels,
        showRequestButton: false,
        requestCredentialType: documentContext.requestCredentialType,
      }
    case 'metadata-mismatch':
      return {
        kind,
        title: 'เอกสารไม่ตรงกับที่ผู้ตรวจสอบขอ',
        body: documentContext.documentLabel
          ? `มีเอกสารใน Wallet แล้ว แต่ ${documentContext.documentLabel} ที่เก็บไว้ไม่ตรงกับประเภทที่ผู้ตรวจสอบร้องขอ`
          : 'มีเอกสารใน Wallet แล้ว แต่ประเภทเอกสารไม่ตรงกับที่ผู้ตรวจสอบร้องขอ',
        hint: 'ลองขอเอกสารใหม่จากผู้ออกให้ตรงกับที่ผู้ตรวจสอบต้องการ',
        documentLabel: documentContext.documentLabel,
        showRequestButton: Boolean(documentContext.requestCredentialType),
        requestCredentialType: documentContext.requestCredentialType,
      }
    case 'format-mismatch':
      return {
        kind,
        title: 'รูปแบบเอกสารไม่ตรงกัน',
        body: documentContext.documentLabel
          ? `${documentContext.documentLabel}ใน Wallet เป็นรูปแบบที่ผู้ตรวจสอบไม่รองรับ`
          : 'เอกสารใน Wallet เป็นรูปแบบที่ผู้ตรวจสอบไม่รองรับ',
        hint: 'ขอเอกสารใหม่จากผู้ออกในรูปแบบที่ผู้ตรวจสอบรองรับ',
        documentLabel: documentContext.documentLabel,
        showRequestButton: Boolean(documentContext.requestCredentialType),
        requestCredentialType: documentContext.requestCredentialType,
      }
    case 'not-presentable':
      return {
        kind,
        title: 'เอกสารไม่พร้อมใช้งาน',
        body: documentContext.documentLabel
          ? `${documentContext.documentLabel}หมดอายุ ถูกระงับ หรือต้องต่ออายุก่อนจึงจะแสดงได้`
          : 'เอกสารที่เกี่ยวข้องหมดอายุ ถูกระงับ หรือต้องต่ออายุก่อนจึงจะแสดงได้',
        hint: 'ตรวจสอบสถานะเอกสารใน Wallet แล้วต่ออายุหรือขอเอกสารใหม่หากจำเป็น',
        documentLabel: documentContext.documentLabel,
        showRequestButton: false,
        requestCredentialType: documentContext.requestCredentialType,
      }
    case 'document-not-stored':
    default:
      return {
        kind: 'document-not-stored',
        title: 'ไม่พบเอกสารที่ใช้ยืนยัน',
        body: documentContext.documentLabel
          ? `ผู้ตรวจสอบขอ ${documentContext.documentLabel} แต่ยังไม่มีเอกสารนี้ใน Wallet ของคุณ`
          : 'ผู้ตรวจสอบขอเอกสารที่ยังไม่มีใน Wallet ของคุณ',
        hint: documentContext.requestCredentialType
          ? 'กดขอเอกสารเพื่อรับเอกสารจากผู้ออก'
          : undefined,
        documentLabel: documentContext.documentLabel,
        showRequestButton: Boolean(documentContext.requestCredentialType),
        requestCredentialType: documentContext.requestCredentialType,
      }
  }
}

function resolveMessageFailureUi(raw: string, error?: unknown): PresentationFailureUi {
  if (raw.includes('PresentationPidRequired')) {
    return {
      kind: 'pid-required',
      title: WALLET_HOME_COPY.pidRequiredTitle,
      body: WALLET_HOME_COPY.pidRequiredToPresentMessage,
      hint: 'ขอและเก็บบัตรประชาชน (PID) ใน Wallet แล้วลองใหม่อีกครั้ง',
      documentLabel: readHistoryDocumentLabel({ credentialType: 'ThaiNationalID' }),
      showRequestButton: true,
      requestCredentialType: 'ThaiNationalID',
    }
  }

  if (raw.includes('PresentationCredentialMissing:issuer-pid')) {
    return {
      kind: 'issuer-pid-missing',
      title: 'ยังไม่มีบัตรประชาชนใน Wallet',
      body: 'ผู้ออกเอกสารต้องการบัตรประชาชนก่อนจึงจะดำเนินการต่อได้',
      hint: 'ขอและเก็บบัตรประชาชน (PID) ใน Wallet แล้วลองใหม่อีกครั้ง',
      documentLabel: readHistoryDocumentLabel({ credentialType: 'ThaiNationalID' }),
      showRequestButton: true,
      requestCredentialType: 'ThaiNationalID',
    }
  }

  if (raw.includes('VerifierUntrusted')) {
    return {
      kind: 'verifier-untrusted',
      title: 'ผู้ตรวจสอบไม่ได้รับความเชื่อถือ',
      body: 'Wallet ยังไม่ได้ตั้งค่าให้เชื่อถือผู้ตรวจสอบรายนี้',
      hint: 'ติดต่อผู้ดูแลระบบหรือลองสแกน QR จากแหล่งที่เชื่อถือได้',
      showRequestButton: false,
    }
  }

  if (raw.includes('IssuerOid4VpUntrusted')) {
    return {
      kind: 'issuer-untrusted',
      title: 'ผู้ออกเอกสารไม่ได้รับความเชื่อถือ',
      body: 'Wallet ยังไม่ได้ตั้งค่าให้เชื่อถือผู้ออกเอกสารรายนี้สำหรับการแสดงข้อมูล',
      hint: 'ตรวจสอบการตั้งค่า Wallet หรือติดต่อผู้ดูแลระบบ',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationCredentialMetadataMismatch')) {
    const unavailable = error ? readUnavailableCredentialError(error) : undefined
    const documentContext = unavailable ? readDocumentContext(unavailable) : {}
    return {
      kind: 'metadata-mismatch',
      title: 'เอกสารไม่ตรงกับที่ผู้ตรวจสอบขอ',
      body: documentContext.documentLabel
        ? `มีเอกสารใน Wallet แล้ว แต่ ${documentContext.documentLabel} ที่เก็บไว้ไม่ตรงกับประเภทที่ผู้ตรวจสอบร้องขอ`
        : 'เอกสารที่เก็บไว้ไม่ตรงกับประเภทหรือข้อมูลอ้างอิงที่ผู้ตรวจสอบร้องขอ',
      hint: 'ลองขอเอกสารใหม่จากผู้ออกให้ตรงกับที่ผู้ตรวจสอบต้องการ',
      documentLabel: documentContext.documentLabel,
      showRequestButton: Boolean(documentContext.requestCredentialType),
      requestCredentialType: documentContext.requestCredentialType,
    }
  }

  if (raw.includes('PresentationCredentialFormatUnsupported')) {
    return {
      kind: 'format-mismatch',
      title: 'รูปแบบเอกสารไม่ตรงกัน',
      body: 'เอกสารใน Wallet เป็นรูปแบบที่ผู้ตรวจสอบไม่รองรับ',
      hint: 'ขอเอกสารใหม่จากผู้ออกในรูปแบบที่ผู้ตรวจสอบรองรับ',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationRequestUnsupported')) {
    return {
      kind: 'request-unsupported',
      title: 'คำขอไม่รองรับ',
      body: 'Wallet ยังไม่รองรับรูปแบบคำขอจากผู้ตรวจสอบรายนี้',
      hint: 'ลองสแกน QR ใหม่หรือติดต่อผู้ตรวจสอบ',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationRequestInvalid')) {
    return {
      kind: 'request-invalid',
      title: 'คำขอไม่ถูกต้อง',
      body: 'คำขอจากผู้ตรวจสอบไม่สมบูรณ์หรืออ่านไม่ได้',
      hint: 'ลองสแกน QR ใหม่อีกครั้ง',
      showRequestButton: false,
    }
  }

  if (
    raw.includes('PresentationRequestFetchFailed')
    || raw.includes('PresentationDefinitionFetchFailed')
  ) {
    const statusMatch = raw.match(/HTTP\s+(\d{3})/i)
    const status = statusMatch ? Number(statusMatch[1]) : undefined
    if (status === 404 || status === 410 || status === 422) {
      return {
        kind: 'request-expired',
        title: 'คำขอตรวจสอบหมดอายุแล้ว',
        body: 'ลิงก์หรือ QR จากผู้ตรวจสอบใช้ไม่ได้แล้ว หรือถูกยกเลิกไปแล้ว',
        hint: 'ขอ QR หรือลิงก์ใหม่จากผู้ตรวจสอบ แล้วลองอีกครั้ง',
        showRequestButton: false,
      }
    }

    return {
      kind: 'request-unreachable',
      title: 'เชื่อมต่อผู้ตรวจสอบไม่สำเร็จ',
      body: 'ไม่สามารถดึงคำขอตรวจสอบจากผู้ตรวจสอบได้ในขณะนี้',
      hint: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง หรือขอ QR ใหม่หากปัญหายังอยู่',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationCredentialHolderBindingMissing') || raw.includes('PresentationCredentialHolderBindingMismatch')) {
    return {
      kind: 'holder-binding',
      title: 'เอกสารไม่ได้ผูกกับ Wallet นี้',
      body: 'เอกสารนี้ออกให้กับ Wallet อื่น หรือผู้ออกไม่ได้เชื่อมกับกุญแจของคุณ',
      hint: 'ออกจากระบบผู้ออกเอกสาร แล้วขอเอกสารใหม่บนเครื่องนี้',
      showRequestButton: false,
    }
  }

  if (raw.includes('ScanTimeout') || raw.includes('Timeout:')) {
    return {
      kind: 'timeout',
      title: 'หมดเวลา',
      body: 'การเชื่อมต่อใช้เวลานานเกินไป',
      hint: 'ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
      showRequestButton: false,
    }
  }

  if (raw.includes('WalletKeySigningCancelled') || raw.includes('PresentationBiometricCancelled')) {
    return {
      kind: 'biometric-cancelled',
      title: 'ยกเลิกการยืนยันตัวตน',
      body: 'คุณยกเลิกการยืนยันตัวตนด้วยไบโอเมตริก',
      hint: 'ลองอีกครั้งเมื่อพร้อมดำเนินการต่อ',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationBiometricUnavailable')) {
    return {
      kind: 'biometric-unavailable',
      title: 'ไม่สามารถใช้ไบโอเมตริกได้',
      body: 'อุปกรณ์นี้ยังไม่ได้ตั้งค่าไบโอเมตริกสำหรับการยืนยันตัวตน',
      hint: 'ตั้งค่าไบโอเมตริกในระบบแล้วลองใหม่',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationBiometricFailed')) {
    return {
      kind: 'biometric-failed',
      title: 'ยืนยันตัวตนไม่สำเร็จ',
      body: 'การยืนยันตัวตนด้วยไบโอเมตริกล้มเหลว',
      hint: 'ลองอีกครั้ง',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationRequestReplay')) {
    return {
      kind: 'replay-blocked',
      title: 'คำขอนี้ใช้ไปแล้ว',
      body: PRESENTATION_REQUEST_ALREADY_USED_MESSAGE,
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationReplayLedgerWriteFailed')) {
    return {
      kind: 'security-state',
      title: 'ไม่สามารถบันทึกสถานะความปลอดภัยได้',
      body: 'Wallet ไม่สามารถบันทึกสถานะการใช้งานคำขอนี้ได้',
      hint: 'ปิดแล้วเปิด Wallet ใหม่ แล้วลองอีกครั้ง',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationCredentialStatusInvalid')) {
    const statusMatch = raw.match(/status_list_entry=(VALID|INVALID|SUSPENDED|UNKNOWN)/)
    const statusLabel = statusMatch?.[1] === 'SUSPENDED'
      ? 'ถูกระงับ'
      : statusMatch?.[1] === 'INVALID'
        ? 'ถูกเพิกถอนแล้ว'
        : 'ไม่พร้อมใช้งาน'
    return {
      kind: 'credential-revoked',
      title: 'เอกสารไม่พร้อมนำเสนอ',
      body: `เอกสารนี้${statusLabel}ตามรายการสถานะของผู้ออกเอกสาร`,
      hint: 'ลบเอกสารเก่าใน Wallet แล้วขอออกเอกสารใหม่จากผู้ออกเอกสาร',
      showRequestButton: false,
    }
  }

  if (raw.includes('DcApiDeliveryFailed') || raw.includes('CredentialManagerDeliveryFailed')) {
    return {
      kind: 'submission-rejected',
      title: 'ส่งข้อมูลกลับไปยังเบราว์เซอร์ไม่สำเร็จ',
      body: 'Wallet สร้างการนำเสนอสำเร็จแล้ว แต่ไม่สามารถส่งผลลัพธ์กลับไปยัง Chrome ได้',
      hint: 'กลับไปที่ Chrome แล้วกด Request Credentials ใหม่อีกครั้ง',
      showRequestButton: false,
    }
  }

  if (
    raw.includes('DC_API_DEVICE_RESPONSE_X5CHAIN_MISSING')
    || raw.includes('certificate chain (x5chain)')
  ) {
    return {
      kind: 'not-presentable',
      title: 'เอกสารไม่พร้อมนำเสนอ',
      body: 'ใบขับขี่ mDL ที่เก็บไว้ไม่มี certificate chain (x5chain) ที่ผู้ตรวจสอบต้องการ',
      hint: 'ลบเอกสารเก่าใน Wallet แล้วขอออกใบขับขี่ mDL ใหม่จากผู้ออกเอกสาร',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationSubmissionFailed')) {
    const isIssuer = raw.includes(':issuer')
    const transportHint = __DEV__ ? readSafeTransportHint(error) : undefined
    return {
      kind: 'submission-rejected',
      title: isIssuer ? 'ผู้ออกเอกสารปฏิเสธการส่งข้อมูล' : 'ผู้ตรวจสอบปฏิเสธการส่งข้อมูล',
      body: `${isIssuer
        ? 'คำขอส่งข้อมูลไม่ผ่านการตรวจสอบของผู้ออกเอกสาร'
        : 'คำขอส่งข้อมูลไม่ผ่านการตรวจสอบของผู้ตรวจสอบ'}${transportHint ? ` (${transportHint})` : ''}`,
      hint: 'ลองใหม่อีกครั้ง หรือติดต่อผู้เกี่ยวข้องหากปัญหายังคงอยู่',
      showRequestButton: false,
    }
  }

  if (
    raw.includes('LegacyHolderSigningUnsupported') ||
    raw.includes('ProximityHardwareDeviceAuthUnavailable')
  ) {
    return {
      kind: 'not-presentable',
      title: 'เอกสารไม่พร้อมใช้งาน',
      body: WALLET_HOME_COPY.hardwareReissueRequiredMessage,
      hint: 'ขอเอกสารใหม่จากผู้ออกเอกสารบนกุญแจฮาร์ดแวร์',
      showRequestButton: false,
    }
  }

  if (raw.includes('PresentationCredentialMissing')) {
    const unavailable = error ? readUnavailableCredentialError(error) : undefined
    if (unavailable) {
      return resolveCredentialUnavailableFailureUi(unavailable)
    }

    const claimMatch = raw.match(/missing claims:\s*([^;\]]+)/)
    if (claimMatch) {
      const keys = claimMatch[1].split(',').map((key) => key.trim()).filter(Boolean)
      return {
        kind: 'claims-incomplete',
        title: 'เอกสารไม่ครบข้อมูลที่ผู้ตรวจสอบต้องการ',
        body: 'มีเอกสารใน Wallet แล้ว แต่ข้อมูลบางส่วนที่ผู้ตรวจสอบขอไม่ได้รับตอนออกเอกสาร',
        hint: 'ติดต่อผู้ออกเอกสารเพื่อออกเอกสารใหม่ที่มีข้อมูลครบ หรือให้ผู้ตรวจสอบปรับรายการข้อมูลที่ขอ',
        missingClaimLabels: keys.map((key) => resolveUntypedFailureClaimLabel(key)),
        showRequestButton: false,
      }
    }
  }

  return {
    kind: 'generic',
    title: 'ไม่สามารถดำเนินการได้',
    body: raw || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ',
    hint: 'ลองใหม่อีกครั้ง',
    showRequestButton: false,
  }
}

function readSafeTransportHint(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined

  const hint = (error as Error & { presentationTransportHint?: unknown }).presentationTransportHint
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return undefined

  const { jweSegments, vpTokenJsonType, jweAlg, jweEnc, jweApvPresent } = hint as Record<string, unknown>
  const fields = [
    Number.isInteger(jweSegments) && Number(jweSegments) >= 0 && Number(jweSegments) <= 10
      ? `jwe_segments=${jweSegments}`
      : undefined,
    vpTokenJsonType === 'object' || vpTokenJsonType === 'array' || vpTokenJsonType === 'string'
      ? `vp_token_json_type=${vpTokenJsonType}`
      : undefined,
    typeof jweAlg === 'string' ? `jwe_alg=${jweAlg}` : undefined,
    typeof jweEnc === 'string' ? `jwe_enc=${jweEnc}` : undefined,
    typeof jweApvPresent === 'boolean' ? `jwe_apv_present=${jweApvPresent}` : undefined,
  ].filter((field): field is string => Boolean(field))

  return fields.length > 0 ? `transport: ${fields.join('; ')}` : undefined
}

function resolveMatchFailureKind(error: PresentationCredentialUnavailableError): PresentationMatchFailureKind {
  if (error.matchFailureKind) return error.matchFailureKind
  if (error.reason === 'metadata-mismatch') return 'metadata-mismatch'

  const raw = error.message
  if (raw.includes('no presentable credentials')) return 'not-presentable'
  if (raw.includes('failed format gate')) return 'format-mismatch'
  if (raw.includes('failed vct gate')) return 'metadata-mismatch'
  if (raw.includes('failed claims gate') || raw.includes('missing claims:')) return 'claims-incomplete'

  return 'document-not-stored'
}

const UNKNOWN_FAILURE_CLAIM_LABEL = 'ข้อมูลที่ร้องขอ'

function readMissingClaimLabels(error: PresentationCredentialUnavailableError): string[] | undefined {
  if (error.unsatisfiedClaimKeys?.length) {
    const documentType = error.recordType ?? error.requestedCredentialTypes[0]
    if (documentType) {
      return error.unsatisfiedClaimKeys.map((key) =>
        resolvePresentationFailureClaimLabel(documentType, key),
      )
    }
    return error.unsatisfiedClaimKeys.map(() => UNKNOWN_FAILURE_CLAIM_LABEL)
  }

  const claimMatch = error.message.match(/missing claims:\s*([^;\]]+)/)
  if (!claimMatch) return undefined
  const keys = claimMatch[1].split(',').map((key) => key.trim()).filter(Boolean)
  const documentType = error.recordType ?? error.requestedCredentialTypes[0]
  if (!documentType) return keys.map(() => UNKNOWN_FAILURE_CLAIM_LABEL)
  return keys.map((key) => resolvePresentationFailureClaimLabel(documentType, key))
}

function resolvePresentationFailureClaimLabel(documentType: string, claimKey: string): string {
  return (
    findDisplayFieldForClaimKey(getCardSchema(documentType).displayFields, claimKey)?.presentationLabel
    ?? UNKNOWN_FAILURE_CLAIM_LABEL
  )
}

function resolveUntypedFailureClaimLabel(claimKey: string): string {
  for (const documentType of ['DLTDrivingLicence', 'ThaiNationalID', 'ChulalongkornUniversityTranscript']) {
    const label = resolvePresentationFailureClaimLabel(documentType, claimKey)
    if (label !== UNKNOWN_FAILURE_CLAIM_LABEL) return label
  }
  return UNKNOWN_FAILURE_CLAIM_LABEL
}

function readDocumentContext(error: PresentationCredentialUnavailableError): {
  documentLabel?: string
  requestCredentialType?: IssuerPortalCredentialType
} {
  const requestedCredentialTypes = error.requestedCredentialTypes
  const requestedVctValues = error.requestedVctValues
  const mappedType = requestedCredentialTypes.find(isIssuerPortalCredentialType)
    ?? requestedVctValues
      .map((value) => getCardSchemaForConfigurationId(value).type)
      .find(isIssuerPortalCredentialType)

  if (!mappedType) {
    return { documentLabel: 'เอกสารที่ร้องขอ' }
  }

  return {
    documentLabel: readHistoryDocumentLabel({ credentialType: mappedType }),
    requestCredentialType: mappedType,
  }
}
