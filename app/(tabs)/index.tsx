import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useStoredCredentials } from "../../src/hooks/useStoredCredentials";
import { readCredentialLifecycleStatuses } from "../../src/services/credentials/credentialLifecycle";
import { readCredentialSummaryDisplay } from "../../src/services/credentials/credentialDisplay";
import type { VerifiableCredentialRecord } from "../../src/services/vci/exchangeService";

type DocumentMenuItem = {
  label: string;
  icon: ImageSourcePropType;
  iconStyle: { width: number; height: number };
  credentialType?: string;
};

type LifecycleBadge = {
  label: string;
  className: string;
};

const documentMenuItems: DocumentMenuItem[] = [
  {
    label: "ID Card",
    icon: require("../../assets/images/profile.png"),
    iconStyle: { width: 41, height: 27 },
    credentialType: "ThaiNationalID",
  },
  {
    label: "Driving License",
    icon: require("../../assets/images/car.png"),
    iconStyle: { width: 40, height: 40 },
    credentialType: "DLTDrivingLicence",
  },
  {
    label: "Transcript",
    icon: require("../../assets/images/transcript.png"),
    iconStyle: { width: 40, height: 40 },
    credentialType: "BangkokUniversityTranscript",
  },
  {
    label: "Medical certificate",
    icon: require("../../assets/images/doctor_bag.png"),
    iconStyle: { width: 40, height: 40 },
  },
];

const credentialImages: Record<string, ImageSourcePropType> = {
  profile: require("../../assets/images/profile.png"),
  id: require("../../assets/images/user_profile.png"),
  car: require("../../assets/images/car.png"),
  transcript: require("../../assets/images/transcript.png"),
};

function CredentialSummaryCard({
  record,
}: {
  record: VerifiableCredentialRecord;
}) {
  const display = readCredentialSummaryDisplay(record);
  const [primaryRow, ...secondaryRows] = display.rows;

  return (
    <View
      className="h-[181px] justify-between overflow-hidden rounded-[18px] bg-wallet-card p-5"
      style={{
        elevation: 5,
        shadowColor: "#0f2849",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.13,
        shadowRadius: 10,
      }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-white/70">
            {display.title}
          </Text>
          <Text className="mt-2 text-xl font-semibold leading-6 text-white">
            {display.primaryText}
          </Text>
          {primaryRow ? (
            <Text className="mt-1 text-[13px] text-white/70">
              {primaryRow.label} : {primaryRow.value}
            </Text>
          ) : null}
        </View>
        <Image
          source={credentialImages[display.imageKey]}
          style={{ width: 54, height: 54 }}
          resizeMode="contain"
        />
      </View>

      <View>
        <Text className="text-[13px] font-medium text-white">
          {secondaryRows[0]?.value ?? display.documentTitle}
        </Text>
        <Text className="mt-1 text-[12px] text-white/65">
          {secondaryRows
            .slice(1)
            .map((row) => `${row.label} ${row.value}`)
            .join(" • ") || display.issuerName}
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
        shadowColor: "#0f2849",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      }}
    >
      <Text className="text-center text-base font-semibold leading-6 text-[#1a2a42]">
        ไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet
      </Text>
    </View>
  );
}

export default function WalletHomeScreen() {
  const { credentials, error } = useStoredCredentials();
  const router = useRouter();
  const [expandedCredentialId, setExpandedCredentialId] = useState<
    string | null
  >(null);
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const summaryCredential =
    credentials.find((record) => record.type === "ThaiNationalID") ??
    credentials.find(
      (record) => record.type === "BangkokUniversityTranscript",
    ) ??
    credentials[0];

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
      <View className="bg-wallet-navy px-6 pb-5 pt-1.5">
        <Text className="text-center text-2xl font-semibold tracking-wide text-white">
          Wallet
        </Text>
      </View>

      <View className="flex-1 bg-wallet-bg">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-3.5 px-4 pb-24 pt-5"
          showsVerticalScrollIndicator={false}
        >
          {summaryCredential ? (
            <CredentialSummaryCard record={summaryCredential} />
          ) : (
            <EmptyCredentialCard />
          )}

          {error ? (
            <View className="rounded-[14px] bg-red-50 px-5 py-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          <View className="gap-2.5">
            {documentMenuItems.map((item) => {
              const credential = item.credentialType
                ? credentials.find(
                    (record) => record.type === item.credentialType,
                  )
                : undefined;
              const lifecycleStatus = credential
                ? lifecycleStatuses[credential.id]
                : undefined;
              const isExpanded =
                credential?.id === expandedCredentialId &&
                Boolean(lifecycleStatus);
              const badge: LifecycleBadge | undefined = lifecycleStatus
                ? {
                    label:
                      lifecycleStatus.action === "Revoke"
                        ? "ถูกระงับ"
                        : "ถูกลบ",
                    className:
                      lifecycleStatus.action === "Revoke"
                        ? "bg-[#c00000]"
                        : "bg-[#7a7a7a]",
                  }
                : undefined;

              return (
                <View
                  key={item.label}
                  className={`rounded-[14px] ${isExpanded ? "bg-[#e2e2e2] px-[18px] pb-4 pt-4" : "bg-white px-[18px] py-4"}`}
                  style={{
                    elevation: 2,
                    shadowColor: "#0f2849",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                  }}
                >
                  <Pressable
                    className="flex-row items-center gap-3.5"
                    onPress={() => {
                      if (!credential) return;
                      if (lifecycleStatus) {
                        setExpandedCredentialId((current) =>
                          current === credential.id ? null : credential.id,
                        );
                        return;
                      }
                      router.push({
                        pathname: "/(tabs)/credential/[id]",
                        params: { id: credential.id },
                      });
                    }}
                  >
                    <View className="h-11 w-11 items-center justify-center">
                      <Image
                        source={item.icon}
                        style={item.iconStyle}
                        resizeMode="contain"
                      />
                    </View>
                    <Text className="min-w-0 flex-1 text-base font-medium text-[#1a2a42]">
                      {item.label}
                    </Text>
                    {credential ? (
                      <>
                        {badge ? (
                          <View
                            className={`rounded-full px-3 py-1 ${badge.className}`}
                          >
                            <Text className="text-[11px] font-semibold text-white">
                              {badge.label}
                            </Text>
                          </View>
                        ) : null}
                        {!isExpanded ? (
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={24}
                            color="#6d7a8d"
                          />
                        ) : null}
                      </>
                    ) : (
                      <View className="rounded-full bg-wallet-navy px-3.5 py-1.5">
                        <Text className="text-[13px] font-medium text-white">
                          ขอเอกสาร
                        </Text>
                      </View>
                    )}
                  </Pressable>

                  {isExpanded ? (
                    <View className="items-center pt-3">
                      <View className="h-12 w-12 items-center justify-center rounded-full border-2 border-wallet-navy">
                        <MaterialCommunityIcons
                          name="lock-outline"
                          size={28}
                          color="#002887"
                        />
                      </View>
                      <Text className="mt-2 text-center text-xs text-[#4b5563]">
                        เอกสารถูกยกเลิกการใช้งาน
                      </Text>
                      <Pressable
                        className="mt-3 min-w-[142px] rounded-full bg-wallet-navy px-5 py-2"
                        onPress={() => router.push("/(tabs)/scan")}
                      >
                        <Text className="text-center text-xs font-bold text-white">
                          ขอเอกสาร
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
