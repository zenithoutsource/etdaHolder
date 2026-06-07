import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCardSchema, type DisplayField } from '../../../src/config/cardSchemas';
import { useScreenCaptureGuard } from '../../../src/hooks/useScreenCaptureGuard';
import { useStoredCredentials } from '../../../src/hooks/useStoredCredentials';
import type { VerifiableCredentialRecord } from '../../../src/services/vci/exchangeService';

type DetailRow = {
  key: string;
  label: string;
  value: unknown;
};

const HIDDEN_CLAIM_KEYS = new Set(['vc', 'iss', 'iat', 'nbf', 'exp', 'jti', 'vct', 'cnf', 'status']);

function stringifyClaim(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function readClaimValue(claims: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = claims[key];
    if (value !== undefined && value !== null && stringifyClaim(value).trim().length > 0) return value;
  }
  return undefined;
}

function readDisplayValue(claims: Record<string, unknown>, field: DisplayField): unknown {
  return readClaimValue(claims, [field.key, ...(field.aliases ?? [])]);
}

function getHolderName(record: VerifiableCredentialRecord): string {
  return [
    stringifyClaim(readClaimValue(record.claims, ['givenName', 'given_name', 'firstName', 'first_name'])),
    stringifyClaim(readClaimValue(record.claims, ['familyName', 'family_name', 'lastName', 'last_name'])),
  ]
    .filter(Boolean)
    .join(' ');
}

function getCardTitle(type: string): string {
  if (type === 'ThaiNationalID') return 'ID CARD';
  if (type === 'BangkokUniversityTranscript') return 'TRANSCRIPT';
  if (type === 'DLTDrivingLicence') return 'DRIVING LICENSE';
  return 'DIGITAL DOCUMENT';
}

function getHeroImage(type: string): ImageSourcePropType {
  if (type === 'ThaiNationalID') return require('../../../assets/images/user_profile.png');
  if (type === 'BangkokUniversityTranscript') return require('../../../assets/images/transcript.png');
  if (type === 'DLTDrivingLicence') return require('../../../assets/images/car.png');
  return require('../../../assets/images/profile.png');
}

function buildRows(record: VerifiableCredentialRecord, displayFields: DisplayField[]): DetailRow[] {
  if (record.type === 'ThaiNationalID') {
    return [
      {
        key: 'nationalId',
        label: 'National ID Number',
        value: readClaimValue(record.claims, ['nationalId', 'national_id', 'idNumber', 'id_number']),
      },
      { key: 'name', label: 'Name', value: getHolderName(record) },
      { key: 'birthDate', label: 'Date of Birth', value: readClaimValue(record.claims, ['birthDate', 'birth_date', 'dob']) },
      { key: 'branch', label: 'Branch', value: readClaimValue(record.claims, ['branch', 'office', 'issuerBranch']) },
      { key: 'address', label: 'Registered Address', value: readClaimValue(record.claims, ['address', 'registeredAddress']) },
    ];
  }

  if (record.type === 'BangkokUniversityTranscript') {
    return [
      {
        key: 'studentId',
        label: 'Student ID',
        value: readClaimValue(record.claims, ['studentId', 'student_id', 'studentID', 'student_number', 'studentNumber']),
      },
      { key: 'name', label: 'Name', value: getHolderName(record) },
      {
        key: 'degree',
        label: 'Degree',
        value: readClaimValue(record.claims, ['degree', 'degreeName', 'degree_name', 'program', 'programName']),
      },
      {
        key: 'faculty',
        label: 'Faculty',
        value: readClaimValue(record.claims, ['faculty', 'facultyName', 'faculty_name', 'school', 'schoolName']),
      },
      { key: 'gpa', label: 'GPA', value: readClaimValue(record.claims, ['gpa', 'GPA', 'gradePointAverage', 'grade_point_average']) },
    ];
  }

  if (record.type === 'DLTDrivingLicence') {
    return [
      {
        key: 'licenceNumber',
        label: 'Licence Number',
        value: readClaimValue(record.claims, ['licenceNumber', 'licence_number', 'licenseNumber', 'license_number']),
      },
      { key: 'name', label: 'Name', value: getHolderName(record) },
      {
        key: 'licenceClass',
        label: 'Class',
        value: readClaimValue(record.claims, ['licenceClass', 'licence_class', 'licenseClass', 'license_class']),
      },
      {
        key: 'expiryDate',
        label: 'Expiry Date',
        value: readClaimValue(record.claims, ['expiryDate', 'expiry_date', 'expirationDate']),
      },
    ];
  }

  return displayFields.map((field) => ({
    key: field.key,
    label: field.label,
    value: readDisplayValue(record.claims, field),
  }));
}

