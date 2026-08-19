/**
 * Full credential detail card (PID/transcript/generic) with DL branch and renewal overlay.
 * Journey: Wallet detail; also Issuer PID presentation.
 * Copy: credentialDisplay; inactive/renewal services.
 * Layout: DrivingLicenceDocumentCard, DocumentCardLayout, DocumentCardDetailValue, CredentialRenewalOverlay.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import {
  Image,
  Pressable,
  View,
  Text,
  type ImageSourcePropType,
} from "react-native";

import type {
  CredentialDetailDisplay,
  CredentialDisplayRow,
  CredentialHolderProfile,
} from "../services/credentials/credentialDisplay";
import type { CredentialRenewalState } from "../services/credentials/credentialKeyRenewal";
import type { CredentialInactiveState } from "../services/credentials/credentialInactiveState";
import { shouldShowCredentialRenewalRibbon } from "../services/credentials/credentialRenewalPresentation";
import { shouldBlockCredentialDetailPresentment } from "../services/credentials/credentialHomeNavigation";
import type { VerifiableCredentialRecord } from "../services/vci/exchangeService";
import { CredentialRenewalOverlay } from "./CredentialRenewalOverlay";
import { DocumentCardDetailValue } from "./DocumentCardDetailValue";
import { DrivingLicenceDocumentCard } from "./DrivingLicenceDocumentCard";
import { DocumentCardLayout } from "./DocumentCardLayout";

import { THEME } from "../config/themeColors";

const credentialImages: Record<
  CredentialDetailDisplay["imageKey"],
  ImageSourcePropType
> = {
  profile: require("../../assets/images/profile.png"),
  id: require("../../assets/images/user_profile.png"),
  car: require("../../assets/images/car.png"),
  transcript: require("../../assets/images/user_profile.png"),
};
const qrCodeIcon =
  require("../../assets/images/qr_code.png") as ImageSourcePropType;

const INACTIVE_RIBBON_COLUMNS_CLASS_NAME = "flex-row px-4 pt-4 pb-12";

function readRibbonColumnsClassName(
  inactiveState?: CredentialInactiveState,
  renewalState?: CredentialRenewalState,
): string | undefined {
  if (!inactiveState) return undefined;
  if (!shouldShowCredentialRenewalRibbon(inactiveState, renewalState)) {
    return undefined;
  }
  return INACTIVE_RIBBON_COLUMNS_CLASS_NAME;
}

type Props = {
  display: CredentialDetailDisplay;
  record?: VerifiableCredentialRecord;
  onOpenQr?: () => void;
  onPresentViaNfc?: () => void;
  holderProfile?: CredentialHolderProfile;
  inactiveState?: CredentialInactiveState;
  renewalBadgeLabel?: string;
  renewalState?: CredentialRenewalState;
  bannerAction?: ReactNode;
};

function DocumentCardShell({
  children,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
  record,
}: {
  children: ReactNode;
  inactiveState?: CredentialInactiveState;
  renewalBadgeLabel?: string;
  renewalState?: CredentialRenewalState;
  record?: VerifiableCredentialRecord;
}) {
  return (
    <View className="relative">
      {children}
      {inactiveState ? (
        <CredentialRenewalOverlay
          inactiveState={inactiveState}
          badgeLabel={renewalBadgeLabel}
          renewalState={renewalState}
          credential={record}
        />
      ) : null}
    </View>
  );
}

function DocumentActionButton({
  label,
  onPress,
  accessibilityLabel,
  testID,
  children,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      testID={testID}
      className="min-w-[58px] items-center gap-[3px] rounded-md border border-slate140 bg-white px-2.5 py-2"
      onPress={onPress}
      style={{
        elevation: 2,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      <Text className="text-center text-[10px] font-semibold text-navy-mid">
        {label}
      </Text>
    </Pressable>
  );
}

function DocumentActionRow({
  onOpenQr,
  onPresentViaNfc,
  className = "mt-[18px] justify-end pr-4",
}: {
  onOpenQr?: () => void;
  onPresentViaNfc?: () => void;
  className?: string;
}) {
  if (!onOpenQr && !onPresentViaNfc) return null;

  return (
    <View className={`flex-row items-end gap-2 ${className}`}>
      {onPresentViaNfc ? (
        <DocumentActionButton
          label="NFC"
          onPress={onPresentViaNfc}
          accessibilityLabel="NFC"
          testID="document-detail-present-nfc"
        >
          <MaterialCommunityIcons
            name="nfc-variant"
            size={24}
            color={THEME.navyMid}
          />
        </DocumentActionButton>
      ) : null}
      {onOpenQr ? (
        <DocumentActionButton
          label="My QR"
          onPress={onOpenQr}
          accessibilityLabel="Open My QR"
          testID="document-detail-my-qr"
        >
          <Image
            source={qrCodeIcon}
            className="h-[24px] w-[24px]"
            resizeMode="contain"
            style={{ tintColor: THEME.navyMid }}
          />
        </DocumentActionButton>
      ) : null}
    </View>
  );
}

const NAME_ROW_KEYS = new Set(["givenName", "familyName"]);
const PRIMARY_ID_KEYS = [
  "nationalId",
  "licenceNumber",
  "studentId",
  "idNumber",
];
const EMPTY_VALUE = "-";
const MOCK_ID_CARD_ENGLISH_NAME = "Ms. Thodsopp Eekkasandigital";
const MOCK_TRANSCRIPT_ENGLISH_NAME = "Ms. Thodsopp Eekkasandigital";
const MOCK_ID_CARD_ADDRESS =
  "123/45 ถนนราชดำเนิน แขวงพระบรมมหาราชวัง เขตพระนคร กรุงเทพมหานคร 10200";
const MOCK_ID_CARD_RELIGION = "พุทธ";

function pickPrimaryId(
  rows: CredentialDisplayRow[],
): CredentialDisplayRow | undefined {
  return (
    PRIMARY_ID_KEYS.map((key) => rows.find((row) => row.key === key)).find(
      Boolean,
    ) ??
    rows.find((row) => /id|number|licen[cs]e/i.test(`${row.key} ${row.label}`))
  );
}

function splitRows(
  rows: CredentialDisplayRow[],
): [CredentialDisplayRow[], CredentialDisplayRow[]] {
  const midpoint = Math.ceil(rows.length / 2);
  return [rows.slice(0, midpoint), rows.slice(midpoint)];
}

function findRow(
  rows: CredentialDisplayRow[],
  keys: string[],
  labelPattern?: RegExp,
): CredentialDisplayRow | undefined {
  return rows.find(
    (row) =>
      keys.includes(row.key) ||
      Boolean(labelPattern?.test(`${row.key} ${row.label}`)),
  );
}

function formatThaiDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function DetailValue({ row }: { row: CredentialDisplayRow }) {
  const isExpiry = /expir|หมดอายุ/i.test(`${row.key} ${row.label}`);

  return (
    <View className="mb-2">
      <Text className="text-[10.5px] font-medium leading-[14px] text-blue-gray">
        {row.label}
      </Text>
      <Text
        className={`text-[13px] font-bold leading-[18px] ${isExpiry ? "text-danger-alert" : "text-ink"}`}
      >
        {row.value}
      </Text>
    </View>
  );
}

function TranscriptDocumentDetailCard({
  display,
  record,
  onOpenQr,
  onPresentViaNfc,
  holderProfile,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
  bannerAction,
}: Props) {
  const rows = [...display.primaryRows, ...display.extraRows];
  const birthDate = findRow(
    rows,
    ["birthDate", "dateOfBirth", "dob"],
    /birth|dob|วันเกิด/i,
  );
  const studentId = findRow(
    rows,
    ["studentId", "student_id", "studentID"],
    /student.*id|เลขประจำตัว/i,
  );
  const faculty = findRow(
    rows,
    ["faculty", "facultyName", "faculty_name"],
    /faculty|คณะ/i,
  );
  const major = findRow(
    rows,
    ["degree", "degreeName", "degree_name", "program", "programName"],
    /degree|program|major|สาขา/i,
  );
  const gpa = findRow(
    rows,
    ["gpa", "GPA", "gradePointAverage", "grade_point_average"],
    /gpa|grade/i,
  );
  const graduationYear = findRow(
    rows,
    ["graduationYear", "graduation_year"],
    /graduation.*year|ปีที่สำเร็จ/i,
  );
  const expiryDate = findRow(
    rows,
    ["expiryDate", "expirationDate", "expiry_date"],
    /expir|หมดอายุ/i,
  );
  const expiryValue =
    formatThaiDate(expiryDate?.value) ?? formatThaiDate(display.expiresAt);
  const thaiName = holderProfile?.thaiName;
  const englishName =
    holderProfile?.englishName || MOCK_TRANSCRIPT_ENGLISH_NAME;
  const primaryName =
    thaiName ||
    (englishName && englishName !== display.title ? englishName : undefined);
  const secondaryName =
    thaiName && englishName && englishName !== display.title
      ? englishName
      : undefined;
  const birthDateValue = birthDate?.value ?? holderProfile?.birthDate;

  return (
    <View>
      <DocumentCardShell
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        record={record}
      >
        <View testID="document-detail-card">
          <DocumentCardLayout
            primaryColor={THEME.pink}
            bannerAction={bannerAction}
            columnsClassName={readRibbonColumnsClassName(
              inactiveState,
              renewalState,
            )}
            banner={
              <Text
                testID="document-detail-band"
                className="text-[15px] font-extrabold tracking-[1.5px] text-white"
              >
                TRANSCRIPT
              </Text>
            }
            hero={
              <View testID="document-detail-hero" className="flex-row">
                <View testID="document-detail-photo">
                  <Image
                    testID="document-detail-image"
                    source={credentialImages.transcript}
                    className="h-[112px] w-[88px] rounded-lg"
                    resizeMode="cover"
                    accessibilityLabel={display.title}
                  />
                </View>
                <View className="ml-4 min-w-0 flex-1 justify-center gap-0.5">
                  <Text className="text-[10px] leading-[14px] text-blue-gray">
                    ชื่อ - นามสกุล / Name
                  </Text>
                  <Text
                    testID="document-detail-name"
                    className="text-[14px] font-bold leading-5 text-wallet-navy"
                  >
                    {primaryName || EMPTY_VALUE}
                  </Text>
                  <Text
                    testID="document-detail-name-en"
                    className="text-[12px] leading-4 font-semibold text-wallet-navy"
                  >
                    {secondaryName || EMPTY_VALUE}
                  </Text>
                  <Text className="mt-2 text-[10px] leading-[14px] text-blue-gray">
                    วันเกิด / Date of Birth
                  </Text>
                  <Text className="text-[13px] font-bold leading-[18px] text-wallet-navy">
                    {formatThaiDate(birthDateValue) || EMPTY_VALUE}
                  </Text>
                </View>
              </View>
            }
            leftColumn={
              <View testID="document-detail-left-column" className="gap-3">
                <DocumentCardDetailValue
                  label="เลขประจำตัวนิสิต"
                  value={studentId?.value}
                />
                <DocumentCardDetailValue label="คณะ" value={faculty?.value} />
                <DocumentCardDetailValue label="สาขาวิชา" value={major?.value} />
              </View>
            }
            rightColumn={
              <View testID="document-detail-right-column" className="gap-3">
                <DocumentCardDetailValue label="Cumulative GPA" value={gpa?.value} />
                <DocumentCardDetailValue
                  label="Graduation Year"
                  value={graduationYear?.value}
                />
                <DocumentCardDetailValue
                  label="วันหมดอายุ / Expiry Date"
                  value={expiryValue}
                  expiry
                />
              </View>
            }
          />
        </View>
      </DocumentCardShell>
      <DocumentActionRow
        onOpenQr={onOpenQr}
        onPresentViaNfc={onPresentViaNfc}
        className="mt-[10px] justify-end"
      />
    </View>
  );
}

function IdCardDocumentDetailCard({
  display,
  record,
  onOpenQr,
  onPresentViaNfc,
  holderProfile,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
  bannerAction,
}: Props) {
  const rows = [...display.primaryRows, ...display.extraRows];
  const idNumber = findRow(
    rows,
    ["nationalId", "idNumber", "id_number"],
    /id|เลข|บัตร/i,
  );
  const birthDate = findRow(
    rows,
    ["birthDate", "birthdate", "dateOfBirth", "dob"],
    /birth|dob|เกิด/i,
  );
  const religion = findRow(rows, ["religion"], /religion|ศาสนา/i);
  const address = findRow(
    rows,
    ["address", "registeredAddress", "registered_address"],
    /address|ที่อยู่/i,
  );
  const issueDate = findRow(
    rows,
    ["issuanceDate", "issued", "issueDate", "issue_date"],
    /issue|ออกบัตร|อนุญาต/i,
  );
  const expiryDate = findRow(
    rows,
    ["expiryDate", "expirationDate", "expiry_date"],
    /expir|หมดอายุ/i,
  );
  const expiryValue =
    formatThaiDate(expiryDate?.value) ?? formatThaiDate(display.expiresAt);
  const thaiName = holderProfile?.thaiName || display.primaryText;
  const englishName = holderProfile?.englishName || MOCK_ID_CARD_ENGLISH_NAME;
  const birthDateValue = birthDate?.value ?? holderProfile?.birthDate;

  return (
    <View>
      <DocumentCardShell
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        record={record}
      >
        <View testID="document-detail-card">
          <DocumentCardLayout
            primaryColor={display.primaryColor || THEME.navyRoyal}
            bannerAction={bannerAction}
            columnsClassName={readRibbonColumnsClassName(
              inactiveState,
              renewalState,
            )}
            banner={
              <Text
                testID="document-detail-band"
                className="text-[15px] font-extrabold tracking-[1.5px] text-white"
              >
                ID CARD
              </Text>
            }
            hero={
              <View testID="document-detail-hero" className="flex-row">
                <View testID="document-detail-photo">
                  <Image
                    testID="document-detail-image"
                    source={credentialImages.id}
                    className="h-[112px] w-[88px] rounded-lg"
                    resizeMode="cover"
                    accessibilityLabel={display.title}
                  />
                </View>
                <View className="ml-4 min-w-0 flex-1 justify-center gap-0.5">
                  <Text className="text-[10px] leading-[14px] text-blue-gray">
                    ชื่อ - นามสกุล
                  </Text>
                  <Text
                    testID="document-detail-name"
                    className="text-[14px] font-bold leading-5 text-wallet-navy"
                  >
                    {thaiName && thaiName !== display.title
                      ? thaiName
                      : EMPTY_VALUE}
                  </Text>
                  <Text
                    testID="document-detail-name-en"
                    className="text-[12px] leading-4 font-semibold text-wallet-navy"
                  >
                    {englishName || EMPTY_VALUE}
                  </Text>
                  <Text className="mt-2 text-[10px] leading-[14px] text-blue-gray">
                    เลขบัตรประจำตัวประชาชน
                  </Text>
                  <Text
                    testID="document-detail-primary-id"
                    className="text-[13px] font-bold leading-[18px] text-wallet-navy"
                  >
                    {idNumber?.value || EMPTY_VALUE}
                  </Text>
                </View>
              </View>
            }
            leftColumn={
              <View testID="document-detail-left-column" className="gap-3">
                <DocumentCardDetailValue
                  label="วันเดือนปีเกิด"
                  value={formatThaiDate(birthDateValue)}
                />
                <DocumentCardDetailValue
                  label="ที่อยู่ตามทะเบียนบ้าน"
                  value={address?.value || MOCK_ID_CARD_ADDRESS}
                />
              </View>
            }
            rightColumn={
              <View testID="document-detail-right-column" className="gap-3">
                <DocumentCardDetailValue
                  label="ศาสนา"
                  value={religion?.value || MOCK_ID_CARD_RELIGION}
                />
                <DocumentCardDetailValue
                  label="วันอนุญาต / Issue Date"
                  value={formatThaiDate(issueDate?.value)}
                />
                <DocumentCardDetailValue
                  label="วันหมดอายุ / Expiry Date"
                  value={expiryValue}
                  expiry
                />
              </View>
            }
          />
        </View>
      </DocumentCardShell>
      <DocumentActionRow
        onOpenQr={onOpenQr}
        onPresentViaNfc={onPresentViaNfc}
        className="mt-[10px] justify-end"
      />
    </View>
  );
}

function DrivingLicenceDocumentDetailCard({
  record,
  onOpenQr,
  onPresentViaNfc,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
  bannerAction,
}: Props) {
  if (!record) return null;

  return (
    <View>
      <DocumentCardShell
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        record={record}
      >
        <DrivingLicenceDocumentCard record={record} bannerAction={bannerAction} />
      </DocumentCardShell>

      <DocumentActionRow
        onOpenQr={onOpenQr}
        onPresentViaNfc={onPresentViaNfc}
        className="mt-[10px] justify-end"
      />
    </View>
  );
}

export function CredentialDocumentDetailCard({
  display,
  record,
  onOpenQr,
  onPresentViaNfc,
  holderProfile,
  inactiveState,
  renewalBadgeLabel,
  renewalState,
  bannerAction,
}: Props) {
  const presentmentBlocked = shouldBlockCredentialDetailPresentment(
    inactiveState ?? { kind: "active" },
    record,
  );
  const openQr = presentmentBlocked ? undefined : onOpenQr;
  const presentNfc = presentmentBlocked ? undefined : onPresentViaNfc;

  if (display.imageKey === "transcript") {
    return (
      <TranscriptDocumentDetailCard
        display={display}
        record={record}
        onOpenQr={openQr}
        onPresentViaNfc={presentNfc}
        holderProfile={holderProfile}
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        bannerAction={bannerAction}
      />
    );
  }
  if (display.imageKey === "id") {
    return (
      <IdCardDocumentDetailCard
        display={display}
        record={record}
        onOpenQr={openQr}
        onPresentViaNfc={presentNfc}
        holderProfile={holderProfile}
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        bannerAction={bannerAction}
      />
    );
  }
  if (display.imageKey === "car") {
    return (
      <DrivingLicenceDocumentDetailCard
        display={display}
        record={record}
        onOpenQr={openQr}
        onPresentViaNfc={presentNfc}
        holderProfile={holderProfile}
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        bannerAction={bannerAction}
      />
    );
  }

  const primaryId = pickPrimaryId(display.primaryRows);
  const isPortraitArtwork = display.imageKey === "profile";
  const detailRows = [...display.primaryRows, ...display.extraRows].filter(
    (row) => {
      if (NAME_ROW_KEYS.has(row.key)) return false;
      if (primaryId && row.key === primaryId.key) return false;
      return true;
    },
  );
  const [leftRows, rightRows] = splitRows(detailRows);

  return (
    <View>
      <DocumentCardShell
        inactiveState={inactiveState}
        renewalBadgeLabel={renewalBadgeLabel}
        renewalState={renewalState}
        record={record}
      >
        <View
          testID="document-detail-card"
          className="rounded-2xl bg-white"
          style={{
            elevation: 4,
            shadowColor: THEME.navyShadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
          }}
        >
          <View
            testID="document-detail-band-wrap"
            className="min-h-[48px] w-full flex-row items-center px-4 py-[11px]"
            style={{
              alignSelf: "stretch",
              backgroundColor: display.primaryColor || THEME.navyRoyal,
              minHeight: 48,
              width: "100%",
            }}
          >
            <Text
              testID="document-detail-band"
              className="min-w-0 flex-1 text-[15px] font-extrabold leading-6 tracking-[1.5px] text-white"
              style={{ lineHeight: 24 }}
            >
              {display.documentTitle}
            </Text>
            {bannerAction ? (
              <View className="ml-2 shrink-0">{bannerAction}</View>
            ) : null}
          </View>

          <View
            testID="document-detail-hero"
            className="h-[148px] flex-row border-b border-surface-blue"
          >
            <View
              testID="document-detail-photo"
              className="w-[120px] shrink-0 items-center justify-center overflow-hidden bg-white"
            >
              <Image
                testID="document-detail-image"
                source={credentialImages[display.imageKey]}
                className={
                  isPortraitArtwork ? "h-full w-full" : "h-[82px] w-[82px]"
                }
                resizeMode={isPortraitArtwork ? "cover" : "contain"}
                accessibilityLabel={display.title}
              />
            </View>

            <View className="flex-1 justify-center gap-[3px] p-3">
              <Text className="text-[10.5px] font-medium leading-[14px] text-blue-gray">
                Name
              </Text>
              <Text
                testID="document-detail-name"
                className="text-[15px] font-bold leading-5 text-wallet-navy"
              >
                {display.primaryText}
              </Text>
              <Text className="mb-[6px] text-[10.5px] text-blue-gray">
                {display.title}
              </Text>

              {primaryId ? (
                <>
                  <Text className="text-[10.5px] font-medium leading-[14px] text-blue-gray">
                    {primaryId.label}
                  </Text>
                  <Text
                    testID="document-detail-primary-id"
                    className="text-sm font-extrabold leading-[18px] tracking-[0.4px] text-wallet-navy"
                  >
                    {primaryId.value}
                  </Text>
                </>
              ) : null}
            </View>
          </View>

          <View className="flex-row">
            <View
              testID="document-detail-left-column"
              className="flex-1 border-r border-surface-blue px-3 py-[10px]"
            >
              {leftRows.map((row) => (
                <DetailValue key={row.key} row={row} />
              ))}
            </View>
            <View
              testID="document-detail-right-column"
              className="flex-1 px-3 py-[10px]"
            >
              {rightRows.map((row) => (
                <DetailValue key={row.key} row={row} />
              ))}
            </View>
          </View>
        </View>
      </DocumentCardShell>

      <DocumentActionRow
        onOpenQr={openQr}
        onPresentViaNfc={presentNfc}
        className="mt-[10px] justify-end"
      />
    </View>
  );
}
