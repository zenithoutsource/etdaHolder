import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard';
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials';
import type { VerifiableCredentialRecord } from '../../src/services/vci/exchangeService';

type DocumentMenuItem = {
  label: string;
  icon: ImageSourcePropType;
  iconStyle: { width: number; height: number };
  credentialType?: string;
};

const documentMenuItems: DocumentMenuItem[] = [
  {
    label: 'ID Card',
    icon: require('../../assets/images/profile.png'),
    iconStyle: { width: 41, height: 27 },
    credentialType: 'ThaiNationalID',
  },
  {
    label: 'Driving License',
    icon: require('../../assets/images/car.png'),
    iconStyle: { width: 40, height: 40 },
    credentialType: 'DLTDrivingLicence',
  },
  {
    label: 'Transcript',
    icon: require('../../assets/images/transcript.png'),
    iconStyle: { width: 40, height: 40 },
    credentialType: 'BangkokUniversityTranscript',
  },
  {
    label: 'Medical certificate',
    icon: require('../../assets/images/doctor_bag.png'),
    iconStyle: { width: 40, height: 40 },
  },
];

function readClaimText(claims: Record<string, unknown>, key: string): string | undefined {
  const value = claims[key];
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function readFirstClaimText(claims: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readClaimText(claims, key);
    if (value) return value;
  }
  return undefined;
}

function getHolderName(record: VerifiableCredentialRecord): string {
  return [
    readFirstClaimText(record.claims, ['givenName', 'given_name', 'firstName', 'first_name']),
    readFirstClaimText(record.claims, ['familyName', 'family_name', 'lastName', 'last_name']),
  ]
    .filter(Boolean)
    .join(' ');
}

function CredentialSummaryCard({ record }: { record: VerifiableCredentialRecord }) {
  if (record.type === 'ThaiNationalID') {
    const holderName = getHolderName(record);
    const nationalId = readFirstClaimText(record.claims, ['nationalId', 'national_id', 'idNumber', 'id_number']);

    return (
      <View
        className="flex-row items-center gap-[18px] overflow-hidden rounded-[18px] bg-wallet-card p-5"
        style={{
          elevation: 5,
          shadowColor: '#0f2849',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.13,
          shadowRadius: 10,
        }}>
        <Image
          source={require('../../assets/images/user_profile.png')}
          style={{ width: 120, height: 141 }}
          resizeMode="cover"
          accessibilityLabel="Holder profile"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold leading-snug text-white">{holderName || 'Holder'}</Text>
          <Text className="mt-1.5 text-[13px] text-white/65">ID card : {nationalId ?? '-'}</Text>
        </View>
      </View>
    );
  }

  const holderName = getHolderName(record);
  const studentId = readFirstClaimText(record.claims, [
    'studentId',
    'student_id',
    'studentID',
    'student_number',
    'studentNumber',
  ]);
  const degree = readFirstClaimText(record.claims, ['degree', 'degreeName', 'degree_name', 'program', 'programName']);
  const faculty = readFirstClaimText(record.claims, ['faculty', 'facultyName', 'faculty_name', 'school', 'schoolName']);
  const gpa = readFirstClaimText(record.claims, ['gpa', 'GPA', 'gradePointAverage', 'grade_point_average']);

  return (
    <View
      className="h-[181px] justify-between overflow-hidden rounded-[18px] bg-wallet-card p-5"
      style={{
        elevation: 5,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.13,
        shadowRadius: 10,
      }}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-white/70">Academic Transcript</Text>
          <Text className="mt-2 text-xl font-semibold leading-6 text-white">{holderName || 'Student'}</Text>
          <Text className="mt-1 text-[13px] text-white/70">Student ID : {studentId ?? '-'}</Text>
        </View>
        <Image source={require('../../assets/images/transcript.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
      </View>
      <View>
        <Text className="text-[13px] font-medium text-white">{degree ?? 'Transcript Credential'}</Text>
        <Text className="mt-1 text-[12px] text-white/65">
          {[faculty, gpa ? `GPA ${gpa}` : undefined].filter(Boolean).join(' • ') || 'Bangkok University'}
        </Text>
      </View>
    </View>
  );
}

function EmptyCredentialCard() {
  return (
    <View
      className="h-[181px] justify-center rounded-[18px] bg-white px-5"
      style={{
        elevation: 5,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      }}>
      <Text className="text-center text-base font-semibold leading-6 text-[#1a2a42]">
        ยังไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet
      </Text>
    </View>
  );
}

export default function WalletHomeScreen() {
  useScreenCaptureGuard();
  const { credentials, error } = useStoredCredentials();
  const router = useRouter();
  const summaryCredential =
    credentials.find((record) => record.type === 'ThaiNationalID') ??
    credentials.find((record) => record.type === 'BangkokUniversityTranscript') ??
    credentials[0];

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <View className="bg-wallet-navy px-6 pb-5 pt-1.5">
        <Text className="text-center text-2xl font-semibold tracking-wide text-white">Wallet</Text>
      </View>

      <View className="flex-1 bg-wallet-bg">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3.5 px-4 pb-24 pt-5"
          showsVerticalScrollIndicator={false}>
        {summaryCredential ? <CredentialSummaryCard record={summaryCredential} /> : <EmptyCredentialCard />}

        {error ? (
          <View className="rounded-[14px] bg-red-50 px-5 py-4">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        ) : null}

        <View className="gap-2.5">
          {documentMenuItems.map((item) => {
            const credential = item.credentialType
              ? credentials.find((record) => record.type === item.credentialType)
              : undefined;

            return (
              <Pressable
                key={item.label}
                className="flex-row items-center gap-3.5 rounded-[14px] bg-white px-[18px] py-4"
                onPress={() => {
                  if (credential) {
                    router.push({ pathname: '/(tabs)/credential/[id]', params: { id: credential.id } });
                  }
                }}
                style={{
                  elevation: 2,
                  shadowColor: '#0f2849',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 12,
                }}>
                <View className="h-11 w-11 items-center justify-center">
                  <Image source={item.icon} style={item.iconStyle} resizeMode="contain" />
                </View>
                <Text className="min-w-0 flex-1 text-base font-medium text-[#1a2a42]">{item.label}</Text>
                {credential ? (
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#6d7a8d" />
                ) : (
                  <View className="rounded-full bg-wallet-navy px-3.5 py-1.5">
                    <Text className="text-[13px] font-medium text-white">ขอเอกสาร</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
