import { Image, Pressable, View, Text, type ImageSourcePropType } from 'react-native'

import type { CredentialDetailDisplay, CredentialDisplayRow, CredentialHolderProfile } from '../services/credentials/credentialDisplay'

const credentialImages: Record<CredentialDetailDisplay['imageKey'], ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/user_profile.png'),
}
const qrCodeIcon = require('../../assets/images/qr_code.png') as ImageSourcePropType

type Props = {
  display: CredentialDetailDisplay
  onOpenQr: () => void
  holderProfile?: CredentialHolderProfile
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
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function DetailValue({ row }: { row: CredentialDisplayRow }) {
  const isExpiry = /expir|หมดอายุ/i.test(`${row.key} ${row.label}`)

  return (
    <View className="mb-2">
      <Text className="text-[10.5px] font-medium leading-[14px] text-[#8a9bb0]">{row.label}</Text>
      <Text className={`text-[13px] font-bold leading-[18px] ${isExpiry ? 'text-[#e53935]' : 'text-[#1a2a42]'}`}>
        {row.value}
      </Text>
    </View>
  )
}

function TranscriptValue({ label, value, isCritical = false }: { label: string; value?: string; isCritical?: boolean }) {
  return (
    <View className="mb-4">
      <Text className={`text-[12px] font-semibold leading-[16px] ${isCritical ? 'text-[#ff1f1f]' : 'text-[#9aa1ac]'}`}>
        {label}
      </Text>
      <Text className={`mt-1 text-[13px] font-extrabold leading-[18px] ${isCritical ? 'text-[#ff1f1f]' : 'text-[#173a78]'}`}>
        {value || EMPTY_VALUE}
      </Text>
    </View>
  )
}

function TranscriptDocumentDetailCard({ display, onOpenQr, holderProfile }: Props) {
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
      <View
        testID="document-detail-card"
        className="overflow-hidden rounded-2xl bg-white"
        style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
        <View
          testID="document-detail-band-wrap"
          className="min-h-[60px] w-full justify-center overflow-hidden px-6"
          style={{ alignSelf: 'stretch', backgroundColor: '#f45b9a', width: '100%' }}>
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
            <Text className="text-[12px] font-semibold leading-[16px] text-[#9aa1ac]">ชื่อ - นามสกุล / Name</Text>
            <Text testID="document-detail-name" className="mt-2 text-[14px] font-extrabold leading-5 text-[#173a78]">
              {primaryName || EMPTY_VALUE}
            </Text>
            <Text testID="document-detail-name-en" className="mt-1 text-[10px] font-semibold leading-[14px] text-[#6d7890]">
              {secondaryName || EMPTY_VALUE}
            </Text>

            <View className="mt-8">
              <Text className="text-[12px] font-semibold leading-[16px] text-[#9aa1ac]">วันเกิด / Date of Birth</Text>
              <Text className="mt-2 text-[13px] font-extrabold leading-[18px] text-[#173a78]">{formatThaiDate(birthDateValue) || EMPTY_VALUE}</Text>
            </View>
          </View>
        </View>

        <View className="flex-row px-8 pb-7">
          <View testID="document-detail-left-column" className="flex-1 pr-8">
            <TranscriptValue label="เลขประจำตัวนิสิต" value={studentId?.value} />
            <TranscriptValue label="คณะ" value={faculty?.value} />
            <TranscriptValue label="สาขาวิชา" value={major?.value} />
          </View>
          <View className="w-px bg-[#e3e7ee]" />
          <View testID="document-detail-right-column" className="flex-1 pl-8">
            <TranscriptValue label="Cumulative GPA" value={gpa?.value} />
            <TranscriptValue label="Graduation Year" value={graduationYear?.value} />
            <TranscriptValue label="วันหมดอายุ / Expiry Date" value={expiryValue} isCritical />
          </View>
        </View>
      </View>

      <View className="mt-[18px] items-end pr-4">
        <Pressable
          testID="document-detail-my-qr"
          className="items-center gap-[3px] rounded-md border border-[#d8dde8] bg-white px-2.5 py-2"
          onPress={onOpenQr}
          style={{ elevation: 2, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Open My QR">
          <Image
            source={qrCodeIcon}
            className="h-[24px] w-[24px]"
            resizeMode="contain"
            style={{ tintColor: '#173a78' }}
          />
          <Text className="text-[10px] font-semibold text-[#173a78]">My QR</Text>
        </Pressable>
      </View>
    </View>
  )
}

function IdCardValue({ label, value, isCritical = false }: { label: string; value?: string; isCritical?: boolean }) {
  return (
    <View className="mb-4">
      <Text className={`text-[12px] font-semibold leading-[16px] ${isCritical ? 'text-[#ff1f1f]' : 'text-[#9aa1ac]'}`}>
        {label}
      </Text>
      <Text className={`mt-1 text-[13px] font-extrabold leading-[18px] ${isCritical ? 'text-[#ff1f1f]' : 'text-[#173a78]'}`}>
        {value || EMPTY_VALUE}
      </Text>
    </View>
  )
}

function IdCardDocumentDetailCard({ display, onOpenQr, holderProfile }: Props) {
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
      <View
        testID="document-detail-card"
        className="overflow-hidden rounded-2xl bg-white"
        style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
        <View
          testID="document-detail-band-wrap"
          className="min-h-[60px] w-full justify-center overflow-hidden px-7"
          style={{ alignSelf: 'stretch', backgroundColor: display.primaryColor || '#123b8c', width: '100%' }}>
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
            <Text className="text-[12px] font-semibold leading-[16px] text-[#9aa1ac]">ชื่อ - นามสกุล</Text>
            <Text testID="document-detail-name" className="mt-2 text-[14px] font-extrabold leading-5 text-[#173a78]">
              {thaiName && thaiName !== display.title ? thaiName : EMPTY_VALUE}
            </Text>
            <Text testID="document-detail-name-en" className="mt-1 text-[12px] font-semibold leading-[16px] text-[#173a78]">
              {englishName || EMPTY_VALUE}
            </Text>

            <View className="mt-7">
              <Text className="text-[12px] font-semibold leading-[16px] text-[#9aa1ac]">เลขบัตรประจำตัวประชาชน</Text>
              <Text testID="document-detail-primary-id" className="mt-2 text-[15px] font-extrabold leading-5 text-[#173a78]">
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
          <View className="w-px bg-[#e3e7ee]" />
          <View testID="document-detail-right-column" className="flex-1 pl-8">
            <IdCardValue label="ศาสนา" value={religion?.value || MOCK_ID_CARD_RELIGION} />
            <IdCardValue label="วันอนุญาต / Issue Date" value={formatThaiDate(issueDate?.value)} />
            <IdCardValue label="วันหมดอายุ / Expiry Date" value={expiryValue} isCritical />
          </View>
        </View>
      </View>

      <View className="mt-[18px] items-end pr-4">
        <Pressable
          testID="document-detail-my-qr"
          className="items-center gap-[3px] rounded-md border border-[#d8dde8] bg-white px-2.5 py-2"
          onPress={onOpenQr}
          style={{ elevation: 2, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Open My QR">
          <Image
            source={qrCodeIcon}
            className="h-[24px] w-[24px]"
            resizeMode="contain"
            style={{ tintColor: '#173a78' }}
          />
          <Text className="text-[10px] font-semibold text-[#173a78]">My QR</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function CredentialDocumentDetailCard({ display, onOpenQr, holderProfile }: Props) {
  if (display.imageKey === 'transcript') {
    return <TranscriptDocumentDetailCard display={display} onOpenQr={onOpenQr} holderProfile={holderProfile} />
  }
  if (display.imageKey === 'id') {
    return <IdCardDocumentDetailCard display={display} onOpenQr={onOpenQr} holderProfile={holderProfile} />
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
      <View
        testID="document-detail-card"
        className="overflow-hidden rounded-2xl bg-white"
        style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 16 }}>
        <View
          testID="document-detail-band-wrap"
          className="min-h-[48px] w-full justify-center overflow-hidden px-4 py-[11px]"
          style={{ alignSelf: 'stretch', backgroundColor: display.primaryColor || '#123b8c', minHeight: 48, overflow: 'hidden', width: '100%' }}>
          <Text testID="document-detail-band" className="text-[15px] font-extrabold leading-6 tracking-[1.5px] text-white" style={{ lineHeight: 24 }}>
            {display.documentTitle}
          </Text>
        </View>

        <View testID="document-detail-hero" className="h-[148px] flex-row border-b border-[#eef2f8]">
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
            <Text className="text-[10.5px] font-medium leading-[14px] text-[#8a9bb0]">Name</Text>
            <Text testID="document-detail-name" className="text-[15px] font-bold leading-5 text-wallet-navy">
              {display.primaryText}
            </Text>
            <Text className="mb-[6px] text-[10.5px] text-[#8a9bb0]">{display.title}</Text>

            {primaryId ? (
              <>
                <Text className="text-[10.5px] font-medium leading-[14px] text-[#8a9bb0]">{primaryId.label}</Text>
                <Text testID="document-detail-primary-id" className="text-sm font-extrabold leading-[18px] tracking-[0.4px] text-wallet-navy">
                  {primaryId.value}
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View className="flex-row">
          <View testID="document-detail-left-column" className="flex-1 border-r border-[#eef2f8] px-3 py-[10px]">
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

      <View className="mt-[10px] items-end">
        <Pressable
          testID="document-detail-my-qr"
          className="items-center gap-[3px] rounded-xl border border-[#e2e8f0] bg-white px-3 py-2"
          onPress={onOpenQr}
          style={{ elevation: 2, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Open My QR">
          <Image
            source={qrCodeIcon}
            className="h-[26px] w-[26px]"
            resizeMode="contain"
            style={{ tintColor: '#9aabbf' }}
          />
          <Text className="text-[10px] font-semibold text-wallet-navy">My QR</Text>
        </Pressable>
      </View>
    </View>
  )
}
