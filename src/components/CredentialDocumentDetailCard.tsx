import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { ReactNode } from 'react'
import { Image, Pressable, View, Text, type ImageSourcePropType } from 'react-native'

import type { CredentialDetailDisplay, CredentialDisplayRow, CredentialHolderProfile } from '../services/credentials/credentialDisplay'
import type { CredentialRenewalState } from '../services/credentials/credentialKeyRenewal'
import type { CredentialInactiveState } from '../services/credentials/credentialInactiveState'
import { CredentialRenewalOverlay } from './CredentialRenewalOverlay'

import { THEME } from '../config/themeColors'

const credentialImages: Record<CredentialDetailDisplay['imageKey'], ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/user_profile.png'),
}
const qrCodeIcon = require('../../assets/images/qr_code.png') as ImageSourcePropType

type Props = {
  display: CredentialDetailDisplay
  onOpenQr?: () => void
  onPresentViaNfc?: () => void
  holderProfile?: CredentialHolderProfile
  inactiveState?: CredentialInactiveState
  renewalBadgeLabel?: string
  renewalState?: CredentialRenewalState
}

function DocumentCardShell({
  children,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
}: {
  children: ReactNode
  inactiveState?: CredentialInactiveState
  renewalBadgeLabel?: string
  renewalState?: CredentialRenewalState
}) {
  return (
    <View className="relative">
      {children}
      {inactiveState ? (
        <CredentialRenewalOverlay
          inactiveState={inactiveState}
          badgeLabel={renewalBadgeLabel}
          renewalState={renewalState}
        />
      ) : null}
    </View>
  )
}