function getExtraRows(record: VerifiableCredentialRecord, displayFields: DisplayField[]): DetailRow[] {
  const configuredKeys = new Set(displayFields.flatMap((field) => [field.key, ...(field.aliases ?? [])]));
  return Object.entries(record.claims)
    .filter(([key, value]) => {
      if (configuredKeys.has(key) || key.startsWith('_') || HIDDEN_CLAIM_KEYS.has(key)) return false;
      return stringifyClaim(value).trim().length > 0;
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, label: key, value }));
}

function ClaimRow({ label, value }: { label: string; value: unknown }) {
  const text = stringifyClaim(value);
  if (!text) return null;

  return (
    <View className="border-b border-[#e5e7eb] py-3">
      <Text className="text-[12px] leading-4 text-[#9aa1ad]">{label}</Text>
      <Text className="mt-1 text-[13px] font-semibold leading-5 text-[#071f5f]">{text}</Text>
    </View>
  );
}

export default function CredentialDetailScreen() {
  useScreenCaptureGuard();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { credentials, error } = useStoredCredentials();
  const credential = credentials.find((record) => record.id === id);
  const schema = getCardSchema(credential?.type ?? '');
  const primaryRows = credential ? buildRows(credential, schema.displayFields) : [];
  const extraRows = credential ? getExtraRows(credential, schema.displayFields) : [];

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <View className="h-[70px] flex-row items-center bg-wallet-navy px-4">
        <Pressable
          className="h-9 w-9 items-center justify-center rounded-full border border-white"
          onPress={() => router.back()}
          accessibilityLabel="Back">
          <MaterialCommunityIcons name="chevron-left" size={28} color="#ffffff" />
        </Pressable>
        <Text className="min-w-0 flex-1 pr-9 text-center text-xl font-semibold text-white">Wallet</Text>
      </View>

      <View className="flex-1 bg-[#eef1f4]">
        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8 pt-6" showsVerticalScrollIndicator={false}>
          {credential ? (
            <View className="overflow-hidden rounded-[8px] bg-white">
              <View className="bg-[#123b8c] px-5 py-3">
                <Text className="text-[13px] font-bold text-white">{getCardTitle(credential.type)}</Text>
              </View>

              <View className="px-7 pb-6 pt-7">
                <View className="items-center">
                  <Image
                    source={getHeroImage(credential.type)}
                    style={{
                      height: credential.type === 'ThaiNationalID' ? 104 : 78,
                      width: credential.type === 'ThaiNationalID' ? 92 : 78,
                    }}
                    resizeMode="contain"
                    accessibilityLabel={schema.title}
                  />
                </View>

                <View className="mt-5">
                  {primaryRows.map((row) => (
                    <ClaimRow key={row.key} label={row.label} value={row.value} />
                  ))}
                  {extraRows.map((row) => (
                    <ClaimRow key={row.key} label={row.label} value={row.value} />
                  ))}
                </View>
              </View>
            </View>
          ) : (
            <View className="rounded-[8px] bg-white px-5 py-6">
              <Text className="text-center text-base font-semibold text-[#1a2a42]">
                No digital card or document found in Wallet.
              </Text>
              {error ? <Text className="mt-3 text-center text-sm text-red-600">{error}</Text> : null}
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
