import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppDialog } from "../../src/components/AppDialog";
import { WalletHeader } from "../../src/components/WalletHeader";
import { useStoredCredentials } from "../../src/hooks/useStoredCredentials";
import {
  clearNewCredentialBadge,
  readNewCredentialBadgeIds,
} from "../../src/services/credentials/credentialBadges";
import { canRequestCredentialType } from "../../src/services/credentials/credentialGuard";
import { readCredentialLifecycleStatuses } from "../../src/services/credentials/credentialLifecycle";
import {
  readCredentialHolderProfile,
  readCredentialSummaryDisplay,
} from "../../src/services/credentials/credentialDisplay";
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
  const profile = readCredentialHolderProfile(record);
  const idNumber = display.rows.find((row) => row.key === "nationalId")?.value;
  const holderName =
    profile.thaiName ?? profile.englishName ?? display.primaryText;

  return (
    <View
      className="h-[202px] justify-center overflow-hidden rounded-[18px] bg-[#003064] px-6"
      style={{
        elevation: 5,
        shadowColor: "#0f2849",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.13,
        shadowRadius: 10,
      }}
    >
      <View className="flex-row items-center gap-6">
        <Image
          source={credentialImages[display.imageKey]}
          style={{ width: 110, height: 140, borderRadius: 30 }}
          resizeMode="cover"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] leading-6 text-white" numberOfLines={2}>
            {holderName}
          </Text>
          <Text
            className="mt-2 text-[12px] leading-5 text-white"
            numberOfLines={2}
          >
            ID Card : {idNumber}
          </Text>
        </View>
      </View>
      {/*
            .join(" • ") || display.issuerName}
      */}
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
      <Text className="text-center text-base font-semibold leading-6 text-gray-400">
        ไม่มีบัตรหรือเอกสารดิจิทัลใน Wallet
      </Text>
    </View>
  );
}

export default function WalletHomeScreen() {
  const { credentials, error } = useStoredCredentials();
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const [expandedCredentialId, setExpandedCredentialId] = useState<
    string | null
  >(null);
  const [newCredentialIds, setNewCredentialIds] = useState<string[]>([]);
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const summaryCredential = credentials.find(
    (record) => record.type === "ThaiNationalID",
  );

  useFocusEffect(
    useCallback(() => {
      setNewCredentialIds(readNewCredentialBadgeIds());
    }, []),
  );

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={["top"]}>
      <WalletHeader />

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
              const isNewCredential = credential
                ? newCredentialIds.includes(credential.id)
                : false;
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
                : isNewCredential
                  ? {
                      label: "เอกสารใหม่",
                      className: "bg-[#18a05d]",
                    }
                  : undefined;

              return (
                <View
                  key={item.label}
                  className={`relative mt-1 rounded-[14px] ${isExpanded ? "bg-[#e2e2e2] px-[18px] pb-4 pt-4" : "bg-white px-[18px] py-4"}`}
                  style={{
                    elevation: 2,
                    shadowColor: "#0f2849",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                  }}
                >
                  {badge ? (
                    <View
                      className={`absolute -top-2 right-4 z-10 rounded-full px-3 py-1 ${badge.className}`}
                    >
                      <Text className="text-[11px] font-semibold text-white">
                        {badge.label}
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    className="flex-row items-center gap-3.5 pt-3 pb-3 pr-4"
                    onPress={() => {
                      if (!credential) {
                        if (
                          canRequestCredentialType(
                            item.credentialType,
                            credentials,
                          )
                        ) {
                          router.push("/(tabs)/scan");
                          return;
                        }
                        showDialog({
                          title: "ต้องมี ThaID ก่อน",
                          message: "กรุณาขอ ThaID ก่อนขอเอกสารอื่น",
                          icon: "warning",
                          actions: [
                            { label: "ยกเลิก", variant: "secondary" },
                            {
                              label: "ขอ ThaID",
                              onPress: () => router.push("/(tabs)/scan"),
                            },
                          ],
                        });
                        return;
                      }
                      if (isNewCredential) {
                        clearNewCredentialBadge(credential.id);
                        setNewCredentialIds((current) =>
                          current.filter((id) => id !== credential.id),
                        );
                      }
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
                    {credential && !isExpanded ? (
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={24}
                        color="#6d7a8d"
                      />
                    ) : !credential ? (
                      <View className="rounded-full bg-wallet-navy px-3.5 py-1.5">
                        <Text className="text-[13px] font-medium text-white">
                          ขอเอกสาร
                        </Text>
                      </View>
                    ) : null}
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