function DocumentActionButton({
  label,
  onPress,
  accessibilityLabel,
  testID,
  children,
}: {
  label: string
  onPress: () => void
  accessibilityLabel: string
  testID?: string
  children: ReactNode
}) {
  return (
    <Pressable
      testID={testID}
      className="min-w-[58px] items-center gap-[3px] rounded-md border border-slate140 bg-white px-2.5 py-2"
      onPress={onPress}
      style={{ elevation: 2, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}>
      {children}
      <Text className="text-center text-[10px] font-semibold text-navy-mid">{label}</Text>
    </Pressable>
  )
}

function DocumentActionRow({
  onOpenQr,
  onPresentViaNfc,
  className = 'mt-[18px] justify-end pr-4',
}: {
  onOpenQr?: () => void
  onPresentViaNfc?: () => void
  className?: string
}) {
  if (!onOpenQr && !onPresentViaNfc) return null

  return (
    <View className={`flex-row items-end gap-2 ${className}`}>
      {onPresentViaNfc ? (
        <DocumentActionButton
          label="NFC"
          onPress={onPresentViaNfc}
          accessibilityLabel="NFC"
          testID="document-detail-present-nfc">
          <MaterialCommunityIcons name="nfc-variant" size={24} color={THEME.navyMid} />
        </DocumentActionButton>
      ) : null}
      {onOpenQr ? (
        <DocumentActionButton
          label="My QR"
          onPress={onOpenQr}
          accessibilityLabel="Open My QR"
          testID="document-detail-my-qr">
          <Image
            source={qrCodeIcon}
            className="h-[24px] w-[24px]"
            resizeMode="contain"
            style={{ tintColor: THEME.navyMid }}
          />
        </DocumentActionButton>
      ) : null}
    </View>
  )
}

const NAME_ROW_KEYS = new Set(['givenName', 'familyName'])
const PRIMARY_ID_KEYS = ['nationalId', 'licenceNumber', 'studentId', 'idNumber']
const EMPTY_VALUE = '-'
const MOCK_ID_CARD_ENGLISH_NAME = 'Miss Pitchaya Rungruangkit'
const MOCK_TRANSCRIPT_ENGLISH_NAME = 'Ms. Thodsopp Eekkasandigital'
const MOCK_ID_CARD_ADDRESS = '123/45 ถนนราชดำเนิน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200'
const MOCK_ID_CARD_RELIGION = 'พุทธ'

function pickPrimaryId(rows: CredentialDisplayRow[]): CredentialDisplayRow | undefined {
  return (
    PRIMARY_ID_KEYS.map((key) => rows.find((row) => row.key === key)).find(Boolean) ??
    rows.find((row) => /id|number|licen[cs]e/i.test(`${row.key} ${row.label}`))
  )
}

function splitRows(rows: CredentialDisplayRow[]): [CredentialDisplayRow[], CredentialDisplayRow[]] {
  const midpoint = Math.ceil(rows.length / 2)
  return [rows.slice(0, midpoint), rows.slice(midpoint)]
}

function findRow(rows: CredentialDisplayRow[], keys: string[], labelPattern?: RegExp): CredentialDisplayRow | undefined {
  return rows.find((row) => keys.includes(row.key) || Boolean(labelPattern?.test(`${row.key} ${row.label}`)))
}

function formatThaiDate(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function DetailValue({ row }: { row: CredentialDisplayRow }) {
  const isExpiry = /expir|หมดอายุ/i.test(`${row.key} ${row.label}`)

  return (
    <View className="mb-2">
      <Text className="text-[10.5px] font-medium leading-[14px] text-blue-gray">{row.label}</Text>
      <Text className={`text-[13px] font-bold leading-[18px] ${isExpiry ? 'text-danger-alert' : 'text-ink'}`}>
        {row.value}
      </Text>
    </View>
  )
}

function TranscriptValue({ label, value, isCritical = false }: { label: string; value?: string; isCritical?: boolean }) {
  return (
    <View className="mb-4">
      <Text className={`text-[12px] font-semibold leading-[16px] ${isCritical ? 'text-danger-bright' : 'text-gray-cool'}`}>
        {label}
      </Text>
      <Text className={`mt-1 text-[13px] font-extrabold leading-[18px] ${isCritical ? 'text-danger-bright' : 'text-navy-mid'}`}>
        {value || EMPTY_VALUE}
      </Text>
    </View>
  )
}

function TranscriptDocumentDetailCard({ display, onOpenQr, onPresentViaNfc, holderProfile, inactiveState, renewalBadgeLabel, renewalState }: Props) {
  const rows = [...display.primaryRows, ...display.extraRows]
  const birthDate = findRow(rows, ['birthDate', 'dateOfBirth', 'dob'], /birth|dob|วันเกิด/i)
  const studentId = findRow(rows, ['studentId', 'student_id', 'studentID'], /student.*id|เลขประจำตัว/i)
  const faculty = findRow(rows, ['faculty', 'facultyName', 'faculty_name'], /faculty|คณะ/i)
  const major = findRow(rows, ['degree', 'degreeName', 'degree_name', 'program', 'programName'], /degree|program|major|สาขา/i)
  const gpa = findRow(rows, ['gpa', 'GPA', 'gradePointAverage', 'grade_point_average'], /gpa|grade/i)
  const graduationYear = findRow(rows, ['graduationYear', 'graduation_year'], /graduation.*year|ปีที่สำเร็จ/i)
  const expiryDate = findRow(rows, ['expiryDate', 'expirationDate', 'expiry_date'], /expir|หมดอายุ/i)
  const expiryValue = formatThaiDate(expiryDate?.value) ?? formatThaiDate(display.expiresAt)
  const thaiName = holderProfile?.thaiName
  const englishName = holderProfile?.englishName || MOCK_TRANSCRIPT_ENGLISH_NAME
  const primaryName = thaiName || (englishName && englishName !== display.title ? englishName : undefined)
  const secondaryName = thaiName && englishName && englishName !== display.title ? englishName : undefined
  const birthDateValue = birthDate?.value ?? holderProfile?.birthDate

  return (
    <View>
      <DocumentCardShell inactiveState={inactiveState} renewalBadgeLabel={renewalBadgeLabel} renewalState={renewalState}>
        <View
          testID="document-detail-card"
          className="overflow-hidden rounded-2xl bg-white"
          style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
          <View
            testID="document-detail-band-wrap"
            className="min-h-[60px] w-full justify-center overflow-hidden px-6"
            style={{ alignSelf: 'stretch', backgroundColor: THEME.pink, width: '100%' }}>
            <Text testID="document-detail-band" className="text-[20px] font-extrabold leading-7 text-white">
              TRANSCRIPT
            </Text>
          </View>

          <View testID="document-detail-hero" className="min-h-[245px] flex-row px-8 pb-6 pt-12">
          <View testID="document-detail-photo" className="h-[190px] w-[150px] shrink-0 items-center justify-end overflow-hidden bg-white">
            <Image
              testID="document-detail-image"
              source={credentialImages.transcript}
              className="h-full w-full"
              resizeMode="cover"
              style={{ height: '100%', width: '100%' }}
              accessibilityLabel={display.title}
            />
          </View>

          <View className="min-w-0 flex-1 justify-center pl-8">
            <Text className="text-[12px] font-semibold leading-[16px] text-gray-cool">ชื่อ - นามสกุล / Name</Text>
            <Text testID="document-detail-name" className="mt-2 text-[14px] font-extrabold leading-5 text-navy-mid">
              {primaryName || EMPTY_VALUE}
            </Text>
            <Text testID="document-detail-name-en" className="mt-1 text-[10px] font-semibold leading-[14px] text-slate-muted">
              {secondaryName || EMPTY_VALUE}
            </Text>

            <View className="mt-8">
              <Text className="text-[12px] font-semibold leading-[16px] text-gray-cool">วันเกิด / Date of Birth</Text>
              <Text className="mt-2 text-[13px] font-extrabold leading-[18px] text-navy-mid">{formatThaiDate(birthDateValue) || EMPTY_VALUE}</Text>
            </View>
          </View>
        </View>

        <View className="flex-row px-8 pb-7">
          <View testID="document-detail-left-column" className="flex-1 pr-8">
            <TranscriptValue label="เลขประจำตัวนิสิต" value={studentId?.value} />
            <TranscriptValue label="คณะ" value={faculty?.value} />
            <TranscriptValue label="สาขาวิชา" value={major?.value} />
          </View>
          <View className="w-px bg-slate100" />
          <View testID="document-detail-right-column" className="flex-1 pl-8">
            <TranscriptValue label="Cumulative GPA" value={gpa?.value} />
            <TranscriptValue label="Graduation Year" value={graduationYear?.value} />
            <TranscriptValue label="วันหมดอายุ / Expiry Date" value={expiryValue} isCritical />
          </View>
        </View>
        </View>
      </DocumentCardShell>

      <DocumentActionRow onOpenQr={onOpenQr} onPresentViaNfc={onPresentViaNfc} />
    </View>
  )
}

function IdCardValue({ label, value, isCritical = false }: { label: string; value?: string; isCritical?: boolean }) {
  return (
    <View className="mb-4">
      <Text className={`text-[12px] font-semibold leading-[16px] ${isCritical ? 'text-danger-bright' : 'text-gray-cool'}`}>
        {label}
      </Text>
      <Text className={`mt-1 text-[13px] font-extrabold leading-[18px] ${isCritical ? 'text-danger-bright' : 'text-navy-mid'}`}>
        {value || EMPTY_VALUE}
      </Text>
    </View>
  )
}

function IdCardDocumentDetailCard({ display, onOpenQr, onPresentViaNfc, holderProfile, inactiveState, renewalBadgeLabel, renewalState }: Props) {
  const rows = [...display.primaryRows, ...display.extraRows]
  const idNumber = findRow(rows, ['nationalId', 'idNumber', 'id_number'], /id|เลข|บัตร/i)
  const birthDate = findRow(rows, ['birthDate', 'birthdate', 'dateOfBirth', 'dob'], /birth|dob|เกิด/i)
  const religion = findRow(rows, ['religion'], /religion|ศาสนา/i)
  const address = findRow(rows, ['address', 'registeredAddress', 'registered_address'], /address|ที่อยู่/i)
  const issueDate = findRow(rows, ['issuanceDate', 'issued', 'issueDate', 'issue_date'], /issue|ออกบัตร|อนุญาต/i)
  const expiryDate = findRow(rows, ['expiryDate', 'expirationDate', 'expiry_date'], /expir|หมดอายุ/i)
  const expiryValue = formatThaiDate(expiryDate?.value) ?? formatThaiDate(display.expiresAt)
  const thaiName = holderProfile?.thaiName || display.primaryText
  const englishName = holderProfile?.englishName || MOCK_ID_CARD_ENGLISH_NAME
  const birthDateValue = birthDate?.value ?? holderProfile?.birthDate

  return (
    <View>
      <DocumentCardShell inactiveState={inactiveState} renewalBadgeLabel={renewalBadgeLabel} renewalState={renewalState}>
        <View
          testID="document-detail-card"
          className="overflow-hidden rounded-2xl bg-white"
          style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
          <View
            testID="document-detail-band-wrap"
            className="min-h-[60px] w-full justify-center overflow-hidden px-7"
            style={{ alignSelf: 'stretch', backgroundColor: display.primaryColor || THEME.navyRoyal, width: '100%' }}>
            <Text testID="document-detail-band" className="text-[20px] font-extrabold leading-7 text-white">
              ID CARD
            </Text>
          </View>

          <View testID="document-detail-hero" className="min-h-[225px] flex-row px-7 pb-5 pt-10">
          <View testID="document-detail-photo" className="h-[168px] w-[148px] shrink-0 items-center justify-end overflow-hidden bg-white">
            <Image
              testID="document-detail-image"
              source={credentialImages.id}
              className="h-full w-full"
              resizeMode="cover"
              style={{ height: '100%', width: '100%' }}
              accessibilityLabel={display.title}
            />
          </View>

          <View className="min-w-0 flex-1 justify-center pl-8">
            <Text className="text-[12px] font-semibold leading-[16px] text-gray-cool">ชื่อ - นามสกุล</Text>
            <Text testID="document-detail-name" className="mt-2 text-[14px] font-extrabold leading-5 text-navy-mid">
              {thaiName && thaiName !== display.title ? thaiName : EMPTY_VALUE}
            </Text>
            <Text testID="document-detail-name-en" className="mt-1 text-[12px] font-semibold leading-[16px] text-navy-mid">
              {englishName || EMPTY_VALUE}
            </Text>

            <View className="mt-7">
              <Text className="text-[12px] font-semibold leading-[16px] text-gray-cool">เลขบัตรประจำตัวประชาชน</Text>
              <Text testID="document-detail-primary-id" className="mt-2 text-[15px] font-extrabold leading-5 text-navy-mid">
                {idNumber?.value || EMPTY_VALUE}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row px-7 pb-7">
          <View testID="document-detail-left-column" className="flex-1 pr-8">
            <IdCardValue label="วันเดือนปีเกิด" value={formatThaiDate(birthDateValue)} />
            <IdCardValue label="ที่อยู่ตามทะเบียนบ้าน" value={address?.value || MOCK_ID_CARD_ADDRESS} />
          </View>
          <View className="w-px bg-slate100" />
          <View testID="document-detail-right-column" className="flex-1 pl-8">
            <IdCardValue label="ศาสนา" value={religion?.value || MOCK_ID_CARD_RELIGION} />
            <IdCardValue label="วันอนุญาต / Issue Date" value={formatThaiDate(issueDate?.value)} />
            <IdCardValue label="วันหมดอายุ / Expiry Date" value={expiryValue} isCritical />
          </View>
        </View>
        </View>
      </DocumentCardShell>

      <DocumentActionRow onOpenQr={onOpenQr} onPresentViaNfc={onPresentViaNfc} />
    </View>
  )
}

export function CredentialDocumentDetailCard({
  display,
  onOpenQr,
  onPresentViaNfc,
  holderProfile,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
}: Props) {
  if (display.imageKey === 'transcript') {
    return (
      <TranscriptDocumentDetailCard
        display={display}
        onOpenQr={onOpenQr}
        onPresentViaNfc={onPresentViaNfc}
        holderProfile={holderProfile}
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
      />
    )
  }
  if (display.imageKey === 'id') {
    return (
      <IdCardDocumentDetailCard
        display={display}
        onOpenQr={onOpenQr}
        onPresentViaNfc={onPresentViaNfc}
        holderProfile={holderProfile}
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
      />
    )
  }

  const primaryId = pickPrimaryId(display.primaryRows)
  const isPortraitArtwork =
    display.imageKey === 'profile'
  const detailRows = [...display.primaryRows, ...display.extraRows].filter((row) => {
    if (NAME_ROW_KEYS.has(row.key)) return false
    if (primaryId && row.key === primaryId.key) return false
    return true
  })
  const [leftRows, rightRows] = splitRows(detailRows)

  return (
    <View>
      <DocumentCardShell inactiveState={inactiveState} renewalBadgeLabel={renewalBadgeLabel} renewalState={renewalState}>
        <View
          testID="document-detail-card"
          className="overflow-hidden rounded-2xl bg-white"
          style={{ elevation: 4, shadowColor: THEME.navyShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
          <View
            testID="document-detail-band-wrap"
            className="min-h-[48px] w-full justify-center overflow-hidden px-4 py-[11px]"
            style={{ alignSelf: 'stretch', backgroundColor: display.primaryColor || THEME.navyRoyal, minHeight: 48, overflow: 'hidden', width: '100%' }}>
            <Text testID="document-detail-band" className="text-[15px] font-extrabold leading-6 tracking-[1.5px] text-white" style={{ lineHeight: 24 }}>
              {display.documentTitle}
            </Text>
          </View>

          <View testID="document-detail-hero" className="h-[148px] flex-row border-b border-surface-blue">
          <View testID="document-detail-photo" className="w-[120px] shrink-0 items-center justify-center overflow-hidden bg-white">
            <Image
              testID="document-detail-image"
              source={credentialImages[display.imageKey]}
              className={isPortraitArtwork ? 'h-full w-full' : 'h-[82px] w-[82px]'}
              resizeMode={isPortraitArtwork ? 'cover' : 'contain'}
              accessibilityLabel={display.title}
            />
          </View>

          <View className="flex-1 justify-center gap-[3px] p-3">
            <Text className="text-[10.5px] font-medium leading-[14px] text-blue-gray">Name</Text>
            <Text testID="document-detail-name" className="text-[15px] font-bold leading-5 text-wallet-navy">
              {display.primaryText}
            </Text>
            <Text className="mb-[6px] text-[10.5px] text-blue-gray">{display.title}</Text>

            {primaryId ? (
              <>
                <Text className="text-[10.5px] font-medium leading-[14px] text-blue-gray">{primaryId.label}</Text>
                <Text testID="document-detail-primary-id" className="text-sm font-extrabold leading-[18px] tracking-[0.4px] text-wallet-navy">
                  {primaryId.value}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View className="flex-row">
          <View testID="document-detail-left-column" className="flex-1 border-r border-surface-blue px-3 py-[10px]">
            {leftRows.map((row) => (
              <DetailValue key={row.key} row={row} />
            ))}
          </View>
          <View testID="document-detail-right-column" className="flex-1 px-3 py-[10px]">
            {rightRows.map((row) => (
              <DetailValue key={row.key} row={row} />
            ))}
          </View>
        </View>
        </View>
      </DocumentCardShell>

      <DocumentActionRow onOpenQr={onOpenQr} onPresentViaNfc={onPresentViaNfc} className="mt-[10px] justify-end" />
    </View>
  )
}
